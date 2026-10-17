import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from '@playwright/test';

async function fixture(browser,route){
  const context=await browser.newContext(),page=await context.newPage();
  await context.route('**/*',async req=>{
    const url=new URL(req.request().url());
    if(url.hostname!=='kora.test')return req.abort();
    if(url.pathname==='/fixture')return req.fulfill({contentType:'text/html',body:'<main><h1>Directorio de prueba</h1><div id="directory"></div></main>'});
    if(/sidebar\.js|supabase-js|kora-environment|cobros-plataformas\.js/.test(url.pathname))return req.fulfill({contentType:'text/javascript',body:''});
    const file=resolve(process.cwd(),'.'+url.pathname);
    if(!file.startsWith(process.cwd()+'/'))return req.abort();
    try{await req.fulfill({contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[extname(file)]||'application/octet-stream',body:await readFile(file)});}catch{await req.fulfill({status:404,body:''});}
  });
  await page.addInitScript(()=>{
    window.__KORA_ENV__={};window.calls=[];window.fail=false;
    const stores=Array.from({length:21},(_,i)=>({codigo:'AL-'+i,nombre:'Comercio '+String(i).padStart(2,'0'),tipo:'aliado',activo:true,ciudad:'Ciudad de prueba'}));
    const data={origenes:stores,liquidation_beneficiaries:stores.map((s,i)=>({id:'b'+i,nombre:'Titular '+i,identificacion:'000000'+i,tipo:'aliado',activo:true,origen_codigo:s.codigo})),beneficiary_bank_accounts:stores.map((s,i)=>({id:'a'+i,beneficiary_id:'b'+i,numero_cuenta:'0123456789',banco:'Banco de prueba',tipo_cuenta:'Ahorros',activo:true,validada:true})),aliados_sedes:[],aliados:[],proveedores:[{id:'p',nombre:'Proveedor de prueba'}],facturas_proveedor:[],banco_creditek_cuentas:{saldo_actual:1000000.25,fecha_corte:'2026-10-08'},banco_creditek_pagos_proveedor:[{id:'pago',proveedor_id:'p',estado:'autorizado',monto:120000.25,concepto:'Compra de prueba',solicitado_at:'2026-10-08T12:00:00Z'},{id:'pagado',proveedor_id:'p',estado:'pagado',monto:100000,concepto:'Compra anterior',solicitado_at:'2026-10-07T12:00:00Z',pagado_at:'2026-10-08T12:00:00Z'}],banco_creditek_aplicaciones_proveedor:[]};
    const result=t=>window.fail?{error:{message:'Fallo simulado'}}:{data:data[t]||[]};
    const profile={id:'6de0ad26-64af-4966-8cd9-d468880af627',rol:'gerencia',activo:true,nombre:'Usuario de prueba'};
    const sb={auth:{getSession:async()=>({data:{session:{user:{id:profile.id}}}})},from(t){window.calls.push('read:'+t);const q={select(){return q},eq(){return q},order(){return q},limit(){return q},single:async()=>({data:profile}),maybeSingle:async()=>result(t),range:async(a,b)=>{const r=result(t);return r.error?r:{data:r.data.slice(a,b+1)}},then(ok,fail){return Promise.resolve(result(t)).then(ok,fail)}};return q;},rpc:async name=>{window.calls.push('rpc:'+name);throw Error('No se autoriza escribir en este fixture');}};
    window.supabase={createClient:()=>sb};window.reportSb=sb;window.profile=profile;
  });
  await page.goto('https://kora.test'+route);
  await page.addScriptTag({url:'https://kora.test/creditek/erp/kora-report-export.js'});
  return {context,page};
}

test('Banco exporta saldo y pagos exactos por estado; directorio exporta todas las páginas sin escrituras',async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const bank=await fixture(browser,'/creditek/erp/banco-creditek.html');
    await bank.page.getByText('Compra de prueba',{exact:false}).waitFor();
    const report=await bank.page.evaluate(()=>window.KoraReportExport.snapshot(window.profile));
    assert.ok(report.metrics.some(([label,value])=>label==='Saldo de control de Banco'&&value==='$ 1.000.000,25'));
    assert.equal(report.tables.find(t=>t.heading.endsWith('autorizado')).totalRows[0][4],'$ 120.000,25');
    assert.ok(report.tables.find(t=>t.heading.endsWith('pagado')).rows.some(row=>row.includes('Compra anterior')));
    assert.match(JSON.stringify(report.filters),/200 solicitudes/);
    assert.ok((await bank.page.evaluate(()=>window.calls)).every(call=>call.startsWith('read:')));
    await bank.context.close();
    const directory=await fixture(browser,'/fixture');
    await directory.page.addScriptTag({url:'https://kora.test/creditek/erp/tesoreria-clientes.js'});
    await directory.page.evaluate(async()=>{await window.CreditekTesoreriaClientes.create({sb:window.reportSb,profile:window.profile}).mount(document.querySelector('#directory'));});
    assert.equal(await directory.page.locator('.tc-row').count(),10);
    const full=await directory.page.evaluate(()=>window.KoraReportExport.snapshot(window.profile));
    assert.equal(full.tables[0].rows.length,21);
    assert.match(full.tables[0].totalRows[0][0],/21/);
    assert.doesNotMatch(JSON.stringify(full),/0123456789/,'conserva el enmascaramiento de las cuentas');
    await directory.page.locator('#clientSearch').fill('Comercio 20');
    const filtered=await directory.page.evaluate(()=>window.KoraReportExport.snapshot(window.profile,{mode:'summary'}));
    assert.match(JSON.stringify(filtered.filters),/Comercio 20/);
    assert.doesNotMatch(JSON.stringify(filtered.tables),/Titular 20/,'resumido no expone fichas individuales');
    assert.ok((await directory.page.evaluate(()=>window.calls)).every(call=>call.startsWith('read:')));
    await directory.context.close();
  }finally{await browser.close();}
});

