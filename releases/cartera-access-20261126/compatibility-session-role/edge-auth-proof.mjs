// Read-only source snapshots; every runtime dependency is mocked. No network/mail.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import {transformSync} from 'esbuild';
import assert from 'node:assert/strict';
const root=process.argv[2],output=process.argv[3];
const sha=s=>createHash('sha256').update(s).digest('hex');
const results=[];
for(const slug of ['b2b-pedido-mail','krediya-report-mail']){
 const snapshot=readFileSync(`${root}/${slug}/index.ts`,'utf8');
 const local=readFileSync(`supabase/functions/${slug}/index.ts`,'utf8');
 assert.equal(snapshot.trimEnd(),local.trimEnd(),'Live source differs; audit exact version before relying on local behavior');
 const code=transformSync(snapshot,{loader:'ts',format:'cjs',target:'es2022'}).code;
 for(const scenario of ['wrong-method','malformed-body','unknown-capability','forged-role-header','claim-error',...(slug==='b2b-pedido-mail'?['retired-order']:[])]){
  let handler,deliveries=0,fetches=0;
  const ctx={Response,Request,AbortSignal,JSON,Error,console:{log(){},warn(){},error(){}},
   Deno:{serve(fn){handler=fn;},env:{get(k){return k==='SUPABASE_URL'?'https://fixture.invalid':'fictional-not-a-credential';}}},
   require(name){assert.equal(name,'./core.mjs');return {deliver(){deliveries++;throw Error('No delivery permitted in this test');}};},
   fetch:async(url,opts)=>{fetches++;assert.match(url,/^https:\/\/fixture\.invalid\/rest\/v1\/rpc\/kora_claim_/);assert.equal(opts.method,'POST');return scenario==='claim-error'?new Response('fixture failure',{status:500}):Response.json(null);}
  };
  runInNewContext(code,ctx,{timeout:1000,filename:`live-snapshot-${slug}.cjs`});
  const body=scenario==='malformed-body'?{}:{id:'11111111-1111-4111-8111-111111111111',token:'22222222-2222-4222-8222-222222222222',...(slug==='b2b-pedido-mail'?{kind:scenario==='retired-order'?'pedido':'cierre'}:{})};
  const method=scenario==='wrong-method'?'GET':'POST';
  const request=new Request('https://edge.fixture.invalid',{method,headers:{'Content-Type':'application/json',...(scenario==='forged-role-header'?{Authorization:'Bearer fictional-kora-cartera-session','x-role':'service_role'}:{})},...(method==='POST'?{body:JSON.stringify(body)}:{})});
  const response=await handler(request);
  const expected=scenario==='wrong-method'?405:scenario==='malformed-body'?400:scenario==='retired-order'?410:scenario==='claim-error'?500:403;
  assert.equal(response.status,expected,`${slug}: ${scenario}`);assert.equal(deliveries,0);assert.equal(fetches,['wrong-method','malformed-body','retired-order'].includes(scenario)?0:1);
  results.push({slug,scenario,status:response.status,deliveries,claimCalls:fetches,snapshot_sha256:sha(snapshot)});
 }
}
const result={passed:true,cases:results,production_requests:0,production_writes:0,messages:0,scope:'Exact deployed entrypoint snapshots (trailing newline normalized for source comparison), mocked claim RPC; no live backend or capability validation certified.'};
writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:true,cases:results.length,messages:0,production_requests:0}));
