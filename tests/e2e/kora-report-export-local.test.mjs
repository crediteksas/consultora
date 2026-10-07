import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from '@playwright/test';
import XLSX from 'xlsx';

test('informes Aliados: sin tienda del shell, dos variantes y mismos totales autorizados',async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const context=await browser.newContext(),page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.hostname!=='kora.test')return route.abort();
      if(/sidebar\.js|kora-access-control\.js|kora-environment/.test(url.pathname))return route.fulfill({contentType:'text/javascript',body:''});
      const file=resolve(process.cwd(),'.'+url.pathname);
      if(!file.startsWith(process.cwd()+'/'))return route.abort();
      try{await route.fulfill({contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[extname(file)]||'application/octet-stream',body:await readFile(file)});}catch{await route.fulfill({status:404,body:''});}
    });
    await page.addInitScript(()=>{
      const operations=Array.from({length:82},(_,i)=>({id:`test-${i}`,external_id:`TEST-${i}`,plataforma:'krediya',operation_at:'2026-09-15T17:00:00Z',tipo_establecimiento:'aliado',establishment_name:'Establecimiento de prueba',monto_base:53734962/82,bonos_aplicados:4100000/82,utilidad_creditek:9450360.09/82,policy_snapshot:{krediya_v2:{gasto_financiero:214939.85/82,provision:3675140.06/82}}}));
      const expenses=[6,13,20,27].map(day=>({id:`g-${day}`,fecha_causacion_historica:`2026-09-${String(day).padStart(2,'0')}`,aprobado_at:'2026-10-06T22:20:00Z',estado:'pagado',plataforma:'krediya',concepto:'Viáticos y eventos',valor:450000}));
      expenses.push({id:'general',aprobado_at:'2026-09-30T17:00:00Z',estado:'aprobado',general:true,concepto:'Gasto general de prueba',valor:100000});
      const data={liquidation_operations:operations,aliados_gastos_operativos:expenses,origenes:[{codigo:'CK-09',nombre:'Kredisinu'}]};
      window.creditekSidebar={perfil:{rol:'gerencia',activo:true,nombre:'Óscar'},sb:{from(table){const query=new Proxy({}, {get(_,key){if(key==='then')return ok=>Promise.resolve({data:data[table]||[]}).then(ok);return ()=>query;}});return query;},async rpc(name,params){window.lastReportAudit={name,params};return {data:name==='es_controlador_financiero'?true:name==='addi_liquidaciones_listar'?[]:null};}}};
    });
    await page.goto('https://kora.test/creditek/erp/aliados-dashboard.html');
    await page.getByRole('heading',{name:'Cómo se obtiene la utilidad'}).waitFor();
    await page.locator('#dashboardFrom').fill('2026-09-01');
    await page.locator('#dashboardTo').fill('2026-09-30');
    await page.locator('#dashboardPlatform').selectOption('krediya');
    await page.evaluate(()=>{
      document.body.insertAdjacentHTML('afterbegin','<select id="koraStoreSelector"><option value="CK-09" selected>Kredisinu</option></select><div class="kora-topbar__actions"></div>');
    });
    await page.addScriptTag({url:'https://kora.test/creditek/erp/kora-report-export.js'});
    const reports=await page.evaluate(()=>{
      const profile=window.creditekSidebar.perfil;
      window.KoraReportExport.mount({profile,sb:window.creditekSidebar.sb});
      return {summary:window.KoraReportExport.snapshot(profile,{mode:'summary'}),detailed:window.KoraReportExport.snapshot(profile)};
    });
    assert.doesNotMatch(JSON.stringify(reports),/Kredisinu|CK-09/);
    assert.equal(reports.summary.scope.restricted,false);
    assert.deepEqual(reports.summary.tables.map(table=>table.heading),['Resumen por plataforma','Cómo se obtiene la utilidad']);
    assert.deepEqual(reports.summary.metrics,reports.detailed.metrics);
    assert.equal(reports.summary.metrics.find(([label])=>label==='Gastos aplicados a esta vista')[1],'$ 1.800.000');
    assert.equal(reports.summary.metrics.find(([label])=>label==='Créditos del periodo')[1],'82');
    assert.match(reports.summary.notes.join(' '),/gastos generales/);
    assert.ok(reports.detailed.tables.some(table=>table.heading==='Gastos históricos ya pagados'&&table.rows.length===4));
    assert.ok(reports.detailed.tables.some(table=>table.heading==='Operaciones del periodo'));
    assert.ok(!reports.detailed.tables.some(table=>/Histórico inicial/.test(table.heading)),'no exportar el detalle cerrado');
    assert.equal(await page.locator('[data-kora-report-summary]').isChecked(),false);
    await page.getByRole('button',{name:'Generar informe',exact:true}).click();
    const [completePopup]=await Promise.all([page.waitForEvent('popup'),page.getByRole('button',{name:'Generar PDF',exact:true}).click()]);
    await completePopup.getByRole('heading',{name:'Operaciones del periodo'}).waitFor();
    assert.match(await completePopup.locator('body').textContent(),/Viáticos y eventos/);
    assert.equal(await page.evaluate(()=>window.lastReportAudit.params.p_filtros['Formato del informe']),'Detallado · datos y movimientos');
    await completePopup.close();
    await page.getByRole('button',{name:'Generar informe',exact:true}).click();
    await page.getByRole('checkbox',{name:'Resumido',exact:true}).check();
    const [popup]=await Promise.all([page.waitForEvent('popup'),page.getByRole('button',{name:'Generar PDF',exact:true}).click()]);
    await popup.getByRole('heading',{name:'Resumen por plataforma'}).waitFor();
    await popup.waitForFunction(()=>{const img=document.querySelector('.brand img');return img?.complete&&img.naturalWidth>0;},null,{timeout:10000}).catch(async error=>{throw new Error(`${error.message} · ${JSON.stringify(await popup.locator('.brand img').evaluate(img=>({src:img.src,complete:img.complete,width:img.naturalWidth,base:document.baseURI})))}`)});
    assert.doesNotMatch(await popup.locator('body').textContent(),/Kredisinu|Operaciones del periodo|Viáticos y eventos/);
    assert.match(await popup.locator('body').textContent(),/7\.650\.360/);
    assert.equal(await page.evaluate(()=>window.lastReportAudit.params.p_filtros['Formato del informe']),'Resumido · solo totales');
    assert.equal(await popup.evaluate(()=>window.opener),null);
    if(process.env.KORA_REPORT_QA_DIR){
      await mkdir(process.env.KORA_REPORT_QA_DIR,{recursive:true});
      await popup.pdf({path:resolve(process.env.KORA_REPORT_QA_DIR,'aliados-resumido-prueba.pdf'),preferCSSPageSize:true,printBackground:true});
      const logo=await popup.locator('.brand img').getAttribute('src');
      const html=await page.evaluate(({report,logo})=>window.KoraReportExport.pdfDocument(report,logo),{report:reports.detailed,logo});
      await popup.setContent(html);
      await popup.waitForFunction(()=>{const img=document.querySelector('.brand img');return img?.complete&&img.naturalWidth>0;},null,{timeout:10000});
      await popup.pdf({path:resolve(process.env.KORA_REPORT_QA_DIR,'aliados-detallado-prueba.pdf'),preferCSSPageSize:true,printBackground:true});
    }
    await popup.close();
    if(process.env.KORA_REPORT_EXCELJS_PATH){
      await page.addScriptTag({path:process.env.KORA_REPORT_EXCELJS_PATH});
      await page.evaluate(()=>{window.KoraReportData={prepareExcel(){throw new Error('El resumido no debe cargar operaciones individuales.');}};});
      await page.getByRole('button',{name:'Generar informe',exact:true}).click();
      const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Descargar Excel',exact:true}).click()]);
      const stream=await download.createReadStream(),chunks=[];
      for await(const chunk of stream)chunks.push(chunk);
      const workbook=XLSX.read(Buffer.concat(chunks),{type:'buffer',cellFormula:true});
      assert.equal(workbook.SheetNames.length,3);
      assert.doesNotMatch(workbook.SheetNames.join(' '),/Operaciones|históricos/);
      const reconciliationSheet=workbook.Sheets[workbook.SheetNames.find(name=>name.includes('Cómo se obtiene'))];
      const rows=XLSX.utils.sheet_to_json(reconciliationSheet,{header:1});
      assert.equal(rows.find(row=>row[0]==='Utilidad antes de gastos generales')[1],7650360.09);
      assert.equal(rows.find(row=>row[0]==='Menos: gastos operativos aprobados')[1],-1800000);
      assert.doesNotMatch(JSON.stringify(reconciliationSheet),/SUBTOTAL\(109/,'no sumar bruta, descuentos y neta nuevamente');
      assert.equal(await page.evaluate(()=>window.lastReportAudit.params.p_formato),'xlsx');
    }
    const owned=await page.evaluate(()=>window.KoraReportExport.reportScope({rol:'admin_tienda',tienda_codigo:'CK-09'}));
    assert.equal(owned.code,'CK-09');assert.equal(owned.restricted,true);
    await page.evaluate(()=>{
      document.querySelector('#content').insertAdjacentHTML('beforeend','<section class="card"><h2>Totales de prueba</h2><table><thead><tr><th>Tienda</th><th>Venta</th><th>Valor</th></tr></thead><tbody><tr><td>A</td><td>1</td><td>$ 45.000</td></tr></tbody><tfoot><tr><th colspan="2">TOTAL</th><td>$ 45.000</td></tr></tfoot></table></section>');
    });
    const totals=await page.evaluate(()=>window.KoraReportExport.snapshot(window.creditekSidebar.perfil,{mode:'summary'}).tables.at(-1));
    assert.deepEqual(totals.rows,[['TOTAL','','$ 45.000']]);
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});

