import test from 'node:test';
import assert from 'node:assert/strict';
import R from '../../creditek/erp/aliados-reversiones-domain.js';
import D from '../../creditek/erp/aliados-liquidaciones-domain.js';
const original={id:'o',external_id:'C1',plataforma:'krediya',operation_at:'2026-08-20',reconocida:true,monto_base:200,valor_comercial:220,pagamos:120,pago_neto_beneficiario:100,bonos_aplicados:20,utilidad_creditek:54,resultado_cerrado:54,policy_snapshot:{krediya_v2:{provision:21,gasto_financiero:5}}};
const reversion={id:'r',tipo:'reversion_liquidada',original_operation_id:'o',cancellation_operation_id:'c',liquidation_id:'new',fecha:'2026-09-10',snapshot:{original,calculo:{pagamos:120,pago_aliado:100,total_bonos:20,utilidad_creditek:54,policy_snapshot:{provision:21,gasto_financiero:5}},bonos:[{id:'b',beneficiary_id:'e',valor:20,estado:'pagada'}]}};
test('informe conserva agosto y resta en septiembre todos los componentes del snapshot',()=>{
 const before=JSON.stringify(reversion),[r]=R.entries([reversion]);
 assert.equal(r.operation_at,'2026-09-10T12:00:00-05:00');assert.equal(r.resultado_cerrado,0);
 for(const field of ['monto_base','valor_comercial','pagamos','pago_neto_beneficiario','bonos_aplicados','utilidad_creditek'])assert.equal(original[field]+r[field],0,field);
 assert.equal(r.policy_snapshot.krediya_v2.provision,-21);
 assert.equal(r.policy_snapshot.krediya_v2.gasto_financiero,-5);
 assert.equal(r.valor_comercial-r.pagamos,r.utilidad_creditek+r.bonos_aplicados+r.policy_snapshot.krediya_v2.provision+r.policy_snapshot.krediya_v2.gasto_financiero);
 assert.equal(JSON.stringify(reversion),before);
 assert.equal(R.creditCount([original,r]),0);
 const [b]=R.bonusEntries([reversion]);assert.equal(b.valor,-20);assert.equal(b.operation_id,r.id);
});
test('seguimiento no sustituye al original; anulación no vuelve a contarse como venta',()=>{
 const tracking={id:'c',external_id:'c1',plataforma:'krediya',normalized_data:{seguimientoPagoKrediya:'krediya_anulacion_por_conciliar'}};
 for(const ops of [[original,tracking],[tracking,original]]){
  const result=R.reportingOperations(ops,[reversion]);assert.equal(result.length,2);assert.equal(result[0].id,'o');
 }
 assert.equal(R.reportingOperations([tracking],[]).length,0);
 assert.equal(R.reportingOperations([original,tracking],[{...reversion,tipo:'sin_desembolso'}]).length,0);
});
test('importación conserva venta y anulación aun si el archivo trae primero la anulación',()=>{
 const header=['# Crédito','Tienda','IMEI','Cédula','Estado del contrato','Estado del Pago','Monto a Financiar','Abono (moneda)','Fecha'];
 const result=D.importarKrediya([header,['C1','A TIENDA','123','456','ANULADO','PENDIENTE',100,0,'2026-09-01'],['C1','A TIENDA','123','456','FIRMADO','PAGADO',100,0,'2026-09-01']],[]);
 assert.equal(result.operaciones.length,2);assert.equal(new Set(result.operaciones.map(o=>o.sourceKey)).size,2);
 assert.equal(result.operaciones[0].estadoContrato,'firmado');assert.equal(result.operaciones[0].movimientos[0].fila,3);
 assert.equal(result.operaciones[1].movimientos[0].fila,2);
 assert.ok(result.operaciones.every(o=>!o.incidencias.includes('operacion_duplicada')));
});
