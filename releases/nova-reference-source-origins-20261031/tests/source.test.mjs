import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,harness,ids,phoneHash} from './harness.mjs';
test('published baseline rejects CK-09 before current-source validation; candidate allows the bound case',async()=>{const before=await harness(fixture(),{baseline:true});assert.equal(await before.verify(),false);assert.equal(before.calls.filter(c=>c.host.startsWith('jfkm')).length,1);const after=await harness();assert.equal(await after.verify(),true);});
for(let n=1;n<=9;n++)test('configured CK-0'+n+' uses its own active origin',async()=>{const origin='CK-0'+n,h=await harness(fixture(origin));assert.equal(await h.verify(),true);assert.equal(new URLSearchParams(h.calls.find(c=>c.path.endsWith('/origenes')).query).get('codigo'),'eq.'+origin);});
for(const origin of ['CK-00','CK-10','CK-019','ck-09','CK-09&activo=eq.true','OTHER'])test('origin outside closed retail range is rejected: '+origin,async()=>{const f=fixture(origin);f.env.NOVA_REGISTRATION_PILOT_ORIGINS+=','+origin;const h=await harness(f);assert.equal(await h.verify(),false);assert.equal(h.calls.filter(c=>c.path.endsWith('/origenes')).length,0);});
test('missing or subset allowlist cannot authorize CK-09',async()=>{for(const list of ['',undefined,'CK-02,CK-08']){const f=fixture();f.env.NOVA_REGISTRATION_PILOT_ORIGINS=list;const h=await harness(f);assert.equal(await h.verify(),false);}});
test('retail switch controls non-CK02; existing CK02 still requires allowlist',async()=>{for(const [origin,enabled] of [['CK-09',false],['CK-02',true]]){const f=fixture(origin);f.env.NOVA_RETAIL_ENABLED='false';const h=await harness(f);assert.equal(await h.verify(),enabled);}});
for(const [name,mutate] of [
 ['inactive source origin',f=>{f.origins[0].activo=false;}],
 ['returned origin mismatch',f=>{f.origins[0].codigo='CK-02';}],
 ['missing origin',f=>{f.origins=[];}],
 ['duplicate origins',f=>{f.origins.push({...f.origins[0]});}],
 ['source belongs to another client',f=>{f.sourceRows[0].cliente_id=ids.other;}],
 ['source revoked',f=>{f.sourceRows[0].revoked_at='2026-10-31T15:00:00Z';}],
 ['consent not granted',f=>{f.sourceRows[0].consent.granted=false;}],
 ['consent revoked',f=>{f.sourceRows[0].consent.revoked=true;}],
 ['WhatsApp not authorized',f=>{f.sourceRows[0].consent.channels=['email'];}],
 ['client authorization missing',f=>{f.clients[0].autorizacion_datos=false;}],
 ['client phone changed',f=>{f.clients[0].celular='3000000009';}],
 ['delivery incomplete',f=>{f.outbox[0].state='retry';}],
 ['outbox belongs to another application',f=>{f.outbox[0].application_id=ids.other;}],
 ['receipt belongs to another client',f=>{f.receipts[0].source_client_id=ids.other;}],
 ['receipt WhatsApp consent absent',f=>{f.receipts[0].accepted_channels=[];}],
 ['duplicate source records',f=>{f.sourceRows.push({...f.sourceRows[0]});}],
 ['missing client',f=>{f.clients=[];}],
 ['duplicate delivery records',f=>{f.outbox.push({...f.outbox[0]});}]
])test('NOVA existing source guard preserved: '+name,async()=>{const f=fixture();mutate(f);assert.equal(await(await harness(f)).verify(),false);});
test('effective replacement permits new phone and rejects previous phone, per role',async()=>{const f=fixture('CK-02');f.sourceRows[0].refs=structuredClone(f.refs);f.refs[0].telefono='3000000004';const h=await harness(f);assert.equal(await h.verify(),false);assert.equal(await h.verify({source_application_id:ids.source,application_id:ids.app,reference_type:'family',contact_hash:phoneHash('3000000004')}),true);assert.equal(await h.verify({source_application_id:ids.source,application_id:ids.app,reference_type:'personal',contact_hash:phoneHash('3000000004')}),false);assert.deepEqual(h.rpcBody,{p_source:ids.source});});
test('current reference contact authorization remains mandatory',async()=>{const f=fixture();f.refs[0].contact_authorized=false;assert.equal(await(await harness(f)).verify(),false);});
for(const [name,mutate] of [
 ['RPC unavailable',f=>{f.rpcThrows=true;}],['RPC non-success',f=>{f.rpcStatus=403;}],['null response',f=>{f.refs=null;}],['object response',f=>{f.refs={};}],['no reference',f=>{f.refs=[];}],['too many references',f=>{f.refs.push({...f.refs[0]});}],['duplicate role',f=>{f.refs[1].type='family';}],['unauthorized role',f=>{f.refs[0].type='other';}],['invalid phone',f=>{f.refs[0].telefono='bad';}],['string permission',f=>{f.refs[0].contact_authorized='true';}]
])test('effective-reference contract fails closed without snapshot fallback: '+name,async()=>{const f=fixture();f.sourceRows[0].refs=structuredClone(f.refs);mutate(f);const h=await harness(f);assert.equal(await h.verify(),false);});
test('one valid role remains independently verifiable; an absent role is not inferred',async()=>{const f=fixture();f.refs.pop();const h=await harness(f);assert.equal(await h.verify(),true);assert.equal(await h.verify({source_application_id:ids.source,application_id:ids.app,reference_type:'personal',contact_hash:phoneHash('3000000003')}),false);});
test('wrong app, source context, or recipient cannot verify another reference',async()=>{const h=await harness();for(const ref of [{source_application_id:ids.source,application_id:ids.other,reference_type:'family',contact_hash:phoneHash('3000000002')},{source_application_id:ids.source,application_id:ids.app,reference_type:'family',contact_hash:phoneHash('3000000008')},{source_application_id:ids.other,application_id:ids.app,reference_type:'family',contact_hash:phoneHash('3000000002')}])assert.equal(await h.verify(ref),false);});
test('two existing applications with the same reference phone remain bound to their own source/application',async()=>{const a=fixture('CK-09'),b=fixture('CK-08');b.sourceId=ids.other;b.sourceRows[0].cliente_id='55555555-5555-4555-8555-555555555555';b.outbox[0].application_id='66666666-6666-4666-8666-666666666666';b.receipts[0]={...b.receipts[0],source_application_id:b.sourceId,source_client_id:b.sourceRows[0].cliente_id,application_id:b.outbox[0].application_id};const h=await harness(a,{otherSources:[b]});assert.equal(await h.verify(),true);assert.equal(await h.verify({source_application_id:b.sourceId,application_id:ids.app,reference_type:'family',contact_hash:phoneHash('3000000002')}),false);assert.equal(await h.verify({source_application_id:b.sourceId,application_id:b.outbox[0].application_id,reference_type:'family',contact_hash:phoneHash('3000000002')}),true);});
test('source endpoint still requires backend token and POST; no data reads on denial',async()=>{const h=await harness();assert.equal((await h.proof({token:'wrong'})).status,401);assert.equal((await h.proof({method:'GET'})).status,405);assert.equal((await h.proof({sourceId:'bad'})).status,400);assert.equal(h.calls.length,0);});
test('closed pipeline uses only read GETs and canonical read RPC; no dispatch or provider calls',async()=>{const h=await harness();assert.equal(await h.verify(),true);assert.ok(h.calls.every(c=>c.method==='GET'||c.method==='POST'&&c.path==='/rest/v1/rpc/kora_nova_effective_references'));assert.equal(h.calls.filter(c=>!c.host.endsWith('.supabase.co')).length,0);});