test('la misma casilla funciona en informes Retail y B2B; completo por defecto y resumen sin filas individuales',async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    for(const [route,title] of [['reportes.html','Informes Retail'],['utilidad-creditek.html','Dashboard B2B']]){
      const html=await readFile(`creditek/erp/${route}`,'utf8');
      const kpis=html.match(/<section class="kpi-grid[^>]*>[\s\S]*?<\/section>/)?.[0];
      assert.ok(kpis,`tarjetas reales de ${route}`);
      const context=await browser.newContext(),page=await context.newPage();
      await context.route('https://kora.test/**',request=>request.fulfill({contentType:'text/html',body:`<!doctype html><div class="kora-topbar__actions"></div><main><h1>${title}</h1>${kpis}<section><h2>Movimientos del periodo</h2><table><thead><tr><th>Referencia</th><th>Unidades</th><th>Valor</th></tr></thead><tbody><tr><td>Referencia individual A</td><td>2</td><td>$ 80.000</td></tr><tr><td>Referencia individual B</td><td>1</td><td>$ 40.000</td></tr></tbody><tfoot><tr><th>TOTAL</th><td>3</td><td>$ 120.000</td></tr></tfoot></table></section></main>`}));
      await page.goto(`https://kora.test/creditek/erp/${route}`);
      await page.evaluate(()=>document.querySelectorAll('.valor,.kpi-value').forEach(card=>card.textContent='$ 120.000'));
      await page.addScriptTag({path:resolve('creditek/erp/kora-report-export.js')});
      const reports=await page.evaluate(()=>{
        const profile={rol:'gerencia',nombre:'Óscar'};
        window.KoraReportExport.mount({profile});
        return {detailed:window.KoraReportExport.snapshot(profile),summary:window.KoraReportExport.snapshot(profile,{mode:'summary'})};
      });
      await page.getByRole('button',{name:'Generar informe',exact:true}).click();
      const checkbox=page.getByRole('checkbox',{name:'Resumido',exact:true});
      assert.equal(await checkbox.isChecked(),false);
      await checkbox.check();assert.equal(await checkbox.isChecked(),true);
      assert.equal(reports.detailed.mode,'detailed');
      assert.ok(reports.summary.metrics.some(([,value])=>value==='$ 120.000'),`${title}: mantiene los totales de las tarjetas reales`);
      assert.deepEqual(reports.summary.metrics,reports.detailed.metrics);
      assert.match(JSON.stringify(reports.detailed.tables),/Referencia individual A/);
      assert.doesNotMatch(JSON.stringify(reports.summary.tables),/Referencia individual/);
      assert.deepEqual(reports.summary.tables[0].rows,[['TOTAL','3','$ 120.000']]);
      await context.close();
    }
  }finally{await browser.close();}
});
