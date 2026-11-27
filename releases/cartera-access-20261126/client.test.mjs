import test from'node:test';import assert from'node:assert/strict';import{createRequire}from'node:module';
const{resolveBootstrap,create}=createRequire(import.meta.url)('./candidate/cartera-operador-client.js');
const user='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const d={restricted:true,profile:{id:user,nombre:'Ficticia',rol:'operador_cartera',activo:true,tienda_codigo:'fiction-A'},read:true,manage:true,importer:false,authorizer:false};
function fixture(reply){const calls=[];const client={auth:{},supabaseUrl:'https://fiction.invalid',rpc(name,args){const c={name,args,headers:{}};calls.push(c);return{setHeader(k,v){c.headers[k]=v;return this;},abortSignal(s){c.signal=s;return this;},then(ok,bad){return Promise.resolve({data:reply??(name==='cartera_operador_inicio'?d:[]),error:null}).then(ok,bad);}};}};return{calls,client,scoped:create(client,resolveBootstrap({data:d},user))};}
test('bootstrap permits legacy fallback only on explicit false; rejects malformed, other-user and inactive responses',()=>{
 assert.deepEqual(resolveBootstrap({data:{restricted:false}},user),{restricted:false});
 for(const r of[{error:{}},null,{data:null},{data:[]},{data:{}},{data:{restricted:'false'}},{data:{...d,profile:{...d.profile,id:other}}},{data:{...d,profile:{...d.profile,activo:false}}},{data:{...d,importer:true}},{data:{...d,authorizer:true}}])assert.throws(()=>resolveBootstrap(r,user));
 const b=resolveBootstrap({data:{...d,profile:{...d.profile,private_note:'secret'}}},user);assert.equal('private_note'in b.profile,false);
});

test('committed denial envelopes become explicit client errors and malformed ones never become empty data',async()=>{
 const{scoped}=fixture({__cartera_error:{code:'PT429',message:'cartera_request_limit'}});
 const r=await scoped.rpc('cobra_provision_book');assert.equal(r.data,null);assert.equal(r.status,429);assert.equal(r.error.code,'PT429');
 const bad=fixture({__cartera_error:{}}).scoped;await assert.rejects(Promise.resolve(bad.rpc('cobra_provision_book')));
 assert.throws(()=>resolveBootstrap({data:{__cartera_error:{code:'PT403',message:'cartera_profile_inactive'}}},user));
});
test('scoped adapter only forwards fixed RPC datasets and pins query token and abort signal',async()=>{
 const{scoped,calls}=fixture(),signal=new AbortController().signal;
 const q=scoped.from('creditos_cartera_operaciones').select('*').order('ally_paid_at').range(500,999).setHeader('Authorization','Bearer fiction-token').abortSignal(signal);
 await q;await q;assert.equal(calls.length,1);assert.equal(calls[0].name,'cartera_operador_datos');assert.equal(calls[0].args.p_dataset,'portfolio');assert.equal(calls[0].args.p_offset,500);assert.equal(calls[0].args.p_limit,500);assert.equal(calls[0].headers.Authorization,'Bearer fiction-token');assert.equal(calls[0].signal,signal);
 assert.equal((await scoped.rpc('cobra_provision_authorizer')).data,false);assert.equal((await scoped.rpc('cobra_quality_importer')).data,false);assert.equal((await scoped.rpc('cobra_quality_operator')).data,true);
 await scoped.rpc('cobra_provision_save',{p_kind:'action',p_request_id:user,p_payload:{kind:'request'}});
 assert.equal(calls.at(-1).name,'cartera_operador_solicitar_provision');
});
test('unknown tables, columns, joins, filters and financial RPCs never fall back to raw client',async()=>{
 const{scoped,calls}=fixture();
 for(const factory of[()=>scoped.from('clientes').select('*'),()=>scoped.from('creditos_cartera_operaciones').select('*,clientes(*)'),()=>scoped.from('creditos_cartera_operaciones').select('*').eq('id',other),()=>scoped.from('cobra_provision_actions').select('id,request_id,payload,created_by').eq('created_by',other).eq('request_id',user),()=>scoped.rpc('creditos_cartera_registrar_pago_cliente',{}),()=>scoped.rpc('cobra_krediya_save_cut',{}),()=>scoped.rpc('cobra_provision_source',{}),()=>scoped.rpc('cobra_provision_save',{p_kind:'action',p_payload:{kind:'authorize'}})])await assert.rejects(Promise.resolve().then(factory));
 assert.equal(calls.length,0);
});
