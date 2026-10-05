// Demo del proceso completo
// Ejecutar con:  node main.js
const c = require('./ccurity');
const intentar = (texto, accion) => {
  try { const r = accion(); console.log('  [OK]        ' + texto); return r; }
  catch (e) { console.log('  [RECHAZADO] ' + texto + ' -> ' + e.message); }
};
c.ponerFecha(new Date(2026, 9, 5, 10, 0)); 

console.log('=== 1. Datos ===');
const admin = c.agregarUsuario('Propietario', 'admin'), tecnico = c.agregarUsuario('Rodrigo Delgado', 'tecnico');
const cli = c.agregarCliente('Abarrotes La Central', 4.2), lejos = c.agregarCliente('Farmacia El Sol', 14);
const duenio = c.agregarUsuario('Dueno La Central', 'cliente', cli.id);
c.agregarEquipo(cli.id, 'Camara', 'Dahua Domo IP'); c.agregarEquipo(cli.id, 'DVR', 'Dahua 8 canales');
const disco = c.agregarEquipo(cli.id, 'Disco', 'WD Purple 2TB');
console.log('  Semaforo inicial:', c.semaforoCliente(duenio, cli.id));

console.log('\n=== 2. El cliente reporta una falla critica ===');
const o = c.crearOrden(duenio, cli.id, 'Falla Critica', 'El disco dejo de grabar', disco.id);
console.log(`  Orden ${o.id}, limite de atencion: ${o.limite.toLocaleString('es-MX')}`);
intentar('Reportar la misma falla otra vez', () => c.crearOrden(duenio, cli.id, 'Falla Critica', 'x', disco.id));
intentar('El cliente intenta asignar tecnico', () => c.asignar(duenio, o.id, tecnico.id));

console.log('\n=== 3. El administrador agenda y asigna ===');
intentar('Agendar en domingo', () => c.agendar(admin, o.id, new Date(2026, 9, 11, 10, 0)));
intentar('Agendar el jueves (pasa de 24 h habiles)', () => c.agendar(admin, o.id, new Date(2026, 9, 8, 10, 0)));
intentar('Agendar el martes 11:00', () => c.agendar(admin, o.id, new Date(2026, 9, 6, 11, 0)));
intentar('Asignar al tecnico', () => c.asignar(admin, o.id, tecnico.id));

console.log('\n=== 4. El tecnico trabaja la orden ===');
intentar('Finalizar sin haber iniciado', () => c.finalizar(tecnico, o.id));
intentar('Iniciar servicio', () => c.iniciar(tecnico, o.id));
intentar('Finalizar con el checklist vacio', () => c.finalizar(tecnico, o.id));
['lentes', 'voltaje', 'conectores', 'grabacion', 'conexion_remota'].forEach((x) => c.llenar(tecnico, o.id, x, 'OK'));
intentar('Finalizar con 5 de 6 casillas', () => c.finalizar(tecnico, o.id));
intentar('Marcar falla sin explicarla', () => c.llenar(tecnico, o.id, 'almacenamiento', 'FALLA'));
c.llenar(tecnico, o.id, 'almacenamiento', 'FALLA',
  { equipo: disco.id, desc: 'Disco sin sectores', solucion: 'Se retira para garantia', estado: 'Fuera de Servicio' });
c.observaciones(tecnico, o.id, 'Disco danado, se tramita garantia.');
const fin = intentar('Finalizar con checklist al 100%', () => c.finalizar(tecnico, o.id));

console.log('\n=== 5. Reporte y portal del cliente ===');
console.log(fin.reporte);
console.log('\n  Semaforo del cliente ahora:', c.semaforoCliente(duenio, cli.id));
const otro = c.agregarUsuario('Dueno El Sol', 'cliente', lejos.id);
intentar('Otro cliente intenta ver el reporte', () => c.descargarReporte(otro, o.id));

console.log('\n=== 6. Garantia, preventivo y cotizacion ===');
const rma = intentar('Solicitar RMA del disco', () => c.rma(admin, disco.id, 'Disco danado'));
const prev = intentar('Programar siguiente preventivo', () => c.programarPreventivo(admin, o.id));
console.log(`  RMA: ${rma.id} (${rma.tipo}) | Preventivo: ${prev.id} el ${prev.fecha.toLocaleString('es-MX')}`);
console.log('  Cotizacion a 14 km:', c.cotizar(14));
