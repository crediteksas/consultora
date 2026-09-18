import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),W=require('../../creditek/erp/b2b-workspace.js');
function fixture(hash=''){
 const keys=Object.keys(W.routes),buttons=keys.map(key=>({dataset:{workspace:key},attributes:{},setAttribute(k,v){this.attributes[k]=v;},classList:{toggle(){}},focus(){this.focused=true;}})),panels=keys.map(key=>({dataset:{workspacePanel:key},hidden:false,preservedInput:'sin guardar'})),events={},host={location:{hash},history:{pushState(_a,_b,next){host.location.hash=next;}},addEventListener(k,fn){events[k]=fn;},removeEventListener(k){delete events[k];}};
 const reveals=[],api=W.mount({container:{querySelectorAll:()=>panels},nav:{querySelectorAll:()=>buttons},host,onReveal:(...args)=>reveals.push(args)});
 return{api,buttons,panels,host,events,reveals};
}
test('Las rutas antiguas abren la tarea correcta; por defecto las listas guardadas',()=>{
 assert.equal(W.route(''),'listas');assert.equal(W.route('#listasWhatsApp'),'listas');assert.equal(W.route('#listasPrecios'),'listas');assert.equal(W.route('#comparativoProveedores'),'listas');assert.equal(W.route('#cierrePedidos'),'pedidos');assert.equal(W.route('#gestionCompras'),'compras');assert.equal(W.route('#catalogoTiendas'),'catalogo');assert.equal(W.route('#desconocido'),'listas');
});
test('Solo una vista visible, sin borrar campos al cambiar de pestaña',()=>{
 const f=fixture();assert.deepEqual(f.panels.map(x=>x.hidden),[false,true,true,true]);f.buttons[2].onclick();assert.deepEqual(f.panels.map(x=>x.hidden),[true,true,false,true]);assert.equal(f.host.location.hash,'#cierrePedidos');assert.equal(f.buttons[2].attributes['aria-selected'],'true');assert.equal(f.buttons[2].tabIndex,0);assert.equal(f.buttons[0].tabIndex,-1);f.api.show('listas');assert.equal(f.panels[0].preservedInput,'sin guardar');
});
test('Atrás/adelante y teclado actualizan selección y enlaces existentes',()=>{
 const f=fixture('#gestionCompras');assert.equal(f.panels[3].hidden,false);f.host.location.hash='#listasWhatsApp';f.events.hashchange();assert.equal(f.panels[0].hidden,false);assert.deepEqual(f.reveals.at(-1),['listas','listasWhatsApp']);let prevented=false;f.buttons[0].onkeydown({key:'ArrowLeft',preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(f.buttons[3].focused,true);assert.equal(f.panels[3].hidden,false);f.api.destroy();assert.equal(f.events.hashchange,undefined);
});
test('Admin conserva descargas, guardadas y editor; tiendas no reciben resumen de proveedores',()=>{
 const page=readFileSync(new URL('../../creditek/erp/pedidos-b2b.html',import.meta.url),'utf8');
 assert.equal((page.match(/data-workspace-panel=/g)||[]).length,4);assert.match(page,/id="workspaceNav" role="tablist"/);assert.match(page,/id="listasGuardadas"/);assert.match(page,/id="listEditor"/);assert.match(page,/onSaved:\(\)=>listSummary\?\.refresh\(\)/);assert.match(page,/onOpenDraft:\(id,mode\)=>\$\('listasWhatsApp'\)\.openDraft\(id,mode\)/);assert.match(page,/b2b:draft-open/);assert.match(page,/No necesitas volver a cargarlas/);
 const store=page.slice(page.indexOf('async function loadStore'),page.indexOf('function renderCatalog'));assert.doesNotMatch(store,/b2b_catalogo_borradores|b2b_ofertas|proveedores/);assert.match(page,/\['gerencia','auditoria'\]\.includes\(p.rol\)/);
});
