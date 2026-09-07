import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium,webkit} from '@playwright/test';
for(const engine of ['chromium','webkit'])test(`vinculación de comercios con perfil Gestión y responsive ${engine}`,async()=>{
  const browser=await (engine==='chromium'?chromium:webkit).launch(engine==='chromium'?{channel:'chrome',headless:true}:{headless:true});
  const root=process.cwd(),page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());if(url.hostname!=='kora.test')return route.abort();
      if(/sidebar\.js|kora-access-control\.js|kora-environment/.test(url.pathname))return route.fulfill({contentType:'text/javascript',body:''});
      const file=resolve(root,'.'+url.pathname);if(!file.startsWith(root+'/'))return route.abort();
      try{await route.fulfill({contentType:({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[extname(file)]||'application/octet-stream',body:await readFile(file)});}catch{await route.fulfill({status:404,body:''});}
    });
    await page.addInitScript(()=>{
      window.testCalls=[];window.testFailure=false;
      const operations=['FULL ACCESORIOS LA 72','CREDITEK COVEÑAS','Lachescel soluciones','Tienda 4','Tienda 5','Tienda 6'].map((name,i)=>({id:'op'+i,liquidation_id:'alo',plataforma:'alo',reconocida:true,establishment_name:name,referencia:'MOTOROLA G06 128GB',origen_codigo:i<3?null:'CK11',tipo_establecimiento:i<3?'no_reconocido':'propia',operation_at:'2026-09-02',monto_credito:1000,inicial:100}));
      const incidents=operations.slice(0,3).map((op,i)=>({id:'i'+i,operation_id:op.id,tipo:'comercio_no_reconocido',estado:i?'abierta':'resuelta',descripcion:'comercio_no_reconocido',bloquea_aprobacion:true,liquidation_operations:op}));
      const origins=[{codigo:'CK11',nombre:'Creditel Coveñas',ciudad:'Coveñas',tipo:'propia',activo:true}];
      window.creditekSidebar={perfil:{rol:'auditoria'},sb:{auth:{getSession:async()=>({data:{session:{user:{id:'gestion'}}}})},
        from(table){let single=false,filters=[];const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},order(){return q;},range(){return q;},maybeSingle(){single=true;return q;},then(ok,bad){
          let rows=table==='aliados_operadores'?[{capacidad:'revisor'}]:table==='liquidations'?[{id:'alo',plataforma:'alo',estado:'con_novedades',fecha_corte:'2026-09-06',imported_at:'2026-09-07T15:30:22Z',liquidation_operations:operations}]:table==='liquidation_operations'?operations:table==='liquidation_incidents'?incidents:table==='origenes'?origins:table==='ejecutivos'?[{id:'ejecutivo',nombre:'Ejecutivo de prueba',activo:true}]:[];
          rows=rows.filter(r=>filters.every(([k,v])=>r[k]===undefined||r[k]===v));return Promise.resolve({data:single?rows[0]:rows,error:null}).then(ok,bad);
        }};return q;},
        async rpc(name,params){window.testCalls.push({name,params});if(name==='tiene_capacidad_aliados')return {data:true};
          if(name!=='aliados_vincular_comercio')throw Error('RPC no esperado: '+name);
          if(window.testFailure)return {error:{message:'El lote ya pasó a cálculo. Actualiza.'}};
          const op=operations.find(o=>o.id===params.p_operation_id),isNew=!!params.p_nuevo;
          op.origen_codigo=isNew?'ALIADO-TEST':params.p_origen_codigo;op.tipo_establecimiento=isNew?'aliado':'propia';
          incidents.find(i=>i.operation_id===op.id).estado='resuelta';
          return {data:{ok:true,origen_codigo:op.origen_codigo,tipo:op.tipo_establecimiento,nombre:op.establishment_name}};
        }
      }};
    });
    await page.goto('https://kora.test/creditek/erp/aliados-liquidaciones.html');
    await page.evaluate(()=>document.getElementById('app').classList.remove('hidden'));
    await page.locator('[data-open="alo"]').click();
    await page.waitForFunction(()=>document.getElementById('workflowError').textContent.includes('3 operaciones'));
    assert.equal(await page.locator('#batches tr td').nth(4).textContent(),'6');
    await page.locator('[data-tab="incidents"]').click();assert.equal(await page.locator('#pendingIssues').textContent(),'Pendientes (3)');
    await page.locator('[data-operation="op1"]').click();
    await page.locator('dialog [name=search]').fill('coveñas');
    assert.equal(await page.locator('dialog [name=origin]').inputValue(),'');
    await page.locator('dialog [name=origin]').selectOption('CK11');
    assert.match(await page.locator('dialog [data-kind]').textContent(),/Tienda propia/);
    for(const size of [{width:390,height:844},{width:844,height:390},{width:768,height:1024},{width:1280,height:900}]){
      await page.setViewportSize(size);
      assert.ok(await page.locator('dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'horizontal overflow '+JSON.stringify(size));
      await page.getByRole('button',{name:'Guardar vinculación',exact:true}).scrollIntoViewIfNeeded();
    }
    await page.locator('dialog [name=verified]').check();await page.evaluate(()=>window.testFailure=true);
    await page.getByRole('button',{name:'Guardar vinculación',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('dialog [role=alert]')?.textContent.includes('pasó a cálculo'));
    assert.equal(await page.locator('dialog [name=origin]').inputValue(),'CK11');
    await page.evaluate(()=>window.testFailure=false);await page.getByRole('button',{name:'Guardar vinculación',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('dialog [role=status]')?.textContent.includes('correctamente'));
    assert.equal(await page.getByRole('link',{name:'Completar cliente y cuenta'}).count(),0);
    await page.locator('dialog [data-close]').click();
    await page.locator('[data-operation="op0"]').click();await page.locator('dialog [name=mode]').selectOption('new');
    await page.locator('dialog [name=city]').fill('Sincelejo');await page.locator('dialog [name=executive]').selectOption('ejecutivo');
    await page.locator('dialog [name=verified]').check();
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.locator('dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
    await page.screenshot({path:`/private/tmp/alo-comercio-${engine}.png`});
    await page.getByRole('button',{name:'Guardar vinculación',exact:true}).click();
    await page.getByRole('link',{name:'Completar cliente y cuenta'}).waitFor();
    assert.match(await page.getByRole('link',{name:'Completar cliente y cuenta'}).getAttribute('href'),/vista=clientes&origen=ALIADO-TEST/);
    await page.locator('dialog [data-close]').click();
    assert.equal(await page.locator('#pendingIssues').textContent(),'Pendientes (1)');
    const calls=await page.evaluate(()=>window.testCalls.filter(c=>c.name==='aliados_vincular_comercio'));
    assert.equal(calls.length,3);assert.equal(calls[2].params.p_nuevo.nombre,'FULL ACCESORIOS LA 72');assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});
