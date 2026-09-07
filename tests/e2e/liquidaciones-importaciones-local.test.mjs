import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium,webkit} from '@playwright/test';

for(const engine of ['chromium','webkit'])test(`Gestión retira un lote y descarta vista previa; responsive ${engine}`,async()=>{
  const browser=await (engine==='chromium'?chromium:webkit).launch(engine==='chromium'?{channel:'chrome',headless:true}:{headless:true});
  const root=process.cwd(),page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.hostname!=='kora.test')return route.abort();
      if(/sidebar\.js|kora-access-control\.js|kora-environment/.test(url.pathname))return route.fulfill({contentType:'text/javascript',body:''});
      const file=resolve(root,'.'+url.pathname);
      if(!file.startsWith(root+'/'))return route.abort();
      try{await route.fulfill({contentType:({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[extname(file)]||'application/octet-stream',body:await readFile(file)});}
      catch{await route.fulfill({status:404,body:''});}
    });
    await page.addInitScript(()=>{
      window.testCalls=[];window.testFailure=false;window.testApprove=false;window.testRemoved=false;
      const fixture=()=>({id:'lote-alo',plataforma:'alo',estado:window.testApprove?'aprobada':'con_novedades',fecha_corte:'2026-09-06',imported_at:'2026-09-07T15:00:00Z',liquidation_operations:[],liquidation_imported_files:[{original_name:'ALO CREDIT - ARCHIVO ERRONEO DE PRUEBA.xlsx'}]});
      window.creditekSidebar={perfil:{rol:'auditoria'},sb:{
        auth:{getSession:async()=>({data:{session:{user:{id:'gestion'}}}})},
        from(table){let single=false;const query={select(){return query;},eq(){return query;},order(){return query;},maybeSingle(){single=true;return query;},then(ok,bad){const rows=table==='aliados_operadores'?[{capacidad:'revisor'}]:table==='liquidations'?(window.testRemoved?[]:[fixture()]):[];return Promise.resolve({data:single?(rows[0]||null):rows,error:null}).then(ok,bad);}};return query;},
        async rpc(name,params){window.testCalls.push({name,params});
          if(name==='tiene_capacidad_aliados')return {data:true};
          if(name!=='aliados_eliminar_importacion')throw Error('Mutación no esperada: '+name);
          if(window.testFailure)return {error:{message:'No se puede eliminar: existen órdenes autorizadas'}};
          window.testRemoved=true;return {data:{retirada:true}};
        }
      }};
      // Parser doble: prueba la protección de la vista previa, no el formato Excel.
      window.XLSX={read:()=>({Sheets:{Worksheet:{}},SheetNames:['Worksheet']}),utils:{sheet_to_json:()=>[]}};
    });
    await page.goto('https://kora.test/creditek/erp/aliados-liquidaciones.html');
    await page.evaluate(()=>document.getElementById('app').classList.remove('hidden'));
    await page.locator('[data-open="lote-alo"]').click();
    await page.locator('#removeImport').click();
    await page.getByRole('button',{name:'Eliminar este lote',exact:true}).waitFor();
    assert.match(await page.locator('dialog').textContent(),/ALO CREDIT - ARCHIVO ERRONEO/);
    for(const size of [{width:390,height:844},{width:844,height:390},{width:768,height:1024},{width:1280,height:900}]){
      await page.setViewportSize(size);
      assert.ok(await page.locator('dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1),`dialog overflow ${JSON.stringify(size)}`);
      await page.getByRole('button',{name:'Eliminar este lote',exact:true}).scrollIntoViewIfNeeded();
    }
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:`/private/tmp/alo-eliminar-${engine}.png`});
    await page.locator('dialog [data-close]').click();
    assert.equal((await page.evaluate(()=>window.testCalls)).filter(c=>c.name==='aliados_eliminar_importacion').length,0);
    // El estado cambia en el servidor después de abrir el detalle.
    await page.evaluate(()=>window.testApprove=true);await page.locator('#removeImport').click();
    await page.waitForFunction(()=>document.querySelector('dialog [role=alert]')?.textContent.includes('aprobado'));
    assert.equal(await page.getByRole('button',{name:'Eliminar este lote',exact:true}).count(),0);
    await page.keyboard.press('Escape');await page.evaluate(()=>{window.testApprove=false;window.testFailure=true;});
    await page.locator('#removeImport').click();await page.locator('dialog textarea').fill('Archivo con valores incorrectos');
    await page.getByRole('button',{name:'Eliminar este lote',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('dialog [role=alert]')?.textContent.includes('órdenes autorizadas'));
    assert.equal(await page.locator('dialog textarea').inputValue(),'Archivo con valores incorrectos');
    await page.evaluate(()=>window.testFailure=false);
    await page.getByRole('button',{name:'Eliminar este lote',exact:true}).click();
    await page.waitForFunction(()=>document.getElementById('lastUpdated').textContent.includes('eliminada con respaldo'));
    assert.equal(await page.locator('[data-open="lote-alo"]').count(),0);
    assert.equal(await page.locator('#detail').isVisible(),false);
    await page.locator('#newImport').click();await page.locator('#importPlatform').selectOption('alo');
    await page.evaluate(()=>{window.CreditekAliadosLiquidaciones.importarAlo=()=>({filasOriginales:[{}],operaciones:[{sourceKey:'1',movimientos:[]}],incidencias:[]});});
    const file={name:'prueba-alo.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('fixture')};
    await page.locator('#file').setInputFiles(file);await page.locator('#validateImport').click();
    await page.waitForFunction(()=>!document.getElementById('saveImport').disabled);
    await page.locator('#file').setInputFiles({...file,name:'otro-archivo.xlsx'});
    assert.equal(await page.locator('#saveImport').isDisabled(),true);
    assert.equal(await page.locator('#preview').isVisible(),false);
    await page.locator('#validateImport').click();await page.waitForFunction(()=>!document.getElementById('saveImport').disabled);
    await page.locator('#cutoff').fill('2026-09-07');await page.locator('#periodFrom').focus();
    assert.equal(await page.locator('#saveImport').isDisabled(),true);
    await page.locator('#discardImportFile').click();assert.equal(await page.locator('#file').inputValue(),'');
    assert.equal(await page.locator('#saveImport').isDisabled(),true);
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});
