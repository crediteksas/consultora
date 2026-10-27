import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createShareToken,shareTokenFilter} from './share-link.mjs';
import {Miniflare,Response} from '/Users/oscarm/Creditek/baseline/consultora/node_modules/miniflare/dist/src/index.js';
const id='12345678-1234-4234-8234-123456789abc', secret='unit-test-only-secret', original='original-test-token-that-is-long-enough';
const token=await createShareToken(id,secret);
assert.equal(await createShareToken(id,secret),token);
assert.deepEqual(await shareTokenFilter(token,secret),{id:'eq.'+id});
for(const bad of [token.slice(0,-1)+(token.endsWith('0')?'1':'0'),token.replace('12345678','22345678'),token+'.extra','nr1.bad']) await assert.rejects(()=>shareTokenFilter(bad,secret));
assert.equal(await shareTokenFilter(original,secret),null);
await assert.rejects(()=>shareTokenFilter(token,'wrong-secret'));
let revoked=false, originActive=true, queries=0;
const mf=new Miniflare({modules:true,script:await readFile(new URL('./index.mjs',import.meta.url),'utf8'),compatibilityDate:'2026-01-15',compatibilityFlags:['nodejs_compat'],bindings:{TOKEN_HASH_SECRET:secret,SUPABASE_SERVICE_KEY:'test',ADMIN_ENLACES_TOKEN:'test-admin',NOVA_REGISTRATION_PILOT_ORIGINS:'CK-02',NOVA_REGISTRATION_CAPTURE_ENABLED:'true',NOVA_REGISTRATION_DELIVERY_ENABLED:'true'},outboundService:async req=>{
 assert.equal(req.method,'GET','Copy must not mutate records');queries++;
 const u=new URL(req.url);let rows=[];
 if(u.pathname.endsWith('/enlaces_registro')){
   if(u.searchParams.has('id')||u.searchParams.has('token_hash')){
     assert.equal(u.searchParams.get('activo'),'eq.true');assert.equal(u.searchParams.get('revoked_at'),'is.null');
     rows=revoked?[]:[{id,origen_codigo:'CK-02',captador_id:null}];
   }else rows=[{id,origen_codigo:'CK-02',activo:!revoked,revoked_at:revoked?'2026-10-20':null,solicitudes:[{count:2}],created_at:'2026-09-16',token_sufijo:'test'}];
 }else if(u.pathname.endsWith('/origenes'))rows=originActive?[{codigo:'CK-02',nombre:'Test Store',tipo:'propia'}]:[];
 else if(u.pathname.endsWith('/captadores'))rows=[{id:'exec-test',nombre:'Executive'}];
 return new Response(JSON.stringify(rows),{headers:{'content-type':'application/json','content-range':'0-'+Math.max(0,rows.length-1)+'/'+rows.length}});
}});
try{
 const list=await mf.dispatchFetch('https://registro.crediteksas.com/api/admin/origenes-enlaces',{headers:{authorization:'Bearer test-admin'}});assert.equal(list.status,200);
 const data=await list.json();assert.equal(new URL(data[0].enlace_activo.url_completa).searchParams.get('t'),token);
 const context=t=>mf.dispatchFetch('https://registro.crediteksas.com/api/registro/contexto?t='+encodeURIComponent(t));
 assert.equal((await context(token)).status,200);assert.equal((await context(original)).status,200);
 const before=queries;assert.equal((await context(token+'.bad')).status,404);assert.equal(queries,before);
 revoked=true;assert.equal((await context(token)).status,404);revoked=false;originActive=false;assert.equal((await context(token)).status,404);
 assert.equal((await mf.dispatchFetch('https://registro.crediteksas.com/api/admin/origenes-enlaces')).status,401);
 console.log('PASS: deterministic signed copy, tamper rejection, existing link preserved, revoked/inactive denied, authenticated list, zero writes');
}finally{await mf.dispose()}
