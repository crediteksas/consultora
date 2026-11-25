import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
export const html = await readFile(new URL('../../../creditek/erp/reportes.html',import.meta.url),'utf8');
export const cacheSource = await readFile(new URL('../../../creditek/erp/reportes-query-cache.js',import.meta.url),'utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
const main=scripts.find(m=>m[1].includes('async function cargarPresupuesto()'))[1];
const bootStart=main.lastIndexOf('\n(async function () {');
if(bootStart<0)throw new Error('Missing isolated boot boundary');
export const appSource=main.slice(0,bootStart);
// All records below are invented. No request leaves the fixture.
export function backend(data, calls, fail = {}) {
  return {auth:{getSession:async()=>({data:{session:{user:{id:'fictional-user',email:'fixture@example.invalid'}}}})},from(table){
    let filters=[],orders=[];
    const q={select(){return q;},async maybeSingle(){const r=await q.range(0,0);return {...r,data:r.data?.[0]||null};},order(key){orders.push(key);return q;},
      eq(k,v){filters.push(['eq',k,v]);return q;},neq(k,v){filters.push(['neq',k,v]);return q;},
      gte(k,v){filters.push(['gte',k,v]);return q;},lte(k,v){filters.push(['lte',k,v]);return q;},
      lt(k,v){filters.push(['lt',k,v]);return q;},in(k,v){filters.push(['in',k,v]);return q;},
      async range(from,to){
        calls.push({table,filters:[...filters],orders:[...orders],from,to});
        if(fail.table===table && from>=fail.from)return {data:null,error:{message:'Fallo ficticio de página'}};
        const get=(r,k)=>k.split('.').reduce((o,p)=>o?.[p],r);
        const rows=(data[table]||[]).filter(r=>filters.every(([op,k,v])=>{const x=get(r,k);return op==='eq'?x===v:op==='neq'?x!==v:op==='gte'?x>=v:op==='lte'?x<=v:op==='lt'?x<v:v.includes(x);})).sort((a,b)=>{for(const k of orders){const c=String(get(a,k)).localeCompare(String(get(b,k)));if(c)return c;}return 0;});
        return {data:rows.slice(from,to+1),error:null};
      },then(ok,no){return q.range(0,999).then(ok,no);}};return q;
  }};
}
export function fixtures(){
 const names={S01:'Tienda ficticia Uno',S02:'Tienda ficticia Dos',S03:'Tienda ficticia Tres'};
 const ventas=Array.from({length:1205},(_,i)=>({id:String(i).padStart(6,'0'),fecha:'2026-11-10',anulada:false,tienda_codigo:i<600?'S01':'S02',total:100,origen:{nombre:names[i<600?'S01':'S02']},venta_items:[{cantidad:1,costo_congelado:60,productos:{tipo:'serializado'}}]}));
 ventas.push({id:'999998',fecha:'2026-11-10',anulada:true,tienda_codigo:'S02',total:9000},{id:'999999',fecha:'2026-11-26',anulada:false,tienda_codigo:'S02',total:9000});
 return {ventas,presupuestos:Object.entries(names).map(([tienda_codigo,nombre],i)=>({id:String(i),fecha:'2026-11-01',tienda_codigo,meta_venta_total:100000,origen:{nombre}})),historico_mensual:Object.keys(names).map((tienda_codigo,i)=>({id:String(i),anio:2025,mes:11,tienda_codigo,venta_total:100000})),gastos:[],venta_items_lectura:[]};
}
export async function harness({data=fixtures(),role='gerencia',filter=[],fail={},now='2026-11-25T17:00:00Z'}={}){
 const elements=new Map(),calls=[],footers=new Map();
 const document={getElementById(id){if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',classList:{add(){},remove(){}},closest(){if(!footers.has(id))footers.set(id,{innerHTML:''});return {querySelector(){return footers.get(id);},dataset:{}};}});return elements.get(id);}};
 const FakeDate=class extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return new Date(now).getTime();}};
 const context={window:{__KORA_ENV__:{},CreditekTableroUtilidad:{authorizedExpenses:async()=>[]}},document,supabase:{createClient:()=>backend(data,calls,fail)},Chart:class{destroy(){}},Intl,Date:FakeDate,setTimeout(){}};
 vm.createContext(context);vm.runInContext(cacheSource,context);vm.runInContext(appSource,context);
 vm.runInContext(`currentPerfil=${JSON.stringify({rol:role,activo:true})};tiendasFiltro=${JSON.stringify(filter)};`,context);
 return {context,elements,footers,calls,data,run:code=>vm.runInContext(code,context),table:id=>document.getElementById(id).innerHTML};
}
