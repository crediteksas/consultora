import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import D from '../../creditek/erp/aliados-liquidaciones-domain.js';
const policy={id:'p',plataforma:'payjoy',tipoEstablecimiento:'propia',porcentaje:.76,estado:'aprobada',vigenteDesde:'2026-08-05'};
const op={plataforma:'payjoy',tipoEstablecimiento:'propia',fecha:'2026-09-20',montoCredito:544000,montoBase:544000,inicial:81600,reconocida:true,incidencias:[],sourceKey:'example'};
test('PayJoy excluye inicial del ingreso, conserva PAGAMOS y giro',()=>{
 const [r]=D.calcularOperaciones([op],[policy]);
 assert.equal(r.valorComercial,544000);assert.equal(r.pagamos,413440);assert.equal(r.pagoNeto,331840);assert.equal(r.utilidadCreditek,130560);
});
test('PayJoy con bono descuenta inicial una sola vez',()=>{
 const [r]=D.calcularOperaciones([op],[policy],[{operationKey:'example',valor:25000,estado:'aprobado'}]);
 assert.equal(r.utilidadCreditek,105560);assert.equal(r.pagoNeto,331840);
});
test('ALO mantiene crédito más inicial y su cálculo previo',()=>{
 const [r]=D.calcularOperaciones([{...op,plataforma:'alo'}],[{...policy,plataforma:'alo'}]);
 assert.equal(r.valorComercial,625600);assert.equal(r.pagamos,475456);assert.equal(r.pagoNeto,393856);assert.equal(r.utilidadCreditek,150144);
});
test('rectificación transaccional audita y restaura protecciones sin alterar pagos',()=>{
 const sql=readFileSync('supabase/migrations/20260921225745_payjoy_neto_rectificacion_auditada.sql','utf8');
 assert.match(sql,/before_data jsonb NOT NULL/);assert.match(sql,/permit_transaction=txid_current\(\)/);
 assert.match(sql,/FOR r IN SELECT \* FROM payjoy_original_guards LOOP EXECUTE r.definition/);
 assert.match(sql,/liquidation_adjustments/);assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
 assert.doesNotMatch(sql,/(UPDATE|DELETE FROM|INSERT INTO) public\.(payment_orders|payment_items|treasury_movements|cobros_deposits|cobros_allocations)\b/i);
 assert.doesNotMatch(sql,/DISABLE TRIGGER|session_replication_role/i);
});
