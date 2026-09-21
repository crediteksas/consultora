import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const V=require('../../creditek/erp/liquidaciones-import-validation.js');
const D=require('../../creditek/erp/aliados-liquidaciones-domain.js');
const auth=(session,user={id:'a'})=>({auth:{getSession:async()=>({data:{session}}),getUser:async()=>({data:{user}})}});
test('sesión ausente, vencida, otro usuario o revocada bloquea',async()=>{
 for(const session of [null,{user:{id:'a'},expires_at:1},{user:{id:'b'},expires_at:9999999999}])await assert.rejects(V.session(auth(session),'a'),/iniciar sesión/);
 await assert.rejects(V.session(auth({user:{id:'a'},expires_at:9999999999},null),'a'),/iniciar sesión/);
 await V.session(auth({user:{id:'a'},expires_at:9999999999}),'a');
});
test('errores de sesión y conexión tienen mensajes distintos',async()=>{
 assert.match(V.message({message:'"exp" claim timestamp check failed'}),/iniciar sesión/);
 const sb=auth({user:{id:'a'},expires_at:9999999999});
 sb.auth.getUser=async()=>({error:{message:'Sin conexión'}});
 await assert.rejects(V.session(sb,'a'),/Sin conexión/);
});
function database(responder){return{from(table){return{select(){return this;},eq(){return this;},order(){return this;},range:async(start,end)=>responder(table,start,end)};}};}
test('fallo de comercios o ejecutivos no se transforma en lista vacía',async()=>{
 for(const failed of ['origenes','ejecutivos']){
  const sb=database(t=>t===failed?{error:{message:'Consulta fallida'}}:{data:[{codigo:'A',nombre:'Tienda'}]});
  await assert.rejects(V.establishments(sb),/Consulta fallida/);
 }
 await assert.rejects(V.establishments(database(()=>({data:[]}))),/no devolvió comercios/);
 await assert.rejects(V.establishments(database(()=>({data:null}))),/No se pudo consultar/);
});
test('paginación conserva todos los comercios, aliases y ejecutivo',async()=>{
 const calls=[];
 const rows=Array.from({length:1001},(_,i)=>({codigo:String(i),nombre:'Tienda '+i,aliases:['Alias '+i],ejecutivo_id:'e'}));
 const result=await V.establishments(database((t,s,e)=>{calls.push([t,s]);return{data:t==='origenes'?rows.slice(s,e+1):[{id:'e',nombre:'Ejecutivo'}]};}));
 assert.equal(result.length,1001);assert.equal(result[1000].ejecutivo.nombre,'Ejecutivo');assert.deepEqual(result[1000].aliases,['Alias 1000','1000']);
 assert.ok(calls.some(c=>c[0]==='origenes'&&c[1]===1000));
});
test('comercio realmente desconocido conserva incidencia y nombre, sin XSS',()=>{
 const rows=[['# Crédito','IMEI','Cédula','Tienda','Monto a Financiar','Estado del contrato','Estado del Pago'],['C1','123','123','<Local nuevo>',500000,'Firmado','Pagado']];
 const p=D.importarKrediya(rows,[{codigo:'A',nombre:'Comercio existente',tipo:'aliado'}]);
 assert.equal(p.incidencias[0].tipo,'comercio_no_reconocido');
 const html=V.issuesHTML(p,s=>s);assert.match(html,/&lt;Local nuevo&gt;/);assert.match(html,/Crédito\/operación C1/);assert.ok(!html.includes('<Local nuevo>'));
});
test('guardas en validar y guardar; falla de duplicados bloquea antes del upload',()=>{
 const source=readFileSync(new URL('../../creditek/erp/aliados-liquidaciones-app.js',import.meta.url),'utf8');
 assert.equal(source.split('await KoraImportValidation.session(sb,profile?.id)').length-1,2);
 assert.match(source,/if \(duplicate.error\) throw duplicate.error/);
 assert.match(source,/function failImport\(error\)\{\s*resetImportPreview\(false\)/);
 assert.ok(source.indexOf('if (duplicate.error)')<source.indexOf("const upload = await sb.storage"));
 const html=readFileSync(new URL('../../creditek/erp/aliados-liquidaciones.html',import.meta.url),'utf8');
 assert.ok(html.indexOf('liquidaciones-import-validation.js')<html.indexOf('aliados-liquidaciones-app.js'));
});
