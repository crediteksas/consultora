import test from 'node:test';import assert from 'node:assert/strict';import {retailDatabaseGateway} from './database-gateway.mjs';
const env={NOVA_REGISTRATION_INTAKE_TOKEN:'fixture-only-shared-token',SUPABASE_SERVICE_KEY:'fixture-only-service-key'};
const req=(payload,token=env.NOVA_REGISTRATION_INTAKE_TOKEN)=>new Request('https://internal.test/internal/retail-db',{method:'POST',headers:{authorization:'Bearer '+token},body:JSON.stringify(payload)});
test('service credential and narrow resource allowlist are required',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return Response.json([]);};
 assert.equal((await retailDatabaseGateway(req({path:'nova_retail_cases',method:'GET'},'wrong'),env,fetcher)).status,401);
 for(const p of [{path:'clientes',method:'GET'},{path:'perfiles',method:'PATCH',body:{rol:'gerencia'}},{path:'nova_retail_cases',method:'PATCH',body:{state:'authorized'}},{path:'rpc/crear_registro_cliente_seguro',method:'POST',body:{}},{path:'https://evil.example',method:'GET'},{kind:'document',path:'../secrets'}])assert.equal((await retailDatabaseGateway(req(p),env,fetcher)).status,403);
 assert.equal(calls,0);
 const r=await retailDatabaseGateway(req({path:'nova_retail_cases?select=source_id&limit=1',method:'GET'}),env,async(url,init)=>{calls++;assert.equal(url,'https://jfkmiyvcdfbsbwchyvol.supabase.co/rest/v1/nova_retail_cases?select=source_id&limit=1');assert.equal(init.headers.apikey,env.SUPABASE_SERVICE_KEY);return Response.json([]);});assert.equal(r.status,200);assert.equal(calls,1);
});
test('auth lookup returns only the fields needed to verify an existing identity',async()=>{
 const r=await retailDatabaseGateway(req({kind:'authUser',id:'11111111-1111-4111-8111-111111111111'}),env,async()=>Response.json({id:'id',email:'test@example.test',email_confirmed_at:'2026-01-01',user_metadata:{not_required:'private'}}));const d=await r.json();assert.equal(d.user_metadata,undefined);assert.equal(d.email,'test@example.test');
});
