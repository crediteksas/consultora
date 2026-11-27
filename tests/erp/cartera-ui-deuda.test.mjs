import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const file=readFileSync(new URL('../../creditek/erp/sidebar.js', import.meta.url),'utf8');
const start=file.indexOf('      // La gestión de Cartera es independiente');
const end=file.indexOf('\n\n\n      // Expuesto por si',start);
assert(start>=0 && end>start);
const run=vm.runInThisContext(`(async (perfil, location, document, window, sb, withBootTimeout) => { ${file.slice(start,end)} })`);
async function boot(profile,path){
 let loads=0,mounts=0;
 const doc={createElement(){return {}},head:{appendChild(script){loads++;script.onload()}}};
 const win={KoraConfirmacionDeuda:{mount:async ({profile:p})=>{assert.equal(p,profile);mounts++}}};
 await run(profile,{pathname:path},doc,win,{},p=>p);
 return {loads,mounts};
}
const admin={rol:'admin_tienda',es_gestor_cartera:true};
test('gestor usa Cartera sin aviso de deuda',async()=>assert.deepEqual(await boot(admin,'/creditek/erp/creditos-cartera.html'),{loads:0,mounts:0}));
for(const path of ['/creditek/erp/ventas.html','/creditek/erp/app','/creditek/erp/creditos-cartera.html.fake','/creditek/erp/nova.html']) test(`la regla de tienda se mantiene en ${path}`,async()=>assert.deepEqual(await boot(admin,path),{loads:1,mounts:1}));
for(const value of [false,undefined,'true']) test(`sin capacidad válida ${value} no se omite confirmación`,async()=>assert.deepEqual(await boot({rol:'admin_tienda',es_gestor_cartera:value},'/creditek/erp/creditos-cartera.html'),{loads:1,mounts:1}));
test('gerencia permanece sin diálogo de tienda',async()=>assert.deepEqual(await boot({rol:'gerencia',es_gestor_cartera:true},'/creditek/erp/creditos-cartera.html'),{loads:0,mounts:0}));