test('adaptador común prepara una vez y proyecta solo totales en resumen PDF o Excel',async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const {page,context}=await fixture(browser,'/fixture');
    const report=await page.evaluate(async()=>{
      document.querySelector('main').insertAdjacentHTML('beforeend','<div class="filters"><select id="filtroEstado" aria-label="Campo 5"><option value="approved">Autorizado</option></select></div>');
      window.KoraReportData={async prepareExcel(base){window.preparations=(window.preparations||0)+1;return {...base,tables:[{heading:'Detalle nativo',headers:['Beneficiario','Valor COP'],rows:[['Persona individual',120000.25]],sumColumns:[1],currencyColumns:[1]}]};}};
      return await window.KoraReportExport.prepareReport(window.profile,{mode:'summary'});
    });
    assert.equal(await page.evaluate(()=>window.preparations),1);
    assert.equal(report.mode,'summary');assert.doesNotMatch(JSON.stringify(report.tables),/Persona individual/);
    assert.ok(report.filters.some(([label,value])=>label==='Estado'&&value==='Autorizado'));assert.doesNotMatch(JSON.stringify(report.filters),/Campo 5/);
    assert.equal(report.tables[0].rows[0][1],'$ 120.000,25');
    const html=await page.evaluate(report=>window.KoraReportExport.pdfDocument(report),report);
    assert.match(html,/120\.000,25/);assert.doesNotMatch(html,/Persona individual/);
    await context.close();
  }finally{await browser.close();}
});

test('presupuesto Retail conserva centavos en días, total mensual y resumen',async()=>{
  const source=await readFile('creditek/erp/presupuestos.html','utf8');
  const render=source.slice(source.indexOf('function renderTabla()'),source.indexOf('function abrirModalCelda('));
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const {page,context}=await fixture(browser,'/fixture');
    await page.evaluate(()=>{
      document.querySelector('main').innerHTML='<h1>Presupuestos</h1><input id="verMes" value="2026-10"><div class="tabs"><button class="activo">Ventas</button></div><section id="totalesMes" hidden><h2 id="totalesMesTitulo"></h2><div id="totalesMesValores"></div></section><table id="tablaPresupuesto"><thead><tr id="theadFila"></tr></thead><tbody id="tbodyPresupuesto"></tbody><tfoot id="tfootPresupuesto"></tfoot></table><div id="emptyPresupuesto"></div>';
      window.tiendasCache=[{codigo:'TEST',nombre:'Tienda de prueba'}];
      window.presupuestoCache=[{tienda_codigo:'TEST',fecha:'2026-10-01',meta_venta_total:100000.10},{tienda_codigo:'TEST',fecha:'2026-10-02',meta_venta_total:200000.20}];
      window.metricaActual='meta_venta_total';window.propuestaActual=null;window.diasDelMesSeleccionado=()=>({y:2026,m:10,dias:31});
      window.fmtCOP=n=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(n);
      window.escapeHtml=String;window.abrirModalCelda=()=>{};
    });
    await page.addScriptTag({content:render+'\nrenderTabla();'});
    const reports=await page.evaluate(()=>({full:window.KoraReportExport.snapshot(window.profile),summary:window.KoraReportExport.snapshot(window.profile,{mode:'summary'})}));
    assert.equal(reports.full.tables[0].rows[0][1],'$ 100.000,10');
    assert.equal(reports.full.tables[0].totalRows[0].at(-1),'$ 300.000,30');
    assert.deepEqual(reports.summary.tables[0].headers,['Tienda','Total mes']);
    assert.equal(reports.summary.tables[0].rows[0][1],'$ 300.000,30');
    assert.ok(reports.full.filters.some(([label,value])=>label==='Mes del presupuesto'&&value==='2026-10'));
    await page.evaluate(()=>{window.presupuestoCache=[];renderTabla();});
    assert.match(await page.evaluate(()=>{try{window.KoraReportExport.snapshot(window.profile);return 'permitido';}catch(error){return error.message;}}),/Consulta un presupuesto/);
    await context.close();
  }finally{await browser.close();}
});
