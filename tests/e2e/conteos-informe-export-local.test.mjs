import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from '@playwright/test';
import XLSX from 'xlsx';

test('informe mensual: controles alineados, PDF/Excel corporativos y mismos totales sin mutaciones',async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    const inventory=await readFile('creditek/erp/inventario.html','utf8');
    const html=`<!doctype html><style>${inventory.match(/<style>([\s\S]*?)<\/style>/)[1]}</style><body></body>`;
    await page.route('https://kora.test/**',async route=>{
      if(route.request().url().endsWith('creditek-logo.png'))return route.fulfill({contentType:'image/png',body:await readFile('creditek/shared/branding/creditek-logo.png')});
      return route.fulfill({contentType:'text/html',body:html});
    });
    await page.goto('https://kora.test/creditek/erp/inventario.html');
    await page.addScriptTag({path:resolve('creditek/erp/kora-report-export.js')});
    await page.addScriptTag({path:resolve('creditek/erp/conteos-ui.js')});
    if(process.env.KORA_REPORT_EXCELJS_PATH)await page.addScriptTag({path:process.env.KORA_REPORT_EXCELJS_PATH});
    await page.evaluate(async()=>{
      const tiendas=Array.from({length:9},(_,i)=>({codigo:`CK-${i+1}`,nombre:`Tienda prueba ${i+1}`}));
      const cortes=tiendas.map(t=>({id:`corte-${t.codigo}`,tienda_codigo:t.codigo,tienda_nombre:t.nombre,estado:'aplicado',base_conteo:'corte_fijo',corte_at:'2026-10-07T15:00:00Z',contado_at:'2026-10-07T15:00:00Z',autorizado_at:'2026-10-08T15:00:00Z'}));
      window.testCalls=[];
      const sb={rpc:async(name,args)=>{
        testCalls.push({name,...args});
        if(name==='kora_registrar_exportacion'){window.reportAudit=args;return {};}
        if(name==='cierre_utilidad_retail')return {data:{corte_id:args.p_corte_id,inicio_at:'2026-09-04T05:00:00Z',ventas_totales:1000.25,costo_vendido:600,gastos_totales:100,perdidas_ajustes:20,ganancias_ajustes:10,ajuste_conciliacion:5,utilidad_neta:295.25,cerrado:true,listo:true}};
        const action=args.p_accion;
        if(action==='config')return {data:{central:true,autoriza:true,tiendas}};
        if(action==='informe')return {data:{cortes}};
        if(action==='ver')return {data:{corte:cortes.find(c=>c.id===args.p_datos.id),lineas:[{nombre:'Equipo de prueba',codigo:'000REF',imei:'000000000000001',cantidad_corte:11,cantidad_fisica:10,diferencia:-1,costo_tienda:100.25}]}};
        return {data:{registros:[],tareas:[],filas:[]}};
      }};
      window.testUI=KoraConteosUI.init({sb,XLSX:{},tiendaActual:()=>'',refrescar:async()=>{},perfil:{nombre:'Responsable de prueba',rol:'gerencia'}});
      await testUI.abrir();document.querySelector('#conteos-mes').value='2026-10';
    });
    await page.locator('#conteos-mensual-panel').scrollIntoViewIfNeeded();
    const geometry=await page.evaluate(()=>{
      const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
      return {box:rect('conteos-mes-resumido'),label:document.querySelector('.conteos-resumido span').getBoundingClientRect().toJSON(),from:rect('conteos-desde'),to:rect('conteos-hasta'),button:rect('conteos-informe-mes'),color:getComputedStyle(document.getElementById('conteos-informe-mes')).backgroundColor};
    });
    assert.ok(geometry.box.width<=20);assert.ok(geometry.label.x-geometry.box.x<35);
    assert.ok(Math.abs(geometry.label.y-geometry.box.y)<15);assert.equal(geometry.from.y,geometry.to.y);
    assert.ok(geometry.to.x>geometry.from.x);assert.ok(geometry.button.width<500);assert.equal(geometry.color,'rgb(11, 30, 61)');
    await page.locator('#conteos-informe-mes').click();
    assert.equal(await page.locator('#conteos-formatos').isVisible(),true);
    const [popup]=await Promise.all([page.waitForEvent('popup'),page.locator('#conteos-mes-pdf').click()]);
    await popup.getByRole('heading',{name:'Ventas, gastos y utilidad'}).waitFor();
    await popup.waitForFunction(()=>document.querySelector('.brand img')?.naturalWidth>0);
    assert.equal(await popup.evaluate(()=>window.opener),null);
    const text=await popup.locator('body').textContent();assert.match(text,/KORA-REP-/);assert.match(text,/Responsable de prueba/);assert.match(text,/2\.657,25/);
    assert.doesNotMatch(text,/Equipo de prueba|Resultado no disponible/);
    assert.equal(await popup.locator('section').first().locator('tbody tr').count(),9);
    assert.equal(await popup.locator('section').first().locator('tfoot tr').count(),1);
    assert.equal(await popup.locator('tfoot').first().evaluate(node=>getComputedStyle(node).display),'table-row-group','El total se imprime solo al final de la tabla, no se repite en cada página');
    assert.equal(await page.evaluate(()=>reportAudit.p_formato),'pdf');
    assert.equal(await page.evaluate(()=>reportAudit.p_registros),18);
    const auditId=await page.evaluate(()=>reportAudit.p_reporte_id);assert.ok(text.includes(auditId));
    const qa=process.env.KORA_REPORT_QA_DIR;
    if(qa){await mkdir(qa,{recursive:true});await popup.pdf({path:resolve(qa,'inventarios-resumido-prueba.pdf'),preferCSSPageSize:true,printBackground:true});await page.screenshot({path:resolve(qa,'inventarios-controles-desktop.png')});}
    await popup.close();
    for(const summary of [true,false]){
      await page.locator('#conteos-mes-resumido').setChecked(summary);
      await page.locator('#conteos-informe-mes').click();
      const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#conteos-mes-excel').click()]);
      const stream=await download.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);
      const buffer=Buffer.concat(chunks),book=XLSX.read(buffer,{type:'buffer',cellNF:true,bookFiles:true});
      assert.ok(Object.keys(book.files).some(file=>file.startsWith('xl/media/')),'Logo incrustado, no vínculo externo');
      assert.match(JSON.stringify(book.Sheets.Informe),/KORA-REP-|Responsable de prueba/);
      const sheet=book.Sheets[book.SheetNames.find(name=>name.includes('Resumen tiendas'))];
      const rows=XLSX.utils.sheet_to_json(sheet,{range:7,defval:''});
      assert.equal(rows.length,10);assert.equal(rows.at(-1).Ventas,9002.25);assert.equal(rows.at(-1)['Utilidad neta'],2657.25);
      assert.equal(rows.at(-1).Desde,'');assert.equal(rows.at(-1).Hasta,'');
      assert.equal(sheet.B9.t,'n');assert.equal(sheet.B9.z,'dd/mm/yyyy hh:mm');assert.equal(sheet.D9.t,'n');
      assert.equal(sheet.B9.v,Date.parse('2026-09-04T00:00:00Z')/86400000+25569);
      assert.equal(book.SheetNames.some(name=>name.includes('Detalle inventario')),!summary);
      const sources=book.Sheets[book.SheetNames.find(name=>name.includes('Períodos y cortes'))];assert.match(JSON.stringify(sources),/corte-CK-9/);
      assert.equal(await page.evaluate(()=>reportAudit.p_formato),'xlsx');
      assert.equal(await page.evaluate(()=>reportAudit.p_registros),summary?18:27);
      if(qa)await download.saveAs(resolve(qa,`inventarios-${summary?'resumido':'completo'}-prueba.xlsx`));
    }
    await page.locator('#conteos-informe-mes').click();
    const [fullPdf]=await Promise.all([page.waitForEvent('popup'),page.locator('#conteos-mes-pdf').click()]);
    await fullPdf.getByRole('heading',{name:'Detalle inventario'}).waitFor();
    const fullText=await fullPdf.locator('body').textContent();assert.match(fullText,/000000000000001/);assert.match(fullText,/Costo: \$\s*100,25/);assert.match(fullText,/Inventario: \$\s*1\.002,50/);
    assert.equal(await page.evaluate(()=>reportAudit.p_registros),27);
    if(qa)await fullPdf.pdf({path:resolve(qa,'inventarios-completo-prueba.pdf'),preferCSSPageSize:true,printBackground:true});
    await fullPdf.close();
    await page.setViewportSize({width:390,height:844});await page.locator('#conteos-mensual-panel').scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    const mobile=await page.evaluate(()=>{const f=document.getElementById('conteos-desde').getBoundingClientRect(),t=document.getElementById('conteos-hasta').getBoundingClientRect();return {f:f.y,t:t.y};});assert.ok(mobile.t>mobile.f);
    if(qa)await page.screenshot({path:resolve(qa,'inventarios-controles-mobile.png')});
    assert.deepEqual(errors,[]);
    const calls=await page.evaluate(()=>testCalls);
    assert.ok(calls.every(call=>call.name==='kora_registrar_exportacion'||['config','informe','ver','listar','tareas_fotos','resumen','vista'].includes(call.p_accion)),'Solo consulta y auditoría; no aplica ajustes ni cambia saldos');
    // Fallo de logo explícito y no producir un archivo incompleto.
    await page.route('**/creditek-logo.png',route=>route.fulfill({status:503,body:''}));
    await page.locator('#conteos-informe-mes').click();await page.locator('#conteos-mes-excel').click();
    await page.getByRole('status').filter({hasText:'No fue posible cargar el logo'}).waitFor();
  }finally{await browser.close();}
});
