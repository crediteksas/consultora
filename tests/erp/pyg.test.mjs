import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const D=require('../../creditek/erp/pyg-domain.js');
test('Retail concilia tiendas, generales, bajas y pérdidas una sola vez',()=>{
 const report=D.retail({
 sales:[{id:1,tienda_codigo:'A',total:1000},{id:2,tienda_codigo:'B',total:500}],
 itemRows:[{store:'A',value:200},{store:'B',value:100}],
 expenses:[{tienda_codigo:'A',monto:250}],writeoffs:[{tienda_codigo:'B',valor:40}],
 generalExpenses:[{amount:30}]
 },[{codigo:'A',nombre:'A'},{codigo:'B',nombre:'B'},{codigo:'C',nombre:'C'}]);
 assert.equal(report.summary.net,-20);
 assert.equal(report.stores.reduce((n,s)=>n+s.net,0),report.summary.net);
 assert.equal(report.stores.find(s=>s.code==='A').net,-50);
 assert.equal(report.stores.find(s=>s.code==='C').net,0);
});
test('ausencias se indican como parciales y el margen Aliados conserva reversos',()=>{
 const report=D.allies([{utilidad_creditek:200},{utilidad_creditek:-50},{utilidad_creditek:null}],[{value:-40}]);
 assert.equal(report.net,110);
 assert.equal(report.missing,1);
 assert.equal(report.income,null);
});
test('B2B conserva signo y gastos autorizados',()=>{
 const r=D.b2b([{facturado:1000,costo:800,utilidad:200}],[{value:-230}]);
 assert.equal(r.net,-30);
 assert.equal(r.cost,800);
});

test('CENTRAL y márgenes de tiendas fuera del catálogo se conservan',()=>{
 const report=D.retail({sales:[{tienda_codigo:'CENTRAL',total:1000}],
 itemRows:[{store:'CENTRAL',value:300},{store:'Z',value:500}],
 expenses:[{tienda_codigo:'CENTRAL',monto:200}],writeoffs:[],generalExpenses:[{amount:50}]},[]);
 assert.equal(report.summary.income,1000);
 assert.equal(report.summary.net,550);
 assert.equal(report.stores.find(s=>s.code==='Z').net,500);
});
test('un contrato de gastos con signo inverso detiene el informe',()=>{
 assert.throws(()=>D.b2b([],[{value:230}]),/signo inválido/);
 assert.throws(()=>D.allies([],[{value:230}]),/signo inválido/);
});
test('Aliados expone financieros y provisiones sin descontarlos dos veces',()=>{
 const rows=[
  {plataforma:'krediya',utilidad_creditek:1000,policy_snapshot:{krediya_v2:{gasto_financiero:20,provision:100}}},
  {plataforma:'alo',utilidad_creditek:500,pago_neto_beneficiario:1000},
  {plataforma:'addi',utilidad_creditek:200,tarifa_addi:75,iva_tarifa:14.25}
 ];
 const report=D.alliesBreakdown(rows,[{value:-300}]);
 assert.equal(report.financial,113.25);
 assert.equal(report.provision,100);
 assert.equal(report.bridge[0][1],1909.25);
 assert.equal(report.summary.net,1396);
 assert.equal(report.bridge[0][1]+report.bridge[1][1]+report.bridge[2][1]+report.bridge[4][1],1396);
 assert.equal(report.platforms.find(row=>row.platform==='alo').financial,4);
 assert.equal(report.missing,0);
});
test('la reversión financiera revierte cargos y provisión con su signo',()=>{
 const report=D.alliesBreakdown([
  {plataforma:'krediya',utilidad_creditek:1000,policy_snapshot:{krediya_v2:{gasto_financiero:20,provision:100}}},
  {plataforma:'krediya',utilidad_creditek:-1000,policy_snapshot:{krediya_v2:{gasto_financiero:-20,provision:-100}}}
 ],[]);
 assert.equal(report.summary.net,0);
 assert.equal(report.financial,0);
 assert.equal(report.provision,0);
});
test('un snapshot ausente produce desglose parcial y conserva el margen',()=>{
 const report=D.alliesBreakdown([{plataforma:'krediya',utilidad_creditek:1000}],[]);
 assert.equal(report.summary.net,1000);
 assert.equal(report.missing,2);
 assert.equal(report.platforms[0].financial,null);
 assert.equal(report.platforms[0].status,'Desglose parcial');
});
test('un margen nulo no aporta cargos a la conciliación y se señala en la cobertura',()=>{
 const r=D.alliesBreakdown([{plataforma:'krediya',utilidad_creditek:null,policy_snapshot:{krediya_v2:{gasto_financiero:20,provision:100}}}],[]);
 assert.equal(r.financial,0);
 assert.equal(r.provision,0);
 assert.equal(r.missing,1);
 assert.equal(r.platforms[0].financial,null);
 assert.equal(r.platforms[0].status,'Margen pendiente o parcial');
});
test('un concepto ausente conserva importe, fuente e ID con detalle parcial',()=>{
 const detail=D.describeExpenses([{date:'2026-10-01',source:'financial_entries',id:'test',value:-100}],new Map());
 assert.equal(detail.rows[0][2],100);
 assert.match(detail.rows[0][1],/Sin concepto.*financial_entries.*test/);
 assert.equal(detail.missing,1);
});

