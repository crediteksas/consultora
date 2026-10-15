import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
const script=await readFile(new URL('../../creditek/erp/confirmacion-deuda.js',import.meta.url),'utf8');
test('confirmación diaria en navegador: aviso, límite, diferencia, fallos e idempotencia',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://kora.test/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body><main><button id="operar">Registrar venta</button></main></body></html>'}));
 await page.goto('https://kora.test/');
 await page.evaluate(()=>{
 window.started=performance.now();window.saved=[];window.failRead=false;window.failSave=true;
 window.mock={aplica:true,pendiente:true,bloqueada:false,fecha:'2026-10-16',saldo:820,version:'v1',tienda_nombre:'Tienda de prueba',ahora:'2026-10-16T15:59:58Z',limite:'2026-10-16T16:00:00Z',siguiente_dia:'2026-10-17T05:00:00Z'};
 window.sb={auth:{signOut:async()=>{}},rpc:async(name,p)=>{if(name==='estado_confirmacion_deuda_tienda')return window.failRead?{error:{message:'Sin conexión'}}:{data:{...window.mock,ahora:new Date(Date.parse('2026-10-16T15:59:58Z')+performance.now()-window.started).toISOString()}};window.saved.push(p);return {error:{message:window.failSave?'Error de red':'Ya registraste la confirmación de hoy'}};}};
 });
 await page.addScriptTag({content:script});await page.evaluate(()=>window.KoraConfirmacionDeuda.mount({sb:window.sb,profile:{rol:'admin_tienda',tienda_codigo:'A'}}));
 const modal=page.locator('#koraConfirmacionDeuda');await expect(modal).toBeVisible();await expect(modal).toContainText(/\$\s*820/);
 await page.getByRole('button',{name:'Revisar antes de las 11:00 a. m.'}).click();await expect(modal).not.toBeVisible();await expect(page.locator('#koraDeudaRecordatorio')).toBeVisible();
 await expect(modal).toBeVisible({timeout:5000});await page.keyboard.press('Escape');await expect(modal).toBeVisible();
 await expect(page.getByRole('button',{name:'Revisar antes de las 11:00 a. m.'})).toBeHidden();
 await page.getByLabel('El saldo no coincide con mi revisión').check();await page.getByLabel('Saldo según mi revisión (COP)').fill('810');await page.getByLabel('Explica la diferencia para Mayte u Óscar').fill('Falta un abono de diez pesos');
 await page.screenshot({path:'/private/tmp/kora-confirmacion-deuda-movil.png'});await page.getByRole('button',{name:'Reportar diferencia y continuar'}).click();await expect(modal).toContainText('Error de red');await page.getByRole('button',{name:'Reportar diferencia y continuar'}).click();
 const saved=await page.evaluate(()=>window.saved);assert.equal(saved.length,2);assert.deepEqual(saved[0],saved[1]);assert.equal(saved[0].p_saldo,810);
 await page.evaluate(()=>{window.failRead=true;});await page.getByRole('button',{name:'Actualizar saldo'}).click();await expect(modal).toContainText('No se pudo comprobar el saldo');await page.keyboard.press('Escape');await expect(modal).toBeVisible();
 await page.evaluate(()=>{window.failRead=false;window.mock={...window.mock,pendiente:false,confirmacion:{id:'ok'}};});await page.getByRole('button',{name:'Actualizar saldo'}).click();await expect(modal).not.toBeVisible();await expect(page.locator('#koraDeudaRecordatorio')).toBeHidden();
 assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('revisión central: pendientes del día y diferencias históricas, sin modificar cartera',async()=>{
 const html=(await readFile(new URL('../../creditek/erp/confirmaciones-deuda.html',import.meta.url),'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
 const source=await readFile(new URL('../../creditek/erp/confirmaciones-deuda-gestion.js',import.meta.url),'utf8');
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
 const page=await browser.newPage();await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:html}));await page.goto('https://kora.test/');
 await page.evaluate(()=>{
 window.calls=[];window.reviewed=false;window.__KORA_ENV__={};
 const c={id:'test',fecha:'2026-10-15',saldo_sistema:820,saldo_declarado:810,diferencia:-10,confirmado_at:'2026-10-15T14:00:00Z',tienda:'Tienda A',administrador:'Ana <img src=x>',observacion:'Falta abono'};
 window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{user:{id:'central'}}}})},rpc:async(name,p)=>{window.calls.push({name,p});if(name==='revisar_confirmacion_deuda'){window.reviewed=true;return {};}
 return {data:{diarias:[{tienda:'Tienda A',administrador:'Ana',confirmacion:c},{tienda:'Tienda B',administrador:'Beatriz',confirmacion:null}],diferencias:window.reviewed?[]:[c]}};}})};
 });
 await page.addScriptTag({content:source});await expect(page.locator('#filas tr')).toHaveCount(2);await expect(page.locator('#estado')).toContainText('1 de 2');await expect(page.locator('#diferencias')).toContainText('Ana <img src=x>');await expect(page.locator('#diferencias img')).toHaveCount(0);
 await page.getByLabel('Resultado de la revisión').fill('Comprobante revisado con la tienda');await page.getByRole('button',{name:'Guardar revisión'}).click();await expect(page.locator('#diferencias')).toContainText('No hay diferencias pendientes');
 const calls=await page.evaluate(()=>window.calls);assert.equal(calls.filter(c=>c.name==='revisar_confirmacion_deuda').length,1);assert.ok(calls.every(c=>['listar_confirmaciones_deuda','revisar_confirmacion_deuda'].includes(c.name)));
 }finally{await browser.close();}
});
