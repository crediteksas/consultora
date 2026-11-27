import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{runInNewContext}from'node:vm';
const window={CobraQualityPersistence:{}};runInNewContext(readFileSync('creditek/erp/cobra-krediya-connection.js','utf8'),{window,AbortController,setTimeout,clearTimeout});const C=window.CobraQualityConnection;
const user='11111111-1111-4111-8111-111111111111';
function fixture(allowed=true){
 const requests=[],rows=Array.from({length:205},(_,i)=>({id:`aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12,'0')}`,cohort_month:i%2?'2026-09-01':'2026-10-01'}));
 function builder(name){let after=null,limit=100,columns='';const b={select:v=>(columns=v,b),order:()=>b,limit:v=>(limit=v,b),gt:(k,v)=>(after=v,b),setHeader:()=>b,abortSignal:()=>b,then:(resolve,reject)=>{requests.push({name,columns,after});return Promise.resolve({data:name==='cobra_quality_operator'?allowed:rows.filter(x=>!after||x.id>after).slice(0,limit)}).then(resolve,reject);}};return b;}
 const client={auth:{getSession:async()=>({data:{session:{user:{id:user},access_token:'fiction',expires_at:Math.floor(Date.now()/1000)+300}}}),getUser:async()=>({data:{user:{id:user}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},rpc:name=>builder(name),from:name=>builder(name)};
 return {c:C.create({client,project:'https://fiction.invalid',storage:null,locks:null}),requests};
}
test('lista todos los meses de forma paginada con permiso de Cartera',async()=>{const {c,requests}=fixture();const rows=await c.listAllCuts();assert.equal(rows.length,205);assert.deepEqual(new Set(rows.map(x=>x.cohort_month)),new Set(['2026-09-01','2026-10-01']));assert.equal(requests.filter(x=>x.name==='cobra_krediya_cuts').length,3);assert.ok(requests.filter(x=>x.columns).every(x=>!x.columns.includes('source_rows')));});
test('no consulta cortes sin permiso de Cartera',async()=>{const {c,requests}=fixture(false);await assert.rejects(c.listAllCuts(),/permiso/);assert.equal(requests.filter(x=>x.name==='cobra_krediya_cuts').length,0);});
