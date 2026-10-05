
// Los datos viven en arreglos; despues se cambian por PostgreSQL.
const TARIFA_BASE = 450, COSTO_KM = 12;  // SUPUESTOS (no vienen en S1)
const KM_INCLUIDOS = 10, HORAS_SLA = 24, HORA = 3600000; // S1: 10 km incluidos, falla critica = 24 h habiles
const CASILLAS = ['lentes', 'voltaje', 'conectores', 'almacenamiento', 'grabacion', 'conexion_remota'];
const PERMISOS = {
  admin: ['crear', 'agendar', 'asignar', 'ver', 'reporte', 'rma', 'preventivo'],
  tecnico: ['ver', 'iniciar', 'checklist', 'finalizar', 'reporte'],
  cliente: ['crear', 'ver', 'reporte'],
};
const db = { usuarios: [], clientes: [], equipos: [], ordenes: [] };
let ahora = () => new Date();

const error = (mensaje) => { throw new Error(mensaje); };
const buscar = (lista, id) => lista.find((x) => x.id === id) || error('No existe: ' + id);
const permitir = (u, accion) => PERMISOS[u.rol].includes(accion) || error(`El perfil ${u.rol} no tiene permiso para: ${accion}`);
const ponerFecha = (f) => { ahora = () => f; };   // para simular fechas en demo y pruebas
const reiniciar = () => { Object.values(db).forEach((l) => { l.length = 0; }); ahora = () => new Date(); };

// ---------- reglas ----------
function esHabil(f) { // L-V 9:00-18:00 y sabado 9:00-14:00
  const h = f.getHours() + f.getMinutes() / 60, d = f.getDay();
  return d >= 1 && d <= 5 ? h >= 9 && h < 18 : d === 6 && h >= 9 && h < 14;
}
function sumarHorasHabiles(f, horas) {
  let n = 0;
  f = new Date(f);
  while (n < horas) { if (esHabil(f)) n++; f = new Date(+f + HORA); }
  return f;
}
function cotizar(km) { // hasta 10 km solo tarifa base; despues, cargo por traslado
  const extra = Math.max(0, Math.ceil(km - KM_INCLUIDOS));
  return { extra, traslado: extra * COSTO_KM, total: TARIFA_BASE + extra * COSTO_KM };
}
function semaforo(eqs) {
  const caidos = eqs.filter((e) => e.estado === 'Fuera de Servicio');
  if (caidos.some((e) => ['DVR', 'Disco'].includes(e.tipo)) || (eqs.length && caidos.length / eqs.length >= 0.5)) return 'Fuera de Servicio';
  return eqs.some((e) => e.estado !== 'Operando') ? 'Requiere Atencion' : 'Operativo';
}

// ---------- altas ----------
const alta = (lista, prefijo, datos) => { const x = { id: `${prefijo}-${lista.length + 1}`, ...datos }; lista.push(x); return x; };
const agregarUsuario = (nombre, rol, cliente = null) => alta(db.usuarios, 'USR', { nombre, rol, cliente });
const agregarCliente = (nombre, km) => alta(db.clientes, 'CLI', { nombre, km });
const agregarEquipo = (cliente, tipo, modelo) => alta(db.equipos, 'EQP', { cliente, tipo, modelo, estado: 'Operando' });

// ---------- ordenes ----------
function crearOrden(u, clienteId, tipo, desc, equipo = null) { 
  permitir(u, 'crear');
  if (u.rol === 'cliente' && u.cliente !== clienteId) error('Un cliente solo puede pedir servicio para su propio negocio');
  const cli = buscar(db.clientes, clienteId);
  const dup = db.ordenes.find((o) => o.cliente === clienteId && o.tipo === tipo && o.equipo === equipo && o.estado !== 'Finalizada');
  if (dup) error(`Ya existe una orden abierta similar (${dup.id})`);
  return alta(db.ordenes, 'OT', {
    cliente: clienteId, tipo, desc, equipo, estado: 'Pendiente', tecnico: null, fecha: null,
    limite: tipo === 'Falla Critica' ? sumarHorasHabiles(ahora(), HORAS_SLA) : null,
    cotizacion: cotizar(cli.km), check: null, reporte: null, fin: null,
  });
}
// una visita dura 2 horas: el tecnico no puede tener dos visitas empalmadas
const ocupado = (tec, fecha, id) => db.ordenes.some((o) => o.id !== id && o.tecnico === tec && o.estado !== 'Finalizada'
  && o.fecha && Math.abs(o.fecha - fecha) < 2 * HORA);

