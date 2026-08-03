import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const domain = require('../../creditek/erp/aliados-liquidaciones-domain.js');

const establecimientos = [
  { id:'a1', nombre:'ARTESANIAS EILEEN ALIADA', tipo:'aliado', ejecutivo:{ id:'e1' }, beneficiarioId:'b1' },
  { id:'a2', nombre:'ALIADO INNOVACEL COMUNICACIONES SAS', tipo:'aliado', ejecutivo:{ id:'e2' }, beneficiarioId:'b2' },
  { id:'a3', nombre:'World Seven', aliases:['World Seven  '], tipo:'aliado', ejecutivo:{ id:'e3' }, beneficiarioId:'b3' },
  { id:'a4', nombre:'Distritoys', aliases:['Distritoys '], tipo:'aliado', ejecutivo:{ id:'e4' }, beneficiarioId:'b4' },
  { id:'t1', nombre:'CREDITEK CIENAGA DE ORO 1', tipo:'propia' },
];
const policy = plataforma => ({ id:`p-${plataforma}`,version:1,plataforma,tipoEstablecimiento:'aliado',porcentaje:.77,vigenteDesde:'2026-01-01',vigenteHasta:null,estado:'aprobada' });

function sheetRows(file, sheetName) {
  const workbook = XLSX.readFile(file, { cellDates: true });
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName || workbook.SheetNames[0]], { header:1, defval:null, raw:true });
}

test('normaliza dinero ALO aunque llegue como texto monetario', () => {
  assert.equal(domain.dinero('$3,257,600.00'), 3257600);
  assert.equal(domain.dinero('$60,000.00'), 60000);
});

test('PayJoy une purchaseAmount y purchaseOutOfPocket en una operación', () => {
  const rows = [[
    'transaction time','merchant name','device','transaction type','device family','device model','imei','sales clerk id','sales clerk name','months','finance product','owed by PayJoy','owed by CREDITEK S.A.S.','national id',
  ],
  ['July 21, 2026 4:57 pm','ARTESANIAS EILEEN ALIADA','D1','purchaseAmount','Equipo','Modelo','111',1,'Vendedor',8,'PHONE_FINANCE',780000,null,'9001'],
  ['July 21, 2026 4:57 pm','ARTESANIAS EILEEN ALIADA','D1','purchaseOutOfPocket','Equipo','Modelo','111',1,'Vendedor',8,'PHONE_FINANCE',null,117000,'9001']];
  const result = domain.importarPayjoy(rows, establecimientos);
  assert.equal(result.operaciones.length, 1);
  assert.equal(result.operaciones[0].movimientos.length, 2);
  assert.equal(result.operaciones[0].montoBase, 780000);
  assert.equal(result.operaciones[0].inicial, 117000);
  assert.deepEqual(result.incidencias, []);
});

test('bloquea movimiento PayJoy incompleto, duplicado y comercio desconocido', () => {
  const headers = ['transaction time','merchant name','device','transaction type','imei','owed by PayJoy','national id'];
  const result = domain.importarPayjoy([headers,['2026-07-21','DESCONOCIDO','D1','purchaseAmount','',100,'']], establecimientos);
  assert.deepEqual(new Set(result.operaciones[0].incidencias), new Set(['movimiento_payjoy_incompleto','imei_vacio','documento_vacio','comercio_no_reconocido']));
});

test('las políticas se resuelven por plataforma, tipo y vigencia sin porcentaje quemado', () => {
  assert.equal(domain.resolverPolitica([policy('payjoy')], '2026-07-21', 'payjoy', 'aliado').porcentaje, .77);
  assert.throws(() => domain.resolverPolitica([], '2026-07-21', 'payjoy', 'aliado'), /politica_ausente/);
  assert.throws(() => domain.resolverPolitica([policy('payjoy'),{...policy('payjoy'),id:'p2'}], '2026-07-21', 'payjoy', 'aliado'), /politica_ambigua/);
});

test('conciliación histórica PayJoy reproduce el detalle aprobado y no la tabla dinámica vieja', { skip: !fs.existsSync(path.join(os.homedir(),'Downloads','PAYJOY COMO LO RECIBO.xlsx')) }, () => {
  const source = path.join(os.homedir(),'Downloads','PAYJOY COMO LO RECIBO.xlsx');
  const imported = domain.importarPayjoy(sheetRows(source,'Transacciones'), establecimientos);
  const allies = imported.operaciones.filter(op => op.tipoEstablecimiento === 'aliado');
  const bonuses = [
    ['payjoy|DBTRVJXB',65000],['payjoy|DCBMKRV',75000],['payjoy|DBTQWCB',45000],['payjoy|DVJPTKH',45000],
  ].map(([operationKey,value],index) => ({ operationKey,valor:value,estado:'aprobado',tipoBeneficiario:'ejecutivo',beneficiarioId:`bono-${index}` }));
  const calculations = domain.calcularAliados(allies,[policy('payjoy')],bonuses);
  const totals = domain.resumir(calculations);
  assert.deepEqual(totals,{ operaciones:4,montoBase:2760000,inicial:276000,pagamos:2125200,pagoAliados:1849200,bonos:230000,utilidadCreditek:680800,totalPagar:2079200 });
});

test('ALO usa Monto Total y evidencia la diferencia histórica de accesorios', { skip: !fs.existsSync(path.join(os.homedir(),'Downloads','ALO COMO LO RECIBO.xlsx')) }, () => {
  const source = path.join(os.homedir(),'Downloads','ALO COMO LO RECIBO.xlsx');
  const imported = domain.importarAlo(sheetRows(source,'Worksheet'), establecimientos);
  const allies = imported.operaciones.filter(op => op.tipoEstablecimiento === 'aliado');
  assert.equal(allies.length,4);
  assert.equal(allies.reduce((sum,op) => sum + op.montoBase,0),3317600);
  assert.equal(allies.reduce((sum,op) => sum + op.accesorios,0),60000);
  assert.equal(3317600 - 60000,3257600, 'el total solicitado excluye exactamente el accesorio observado');
});

test('genera pagos por beneficiario y controla estados y eventos seguros', () => {
  const operation = { sourceKey:'payjoy|D1',tipoEstablecimiento:'aliado',reconocida:true,incidencias:[],fecha:'2026-07-21T12:00:00Z',plataforma:'payjoy',montoBase:100000,inicial:10000,ejecutivo:{id:'e1'},establecimiento:establecimientos[0] };
  const bonus = { operationKey:'payjoy|D1',valor:5000,estado:'aprobado',tipoBeneficiario:'ejecutivo',beneficiarioId:'e1' };
  const calculations = domain.calcularAliados([operation],[policy('payjoy')],[bonus]);
  const payments = domain.generarPagos(calculations);
  assert.equal(payments.length,2);
  assert.equal(payments.reduce((sum,payment) => sum + payment.valor,0),72000);
  assert.equal(domain.puedeTransicionar('revisada','aprobada'),true);
  assert.equal(domain.puedeTransicionar('aprobada','calculada'),false);
  const event = domain.evento('liquidation.approved','l1',{ platform:'payjoy' });
  assert.deepEqual(Object.keys(event.data).sort(),['liquidation_id','platform']);
});