test('GMF PayJoy y Aló sobre giro neto se descuenta una vez y conserva reversión',()=>{
 const rows=[{plataforma:'payjoy',utilidad_creditek:200,pago_neto_beneficiario:470000},
 {plataforma:'alo',utilidad_creditek:300,pago_neto_beneficiario:416000}];
 const r=D.alliesBreakdown(rows,[]);
 assert.equal(r.financial,3544);assert.equal(r.summary.net,-3044);
 assert.equal(r.bridge[0][1],500);
 const reversed=D.alliesBreakdown([...rows,...rows.map(x=>({...x,utilidad_creditek:-x.utilidad_creditek,pago_neto_beneficiario:-x.pago_neto_beneficiario}))],[]);
 assert.equal(reversed.financial,0);assert.equal(reversed.summary.net,0);
});
test('GMF persistido ya incluido no vuelve a reducir utilidad',()=>{
 const r=D.alliesBreakdown([{plataforma:'payjoy',utilidad_creditek:100,pago_neto_beneficiario:5000,policy_snapshot:{gmf_tiendas:{importe:20,incluido_en_utilidad:true}}}],[]);
 assert.equal(r.financial,20);assert.equal(r.additionalFinancial,0);assert.equal(r.summary.net,100);
});
test('giro ausente o GMF guardado inválido señala parcial sin inventar importe',()=>{
 for(const row of [{plataforma:'alo',utilidad_creditek:100},{plataforma:'payjoy',utilidad_creditek:100,pago_neto_beneficiario:1000,policy_snapshot:{gmf_tiendas:{importe:4}}}]){
 const r=D.alliesBreakdown([row],[]);assert.equal(r.financial,0);assert.equal(r.summary.net,100);assert.equal(r.missing,1);assert.equal(r.summary.missing,0);assert.equal(r.platforms[0].financial,null);
 }
});

test('GMF usa redondeo simétrico a centavos y consultar otra vez no acumula',()=>{
 const rows=[{plataforma:'alo',utilidad_creditek:100,pago_neto_beneficiario:1.25}];
 assert.equal(D.alliesBreakdown(rows,[]).financial,.01);
 assert.equal(D.alliesBreakdown(rows,[]).summary.net,99.99);
 assert.equal(D.alliesBreakdown(rows,[]).summary.net,99.99);
 assert.equal(D.alliesBreakdown([{...rows[0],utilidad_creditek:-100,pago_neto_beneficiario:-1.25}],[]).financial,-.01);
});

test('la reversión real no presume devolución bancaria del GMF ya incurrido',async()=>{
 const {default:R}=await import('../../creditek/erp/aliados-reversiones-domain.js');
 for(const plataforma of ['payjoy','Aló'])for(const included of [null,true,false]){
 const policy=included===null?{}:{gmf_tiendas:{importe:20,incluido_en_utilidad:included}};
 const original={id:'original',plataforma,external_id:'test',pago_neto_beneficiario:5000,utilidad_creditek:100,policy_snapshot:policy};
 const reversions=R.entries([{id:'reversal',tipo:'reversion_liquidada',fecha:'2026-10-02',snapshot:{original,calculo:{pago_aliado:5000,utilidad_creditek:100,policy_snapshot:policy}}}]);
 const r=D.alliesBreakdown([original,...reversions],[]);
 assert.equal(r.financial,20);assert.equal(r.summary.net,-20);assert.equal(r.missing,0);
 }
});
