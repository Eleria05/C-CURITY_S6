// Pruebas de cada regla de negocio
// Ejecutar con: node pruebas.js
const assert = require('assert');
const c = require('./ccurity');
let ok = 0, mal = 0;
const probar = (nombre, fn) => {
  c.reiniciar();
  try { fn(); ok++; console.log('  ok    ' + nombre); } catch (e) { mal++; console.log('  FALLO ' + nombre + ' -> ' + e.message); }
};
const falla = (fn, texto) => assert.throws(fn, (e) => e.message.includes(texto), 'debio fallar con: ' + texto);
const F = (...a) => new Date(2026, ...a); // F(9, 5, 10) = 5 de octubre de 2026, 10:00 (el mes 9 es octubre)

function preparar() { 
  c.ponerFecha(F(9, 5, 10));
  const d = { admin: c.agregarUsuario('Admin', 'admin'), t1: c.agregarUsuario('Tec 1', 'tecnico'),
    t2: c.agregarUsuario('Tec 2', 'tecnico'), cli: c.agregarCliente('La Central', 4), lejos: c.agregarCliente('El Sol', 14) };
  d.duenio = c.agregarUsuario('Dueno', 'cliente', d.cli.id);
  c.agregarEquipo(d.cli.id, 'DVR', '8ch');
  d.disco = c.agregarEquipo(d.cli.id, 'Disco', '2TB');
  return d;
}
function enProceso(d) {
  const o = c.crearOrden(d.admin, d.cli.id, 'Preventivo', 'Revision');
  c.agendar(d.admin, o.id, F(9, 6, 10)); c.asignar(d.admin, o.id, d.t1.id); c.iniciar(d.t1, o.id);
  return o;
}
const llenar = (d, o, saltar) => c.CASILLAS.filter((x) => x !== saltar).forEach((x) => c.llenar(d.t1, o.id, x, 'OK'));