function agendar(u, id, fecha) {
  permitir(u, 'agendar');
  const o = buscar(db.ordenes, id);
  if (o.estado !== 'Pendiente') error('Solo se agendan ordenes Pendientes');
  if (fecha < ahora()) error('No se puede agendar en el pasado');
  if (!esHabil(fecha)) error('Fuera de horario: L-V 9:00-18:00 y sabado 9:00-14:00');
  if (o.limite && fecha > o.limite) error('La falla critica debe atenderse dentro de 24 horas habiles');
  if (o.tecnico && ocupado(o.tecnico, fecha, id)) error('El tecnico ya tiene una visita a esa hora');
  return Object.assign(o, { fecha });
}
function asignar(u, id, tecnico) {
  permitir(u, 'asignar');
  const o = buscar(db.ordenes, id), t = buscar(db.usuarios, tecnico);
  if (o.estado !== 'Pendiente' || t.rol !== 'tecnico') error('Solo se asignan tecnicos a ordenes Pendientes');
  if (o.fecha && ocupado(tecnico, o.fecha, id)) error('El tecnico ya tiene una visita a esa hora');
  return Object.assign(o, { tecnico });
}
function delTecnico(u, id, accion, estado) { 
  permitir(u, accion);
  const o = buscar(db.ordenes, id);
  if (o.tecnico !== u.id) error('Solo el tecnico asignado puede hacer esto');
  if (o.estado !== estado) error(`La orden debe estar ${estado} (los estados no se saltan ni regresan)`);
  return o;
}
function iniciar(u, id) { // Pendiente....En Proceso y se abre el checklist
  const o = delTecnico(u, id, 'iniciar', 'Pendiente');
  o.estado = 'En Proceso';
  o.check = { casillas: Object.fromEntries(CASILLAS.map((c) => [c, null])), fallas: [], obs: '' };
  return o;
}
function llenar(u, id, casilla, resultado, falla) { // resultado: OK o FALLA; falla = {equipo, desc, solucion, estado}
  const o = delTecnico(u, id, 'checklist', 'En Proceso');
  if (!CASILLAS.includes(casilla) || !['OK', 'FALLA'].includes(resultado)) error('Casilla o resultado invalido');
  if (resultado === 'FALLA') {
    if (!falla || !falla.desc || !falla.solucion) error('Una falla requiere descripcion y solucion');
    buscar(db.equipos, falla.equipo);
  }
  o.check.fallas = o.check.fallas.filter((f) => f.casilla !== casilla);
  if (resultado === 'FALLA') o.check.fallas.push({ ...falla, casilla });
  o.check.casillas[casilla] = resultado;
}
const observaciones = (u, id, texto) => { delTecnico(u, id, 'checklist', 'En Proceso').check.obs = texto; };

function finalizar(u, id) { // sin el 100% del checklist y las observaciones no se finaliza
  const o = delTecnico(u, id, 'finalizar', 'En Proceso'), { casillas, fallas, obs } = o.check;
  const faltan = CASILLAS.filter((c) => casillas[c] === null);
  if (!obs.trim()) faltan.push('observaciones');
  if (faltan.length) error('No se puede finalizar. Falta: ' + faltan.join(', '));
  db.equipos.filter((e) => (o.equipo ? e.id === o.equipo : e.cliente === o.cliente)).forEach((e) => { e.estado = 'Operando'; });
  fallas.forEach((f) => { buscar(db.equipos, f.equipo).estado = f.estado || 'Requiere Atencion'; });
  Object.assign(o, { estado: 'Finalizada', fin: ahora() });
  o.reporte = reporte(o);
  return o;
}
function reporte(o) {
  const eqs = db.equipos.filter((e) => e.cliente === o.cliente);
  return [`REPORTE - Orden ${o.id} | Cliente: ${buscar(db.clientes, o.cliente).nombre} | Tecnico: ${buscar(db.usuarios, o.tecnico).nombre}`,
    `Estado general: ${semaforo(eqs)}`, 'Checklist:', ...Object.entries(o.check.casillas).map(([c, r]) => `  ${c}: ${r}`),
    ...o.check.fallas.map((f) => `Incidencia (${f.casilla}): ${f.desc} | Solucion: ${f.solucion}`),
    ...eqs.map((e) => `Equipo ${e.id} ${e.tipo}: ${e.estado}`), `Observaciones: ${o.check.obs}`,
    `Costo de visita: $${o.cotizacion.total}`].join('\n');
}
function rma(u, equipoId, motivo) { 
  permitir(u, 'rma');
  return crearOrden(u, buscar(db.equipos, equipoId).cliente, 'Correctivo', 'RMA por garantia: ' + motivo, equipoId);
}
function programarPreventivo(u, id) { 
  permitir(u, 'preventivo');
  const base = buscar(db.ordenes, id);
  if (base.estado !== 'Finalizada') error('La orden debe estar Finalizada');
  const nueva = crearOrden(u, base.cliente, 'Preventivo', 'Mantenimiento preventivo programado');
  let f = new Date(base.fin);
  f.setMonth(f.getMonth() + 3); 
  f.setHours(9, 0, 0, 0);
  while (!esHabil(f)) f = new Date(+f + HORA);
  return Object.assign(nueva, { fecha: f });
}

// ---------- consultas ----------
const puedeVer = (u, o) => u.rol === 'admin' || (u.rol === 'tecnico' && o.tecnico === u.id) || (u.rol === 'cliente' && o.cliente === u.cliente);
const verOrdenes = (u) => { permitir(u, 'ver'); return db.ordenes.filter((o) => puedeVer(u, o)); };
function descargarReporte(u, id) {
  permitir(u, 'reporte');
  const o = buscar(db.ordenes, id);
  if (!puedeVer(u, o)) error('No tienes acceso al reporte de esta orden');
  return o.reporte || error('El reporte se genera hasta que la orden se finaliza');
}
function semaforoCliente(u, clienteId) {
  if (u.rol === 'cliente' && u.cliente !== clienteId) error('No puedes ver otro negocio');
  return semaforo(db.equipos.filter((e) => e.cliente === clienteId));
}

module.exports = {
  CASILLAS, ponerFecha, reiniciar, esHabil, sumarHorasHabiles, cotizar, semaforo, agregarUsuario, agregarCliente,
  agregarEquipo, crearOrden, agendar, asignar, iniciar, llenar, observaciones, finalizar, rma, programarPreventivo,
  verOrdenes, descargarReporte, semaforoCliente,
};
