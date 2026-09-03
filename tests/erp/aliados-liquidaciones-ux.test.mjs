import assert from 'node:assert/strict';
import test from 'node:test';
import ux from '../../creditek/erp/aliados-liquidaciones-ux.js';

test('formatea dinero y fechas para administración sin ISO completo', () => {
  assert.equal(ux.formatoCOP(1693952),'$ 1.693.952');
  assert.equal(ux.formatoCOP(100000),'$ 100.000');
  assert.equal(ux.fechaCorta('2026-09-02'),'2026-09-02');
  assert.equal(ux.fechaCorta('2026-09-01'),'2026-09-01');
  assert.equal(ux.fechaCorta('2026-08-03T15:20:30.000Z'),'2026-08-03');
  assert.equal(ux.fechaAuditoria('2026-08-03T15:20:30.000Z'),'2026-08-03 10:20');
});

test('calcula Operación Retail PayJoy con la inicial real registrada en KORA', () => {
  assert.deepEqual(ux.calcularTiendaPropia({ plataforma:'payjoy',montoCredito:1000000,montoTotal:1000000,inicialPlataforma:100000,inicialKora:120000,costo:700000,pagamos:800000 }),{
    diferencia:20000,totalRealTienda:880000,pagoNetoTienda:660000,utilidadCreditek:220000,utilidadTienda:100000,
  });
});

test('calcula Operación Retail ALO con diferencia entre inicial esperada y recibida', () => {
  assert.deepEqual(ux.calcularTiendaPropia({ plataforma:'alo',montoCredito:900000,montoTotal:960000,inicialPlataforma:240000,inicialKora:200000,costo:650000,pagamos:750000 }),{
    diferencia:40000,totalRealTienda:760000,pagoNetoTienda:470000,utilidadCreditek:490000,utilidadTienda:100000,
  });
});

test('traduce estados y auditoría sin exponer UUID ni JSON', () => {
  assert.equal(ux.traducirEstado('programado'),'Programado');
  assert.deepEqual(ux.describirAuditoria({ accion:'aliados_liquidacion_calculada',actorNombre:'Maite',actorCapacidad:'revisor',detalle:{total_pagar:1793952} }),{
    accion:'Liquidación calculada',realizadaPor:'Maite — Revisión',descripcion:'Se calculó un total a pagar de $ 1.793.952',resultado:'Calculada',
  });
});

test('enmascara cuentas y conserva el detalle técnico cerrado', () => {
  assert.equal(ux.cuentaTerminadaEn('1234567890'),'•••• 7890');
  assert.equal(ux.detalleTecnico({id:'uuid',raw:{a:1}}).abierto,false);
});
