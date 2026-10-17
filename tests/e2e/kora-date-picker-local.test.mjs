import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium,webkit} from '@playwright/test';

test('fechas Aliados: mismo calendario en Chrome y WebKit, sin cambiar días, filtros o informes',async()=>{
  const signatures=[];
  for(const [engine,type,options] of [['chrome',chromium,{channel:'chrome',headless:true}],['webkit',webkit,{headless:true}]]){
    const browser=await type.launch(options);
    try {
      const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.clock.install({time:new Date('2026-10-07T14:35:00Z')});
      await page.route('**/*',async route=>{
        const url=new URL(route.request().url());
        if(url.hostname!=='kora.test')return route.abort();
        if(/sidebar\.js|kora-access-control\.js|kora-environment/.test(url.pathname))return route.fulfill({contentType:'text/javascript',body:''});
        const file=resolve(process.cwd(),'.'+url.pathname);
        if(!file.startsWith(process.cwd()+'/'))return route.abort();
        try{await route.fulfill({contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[extname(file)]||'application/octet-stream',body:await readFile(file)});}catch{await route.fulfill({status:404,body:''});}
      });
      await page.addInitScript(()=>{
        const data={liquidation_operations:['2026-09-15','2026-10-05'].map((day,index)=>({id:`date-${index}`,external_id:`DATE-${index}`,plataforma:'payjoy',operation_at:`${day}T17:00:00Z`,tipo_establecimiento:'aliado',establishment_name:'Prueba de fechas',monto_base:100000,utilidad_creditek:10000}))};
        window.creditekSidebar={perfil:{rol:'gerencia',activo:true},sb:{from(table){const query=new Proxy({}, {get(_,key){if(key==='then')return ok=>Promise.resolve({data:data[table]||[]}).then(ok);return ()=>query;}});return query;},async rpc(name){return {data:name==='es_controlador_financiero'?true:name==='addi_liquidaciones_listar'?[]:null};}}};
      });
      await page.goto('https://kora.test/creditek/erp/aliados-dashboard.html');
      await page.getByRole('heading',{name:'Cómo se obtiene la utilidad'}).waitFor();
      // The real shell installs this stylesheet/class; load it without authenticating a user.
      await page.addStyleTag({url:'https://kora.test/design-system/components/kora-responsive.css'});
      await page.evaluate(()=>document.body.classList.add('kora-responsive-ready'));
      const from=page.locator('#dashboardFrom-display'),to=page.locator('#dashboardTo-display');
      const calendar=page.locator('#dashboardFrom-calendar'),open=page.locator('.kora-date-field').first().locator('.kora-date-open');
      assert.equal(await from.inputValue(),'01/10/2026',engine);
      assert.equal(await to.inputValue(),'07/10/2026',engine);
      assert.equal(await page.locator('#dashboardFrom').getAttribute('type'),'date');
      assert.equal(await page.locator('#dashboardFrom').isVisible(),false);
      assert.equal(await open.locator('svg').count(),1);
      assert.match(await page.locator('#dashboardFilterSummary').textContent(),/1 créditos/);
      await from.fill('01/09/2026');await from.press('Enter');
      await to.fill('30/09/2026');await to.press('Enter');
      assert.equal(await page.locator('#dashboardFrom').inputValue(),'2026-09-01');
      assert.equal(await page.locator('#dashboardTo').inputValue(),'2026-09-30');
      assert.match(await page.locator('#dashboardFilterSummary').textContent(),/1 créditos/);
      await to.fill('31/09/2026');await to.press('Enter');
      assert.equal(await to.inputValue(),'30/09/2026');
      assert.equal(await page.locator('#dashboardTo').inputValue(),'2026-09-30');
      assert.equal(await to.getAttribute('aria-invalid'),'true');
      assert.match(await page.locator('#dashboardTo-error').textContent(),/No se cambió el filtro/);
      await open.click();
      await calendar.waitFor({state:'visible'});
      assert.equal(await calendar.locator('td[aria-selected="true"] button').getAttribute('data-date'),'2026-09-01');
      assert.equal(await page.evaluate(()=>document.activeElement.dataset.date),'2026-09-01');
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.evaluate(()=>document.activeElement.dataset.date),'2026-09-02');
      await page.keyboard.press('PageDown');
      assert.equal(await page.evaluate(()=>document.activeElement.dataset.date),'2026-10-02');
      await page.keyboard.press('Shift+PageUp');
      assert.equal(await page.evaluate(()=>document.activeElement.dataset.date),'2025-10-02');
      await page.keyboard.press('Escape');
      assert.equal(await calendar.isVisible(),false);
      assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('kora-date-open')),true);
      assert.equal(await from.inputValue(),'01/09/2026');
      await open.click();
      assert.notEqual(await calendar.locator('td[aria-selected="true"] button').evaluate(element=>getComputedStyle(element).backgroundColor),await calendar.locator('[data-date="2026-09-02"]').evaluate(element=>getComputedStyle(element).backgroundColor),'fecha seleccionada distinguible');
      signatures.push(await calendar.evaluate(element=>({title:element.querySelector('h2').textContent,month:element.querySelector('h3').textContent,days:[...element.querySelectorAll('tbody button')].map(button=>[button.textContent,button.dataset.date,button.tabIndex]),headers:[...element.querySelectorAll('th')].map(th=>th.textContent),icon:document.querySelector('.kora-date-open').innerHTML})));
      for(const width of [1280,900,390]){
        await page.setViewportSize({width,height:900});
        const bounds=await calendar.boundingBox();
        assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1,`${engine}: calendario dentro de ${width}px`);
        assert.ok(await page.locator('.toolbar').evaluate(element=>element.scrollWidth<=element.clientWidth+1),`${engine}: filtros sin desbordar ${width}px`);
        if(process.env.KORA_DATE_QA_DIR){await mkdir(process.env.KORA_DATE_QA_DIR,{recursive:true});await page.screenshot({path:resolve(process.env.KORA_DATE_QA_DIR,`calendario-${engine}-${width}.png`)});}
      }
      await page.setViewportSize({width:1280,height:900});
      await calendar.getByRole('button',{name:'Mes siguiente',exact:true}).click();
      await calendar.locator('[data-date="2026-10-05"]').click();
      assert.equal(await from.inputValue(),'05/10/2026');
      assert.equal(await page.locator('#dashboardFrom').inputValue(),'2026-10-05');
      assert.equal(await calendar.isVisible(),false);
      await to.fill('07/10/2026');await to.press('Enter');
      assert.match(await page.locator('#dashboardFilterSummary').textContent(),/1 créditos/);
      // A month restriction cannot silently alter focus when Today falls outside it.
      await from.fill('01/09/2026');await from.press('Enter');
      await page.locator('#dashboardFrom').evaluate(element=>{element.min='2026-09-01';element.max='2026-09-30';});
      await open.click();
      await calendar.getByRole('button',{name:'Hoy',exact:true}).click();
      assert.match(await calendar.locator('h3').textContent(),/Septiembre de 2026/);
      await calendar.locator('[data-date="2026-09-01"]').focus();await page.keyboard.press('ArrowLeft');
      assert.equal(await page.evaluate(()=>document.activeElement.dataset.date),'2026-09-01');
      await calendar.getByRole('button',{name:'Cerrar',exact:true}).click();
      await page.locator('#dashboardFrom').evaluate(element=>{element.min='';element.max='';});
      await open.click();await calendar.getByRole('button',{name:'Hoy',exact:true}).click();
      assert.equal(await page.evaluate(()=>document.activeElement.dataset.date),'2026-10-07');
      await calendar.locator('[data-date="2026-10-07"]').click();
      assert.equal(await from.inputValue(),'07/10/2026');
      await open.click();await calendar.getByRole('button',{name:'Borrar fecha',exact:true}).click();
      assert.equal(await from.inputValue(),'');assert.equal(await page.locator('#dashboardFrom').inputValue(),'');
      await page.locator('#dashboardClear').click();
      assert.equal(await to.inputValue(),'');assert.equal(await page.locator('#dashboardTo').inputValue(),'');
      assert.match(await page.locator('#dashboardFilterSummary').textContent(),/2 créditos/);
      assert.equal(await page.locator('.kora-date-field').count(),2);
      assert.equal(await page.locator('dialog.kora-date-dialog').count(),2);
      await from.fill('01/09/2026');await from.press('Enter');
      await to.fill('30/09/2026');await to.press('Enter');
      await page.addScriptTag({url:'https://kora.test/creditek/erp/kora-report-export.js'});
      await open.click();
      const report=await page.evaluate(()=>window.KoraReportExport.snapshot(window.creditekSidebar.perfil));
      assert.deepEqual(report.filters.filter(([label])=>label==='Periodo desde'),[['Periodo desde','01/09/2026']]);
      assert.deepEqual(report.filters.filter(([label])=>label==='Periodo hasta'),[['Periodo hasta','30/09/2026']]);
      assert.doesNotMatch(JSON.stringify(report),/Elegir fecha ·|Borrar fecha|No se cambió el filtro/);
      assert.deepEqual(errors,[],engine);
    }finally{await browser.close();}
  }
  assert.deepEqual(signatures[0],signatures[1],'mismo contenido, calendario y SVG en ambos motores');
});