probar('horarios y 24 horas habiles', () => {
  assert(c.esHabil(F(9, 5, 9)) && !c.esHabil(F(9, 5, 18)) && c.esHabil(F(9, 10, 13)) && !c.esHabil(F(9, 10, 14)));
  assert(!c.esHabil(F(9, 11, 11))); // domingo
  assert.strictEqual(+c.sumarHorasHabiles(F(9, 5, 10), 24), +F(9, 7, 16));
});
probar('cobertura: hasta 10 km tarifa base, despues cargo de traslado', () => {
  assert.deepStrictEqual(c.cotizar(10), { extra: 0, traslado: 0, total: 450 });
  assert.deepStrictEqual(c.cotizar(14), { extra: 4, traslado: 48, total: 498 });
});
probar('permisos por perfil', () => {
  const d = preparar();
  falla(() => c.crearOrden(d.duenio, d.lejos.id, 'Preventivo', 'x'), 'propio negocio');
  const o = c.crearOrden(d.admin, d.cli.id, 'Preventivo', 'A');
  falla(() => c.asignar(d.t1, o.id, d.t1.id), 'no tiene permiso');
});
probar('no se duplican ordenes abiertas', () => {
  const d = preparar();
  c.crearOrden(d.duenio, d.cli.id, 'Falla Critica', 'Sin video', d.disco.id);
  falla(() => c.crearOrden(d.duenio, d.cli.id, 'Falla Critica', 'Otra vez', d.disco.id), 'similar');
});
probar('falla critica: debe agendarse dentro de 24 horas habiles', () => {
  const d = preparar();
  const o = c.crearOrden(d.duenio, d.cli.id, 'Falla Critica', 'Sin video', d.disco.id);
  assert.strictEqual(+o.limite, +F(9, 7, 16));
  falla(() => c.agendar(d.admin, o.id, F(9, 8, 10)), '24 horas');
  c.agendar(d.admin, o.id, F(9, 6, 11));
});
probar('agenda: solo en horario habil y sin empalmar tecnicos', () => {
  const d = preparar();
  const a = c.crearOrden(d.admin, d.cli.id, 'Preventivo', 'A'), b = c.crearOrden(d.admin, d.lejos.id, 'Preventivo', 'B');
  falla(() => c.agendar(d.admin, a.id, F(9, 11, 10)), 'Fuera de horario');
  falla(() => c.agendar(d.admin, a.id, F(9, 6, 19)), 'Fuera de horario');
  c.agendar(d.admin, a.id, F(9, 6, 10)); c.asignar(d.admin, a.id, d.t1.id); c.agendar(d.admin, b.id, F(9, 6, 11));
  falla(() => c.asignar(d.admin, b.id, d.t1.id), 'ya tiene una visita');
  c.asignar(d.admin, b.id, d.t2.id);
});
probar('estados: Pendiente -> En Proceso -> Finalizada', () => {
  const d = preparar();
  const o = c.crearOrden(d.admin, d.cli.id, 'Preventivo', 'Revision');
  c.asignar(d.admin, o.id, d.t1.id);
  falla(() => c.finalizar(d.t1, o.id), 'En Proceso');
  falla(() => c.iniciar(d.t2, o.id), 'tecnico asignado');
  c.iniciar(d.t1, o.id);
  falla(() => c.iniciar(d.t1, o.id), 'Pendiente');
});
probar('no se finaliza sin el 100% del checklist ni observaciones', () => {
  const d = preparar(), o = enProceso(d);
  falla(() => c.finalizar(d.t1, o.id), 'No se puede finalizar');
  llenar(d, o, 'conexion_remota'); c.observaciones(d.t1, o.id, 'Falta una');
  falla(() => c.finalizar(d.t1, o.id), 'conexion_remota');
  c.llenar(d.t1, o.id, 'conexion_remota', 'OK'); c.observaciones(d.t1, o.id, '  ');
  falla(() => c.finalizar(d.t1, o.id), 'observaciones');
  falla(() => c.llenar(d.t1, o.id, 'lentes', 'FALLA'), 'descripcion y solucion');
  assert.strictEqual(o.estado, 'En Proceso');
});
probar('al finalizar: reporte, equipos y semaforo', () => {
  const d = preparar(), o = enProceso(d);
  llenar(d, o, 'almacenamiento');
  c.llenar(d.t1, o.id, 'almacenamiento', 'FALLA', { equipo: d.disco.id, desc: 'Sin sectores', solucion: 'Garantia', estado: 'Fuera de Servicio' });
  c.observaciones(d.t1, o.id, 'Disco danado');
  const fin = c.finalizar(d.t1, o.id);
  assert(fin.estado === 'Finalizada' && fin.reporte.includes('Sin sectores'));
  assert.strictEqual(c.semaforoCliente(d.duenio, d.cli.id), 'Fuera de Servicio');
});
probar('semaforo: Operativo, Requiere Atencion, Fuera de Servicio', () => {
  const ok1 = { tipo: 'Camara', estado: 'Operando' }, dvr = { tipo: 'DVR', estado: 'Operando' };
  assert.strictEqual(c.semaforo([ok1, dvr]), 'Operativo');
  assert.strictEqual(c.semaforo([{ tipo: 'Camara', estado: 'Requiere Atencion' }, dvr]), 'Requiere Atencion');
  assert.strictEqual(c.semaforo([{ tipo: 'Disco', estado: 'Fuera de Servicio' }, ok1]), 'Fuera de Servicio');
});
probar('portal: cada perfil ve y descarga solo lo suyo', () => {
  const d = preparar(), o = enProceso(d);
  llenar(d, o); c.observaciones(d.t1, o.id, 'Todo bien');
  falla(() => c.descargarReporte(d.duenio, o.id), 'hasta que la orden se finaliza');
  c.finalizar(d.t1, o.id);
  assert(c.descargarReporte(d.duenio, o.id).includes('REPORTE'));
  falla(() => c.descargarReporte(c.agregarUsuario('Otro', 'cliente', d.lejos.id), o.id), 'No tienes acceso');
  assert(c.verOrdenes(d.admin).length === 1 && c.verOrdenes(d.t2).length === 0);
});
probar('RMA (nueva orden correctiva) y siguiente preventivo', () => {
  const d = preparar();
  const rma = c.rma(d.admin, d.disco.id, 'Disco danado');
  assert(rma.tipo === 'Correctivo' && rma.estado === 'Pendiente');
  falla(() => c.rma(d.t1, d.disco.id, 'x'), 'no tiene permiso');
  const o = enProceso(d);
  llenar(d, o); c.observaciones(d.t1, o.id, 'Todo bien');
  falla(() => c.programarPreventivo(d.admin, o.id), 'Finalizada');
  c.ponerFecha(F(9, 6, 12)); c.finalizar(d.t1, o.id);
  assert.strictEqual(+c.programarPreventivo(d.admin, o.id).fecha, +new Date(2027, 0, 6, 9)); // 6 de enero de 2027, 9:00
});

console.log(`\nResultado: ${ok} pruebas correctas, ${mal} con fallo`);
process.exit(mal ? 1 : 0);
