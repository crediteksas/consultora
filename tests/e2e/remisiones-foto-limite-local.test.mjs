import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';

const html=await readFile('creditek/erp/remisiones.html','utf8');
const script=html.slice(html.indexOf('let recepcionRemisionActual = null;'),html.indexOf('// ─── Escáner'));
const source=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link\b[^>]*>/g,'');
test('móvil: pide bajar resolución antes de enviar; Storage 413 no se confunde con foto inexistente',async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}});
    await page.route('**/*',route=>route.request().url()==='https://kora.test/creditek/erp/remisiones.html'
      ?route.fulfill({contentType:'text/html',body:source}):route.abort());
    await page.goto('https://kora.test/creditek/erp/remisiones.html');
    await page.addScriptTag({content:await readFile('creditek/erp/producto-foto.js','utf8')});
    await page.evaluate(()=>{
      window.productoFoto=CreditekProductoFoto;window.calls=[];window.uploadError=null;
      window.escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      window.RecepcionOrigen={render:()=>''};
      window.abrirModalAccesible=id=>{document.getElementById(id).style.display='flex';};
      window.cerrarModalAccesible=id=>{document.getElementById(id).style.display='none';};
      window.mostrarBanner=()=>{};window.cargarRemisiones=()=>{};
      const item={id:'item-ficticio',producto_id:'producto-ficticio',cantidad:1,precio_remision:100,
        productos:{id:'producto-ficticio',nombre:'Producto de prueba',tipo:'cantidad',foto_url:null}};
      window.sb={from(table){return {select(){return {eq(){
        return table==='remision_items'?Promise.resolve({data:[structuredClone(item)]})
          :{maybeSingle:async()=>({data:{foto_url:null}})};
      }};}};},
        storage:{from:()=>({upload:async()=>{calls.push('upload');return {error:uploadError};},
          getPublicUrl:()=>({data:{publicUrl:'https://example.test/foto.jpg'}})})},
        rpc:async name=>{
          calls.push(name);
          if(name==='obtener_trazabilidad_remision')return {data:[]};
          return {data:{ok:true,foto_url:'https://example.test/foto.jpg'}};
        }};
    });
    await page.addScriptTag({content:script});
    await page.evaluate(async()=>{
      await abrirModalRecepcion({id:'remision-ficticia',consecutivo:999,revision:0});
      document.getElementById('btnConfirmarRecepcion').addEventListener('click',confirmarRecepcion);
    });
    const input=page.locator('.foto-recepcion-input');
    await input.setInputFiles({name:'foto-grande-ficticia.jpg',mimeType:'image/jpeg',buffer:Buffer.alloc(2*1024*1024+1)});
    assert.match(await page.locator('.foto-recepcion-ayuda').textContent(),/2 MB.*Baja la resolución o comprímela/);
    await page.locator('#btnConfirmarRecepcion').click();
    assert.match(await page.locator('#modalRecepcionErr').textContent(),/Producto de prueba.*2 MB.*Baja la resolución o comprímela/);
    assert.deepEqual(await page.evaluate(()=>calls),['obtener_trazabilidad_remision']);
    assert.ok(await page.locator('#modalRecepcionErr').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
    await page.screenshot({path:'/private/tmp/kora-fotos-2mb-movil-20261019.png'});
    await input.setInputFiles({name:'foto-valida-ficticia.jpg',mimeType:'image/jpeg',buffer:Buffer.alloc(1024)});
    await page.evaluate(()=>{uploadError={statusCode:'413',message:'The object exceeded the maximum allowed size'};calls=[];});
    await page.locator('#btnConfirmarRecepcion').click();
    await page.waitForFunction(()=>document.querySelector('#btnConfirmarRecepcion').disabled===false);
    assert.deepEqual(await page.evaluate(()=>calls),['upload']);
    assert.match(await page.locator('#modalRecepcionErr').textContent(),/2 MB.*Baja la resolución o comprímela/);
    assert.doesNotMatch(await page.locator('#modalRecepcionErr').textContent(),/imagen canónica no existe/);
    await page.evaluate(()=>{uploadError=null;calls=[];});
    await page.locator('#btnConfirmarRecepcion').click();
    await page.waitForFunction(()=>calls.includes('confirmar_recepcion_remision'));
    assert.deepEqual(await page.evaluate(()=>calls),['upload','registrar_foto_producto_recepcion','confirmar_recepcion_remision']);
  }finally{await browser.close();}
});
