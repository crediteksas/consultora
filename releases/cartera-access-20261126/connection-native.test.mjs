import test from'node:test';import assert from'node:assert/strict';import{createRequire}from'node:module';import{webcrypto}from'node:crypto';
import{fullSetup,operation,operator,asActor,enableFictional}from'./full-fixture.mjs';
const require=createRequire(import.meta.url),{resolveBootstrap,create}=require('./candidate/cartera-operador-client.js');
// Resolve the candidate connection's relative persistence module without copying active code.
const fs=await import('node:fs'),vm=await import('node:vm');
const stagedDomain=require('./candidate/cobra-krediya-domain.js');
const persistenceSandbox={module:{exports:{}},require:n=>{if(n!=='./quality-domain.js')throw Error('Unreviewed persistence dependency');return stagedDomain;}};
vm.runInNewContext(fs.readFileSync(new URL('./candidate/cobra-krediya-persistence.js',import.meta.url),'utf8'),persistenceSandbox);
const sandbox={module:{exports:{}},require:n=>{if(n!=='./quality-persistence.js')throw Error('Unreviewed dependency');return persistenceSandbox.module.exports;},globalThis:{crypto:webcrypto},setTimeout,clearTimeout,AbortController,TextEncoder,Uint8Array,Date,JSON,Error,Set,Map};
vm.runInNewContext(fs.readFileSync(new URL('./candidate/cobra-krediya-connection.js',import.meta.url),'utf8'),sandbox);
const Connection=sandbox.module.exports;
test('candidate connection plus restricted adapter plus native SQL completes follow-up and request recovery',async()=>{
 const{db,cut}=await fullSetup();let connection;
 try{
  await enableFictional(db);await asActor(db);
  const session={user:{id:operator},access_token:'fiction-token',expires_at:Math.floor(Date.now()/1000)+3600},called=[];
  const client={supabaseUrl:'https://fiction.invalid',auth:{getSession:async()=>({data:{session}}),getUser:async()=>({data:{user:{id:operator}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},rpc(name,args={}){
   const headers={};let signal;
   return{setHeader(k,v){headers[k]=v;return this;},abortSignal(s){signal=s;return this;},async then(ok,bad){
    try{if(signal?.aborted)throw Error('aborted');called.push(name);const keys=Object.keys(args);const sql='select public.'+name+'('+keys.map((k,i)=>k+'=> $'+(i+1)).join(',')+') as data';const result=await db.query(sql,keys.map(k=>args[k]));return ok({data:result.rows[0].data,error:null,status:200});}
    catch(e){return ok({data:null,error:{code:e.code,message:e.message},status:403});}
   }};
  }};
  const boot=resolveBootstrap(await client.rpc('cartera_operador_inicio'),operator),scoped=create(client,boot),storage=new Map();
  const journal={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
  connection=Connection.create({client:scoped,project:client.supabaseUrl,storage:journal,locks:{request:async(k,o,f)=>f()},crypto:webcrypto});
  assert.equal((await connection.capabilities()).operator,true);assert.equal((await connection.capabilities()).importer,false);
  assert.equal((await connection.listCuts('2026-10')).length,1);assert.equal((await connection.loadCut(cut.id)).row_count,1);
  const saved=await connection.save('collection',{p_request_id:'44444444-4444-4444-8444-444444444444',p_operation_id:operation,p_event_type:'note',p_channel:'internal',p_note:'Fictional integrated followup',p_promise_date:null,p_promise_amount:null});
  assert.equal(saved.payment_created,false);assert.equal((await connection.history(operation)).length,1);assert.equal((await connection.recover('collection')).state,'none');
  const payload={kind:'request',parent_id:null,cut_id:cut.id,operation_id:operation,amount_cents:6000,allocations:[],purpose:'installments',note:'Fictional integrated request',evidence:null,evidence_sha256:null};
  const receipt=await connection.saveFund('action',{id:'55555555-5555-4555-8555-555555555555',payload});assert.equal(receipt.saved,true);assert.equal(receipt.payment_executed,false);
  assert.equal((await connection.fundBook()).actions.length,1);assert.equal((await connection.recoverFund('action')).state,'none');assert.equal((await connection.fundCapabilities()).authorizer,false);
  assert.ok(called.every(n=>['cartera_operador_inicio','cartera_operador_datos','cartera_operador_guardar_gestion','cartera_operador_solicitar_provision'].includes(n)));
 }finally{connection?.dispose();await db.close();}
});
