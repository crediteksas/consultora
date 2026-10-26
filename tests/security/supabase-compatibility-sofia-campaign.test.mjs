import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { campaignGrantPlan, AURA_CAMPAIGN_CONTRACT } from '../../scripts/supabase-compat/aura-campaign-contract.mjs';

// SQL sources matched the remote migration content hashes on 2026-10-23.
// This is the scheduler/receipt SUBSET, not full ERP/Worker/PostgREST coverage.
// All rows/identities are fictitious. No network client or send helper is used.
const scheduler = await readFile(new URL('../fixtures/supabase-compat/aura-campaign-scheduler.sql',import.meta.url),'utf8');
const receipts = await readFile(new URL('../fixtures/supabase-compat/aura-receipt-evidence.sql',import.meta.url),'utf8');
const catalog = await readFile(new URL('../../scripts/supabase-compat/catalog-query.sql',import.meta.url),'utf8');
const cid='00000000-0000-0000-0000-000000000001';
const rid='00000000-0000-0000-0000-000000000002';
const uid='00000000-0000-0000-0000-000000000003';
const phone='573000000001';
const snapshot = async db => (await db.query(catalog)).rows[0].snapshot;
const checkedPlan = (db, value) => campaignGrantPlan(value, {functionDefinitions:db.reviewedDefinitions});
async function as(db,role,sql) {
  try { await db.exec('set role '+role); return await db.query(sql); }
  finally { await db.exec('reset role'); }
}
async function fixture({existingGrants=false}={}) {
  const db=new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public to anon,authenticated,service_role;
    -- Future table/sequence defaults absent. Additional strict function defaults
    -- are a sensitivity check, not a claim about the provider's October rollout.
    alter default privileges revoke execute on functions from public;
    create table public.clientes(id uuid primary key,telefono text,optin_datos boolean,optin_comercial boolean,optin_whatsapp boolean,optin_fecha timestamptz,optin_version text,optin_canal text,optin_evidence_id text);
    create table public.sofia_consent_events(id uuid default gen_random_uuid(),telefono text,source_message_id text,purpose text,decision text,occurred_at timestamptz,created_at timestamptz);
    create table public.sofia_campaign_suppressions(telefono text,active boolean);
    create table public.sofia_campaigns(id uuid primary key,status text,approved_at timestamptz,scheduled_at timestamptz,template_name text,template_language text,header_media_url text,template_meta_status text,updated_at timestamptz);
    create table public.sofia_campaign_recipients(id uuid primary key,campaign_id uuid references public.sofia_campaigns(id),cliente_id uuid references public.clientes(id),telefono text,send_status text,eligibility_status text,exclusion_reason text,queued_at timestamptz,meta_message_id text,error_code text,unique(campaign_id,telefono));
    alter table public.clientes enable row level security;
    alter table public.sofia_consent_events enable row level security;
    alter table public.sofia_campaign_suppressions enable row level security;
    alter table public.sofia_campaigns enable row level security;
    alter table public.sofia_campaign_recipients enable row level security;
    create function public.synthetic_clock() returns timestamptz language sql security invoker as $$select '2030-01-01T15:05:00Z'::timestamptz$$;
    grant execute on function public.synthetic_clock() to service_role;`);
  await db.exec(scheduler.replaceAll('clock_timestamp()','public.synthetic_clock()'));
  await db.exec(receipts);
  await db.exec(`insert into public.clientes values('${uid}','${phone}',true,true,true,now(),'synthetic-v1','synthetic-channel','synthetic-event');
    insert into public.sofia_consent_events(telefono,source_message_id,purpose,decision,occurred_at,created_at) values('${phone}','synthetic-event','comercial_whatsapp','granted',now(),now());
    insert into public.sofia_campaigns values('${cid}','scheduled',now(),'2030-01-01T15:00:00Z','synthetic_template','es_CO',null,'approved',now());
    insert into public.sofia_campaign_recipients(id,campaign_id,cliente_id,telefono,send_status,eligibility_status) values('${rid}','${cid}','${uid}','${phone}','pending','eligible');
    insert into public.sofia_campaign_schedule_v1(campaign_id,scheduled_at,expires_at,audience_size,audience_hash,template_id,template_name,template_language,body_text,approval_ref)
    select '${cid}',scheduled_at,scheduled_at+interval '10 minutes',1,md5('${rid}:${uid}:${phone}'),'123','synthetic_template','es_CO','Synthetic only','synthetic approval' from public.sofia_campaigns;`);
  if(existingGrants) {
    // Explicit finite legacy fixture, never GRANT ALL and never production data.
    for(const name of ['clientes','sofia_consent_events','sofia_campaign_suppressions','sofia_campaigns','sofia_campaign_recipients']) await db.exec('grant select,insert,update on public.'+name+' to service_role');
  }
  // Synthetic definitions are pinned once, before any drift injected by tests.
  const baseline = await snapshot(db);
  db.reviewedDefinitions = Object.fromEntries(AURA_CAMPAIGN_CONTRACT.functions.map(fn => {
    const actual=baseline.functions.find(f=>f.schema==='public'&&f.name===fn.name&&f.identity===fn.identity);
    return [`public.${fn.name}(${fn.identity})`,actual.definition_md5];
  }));
  return db;
}
const cleanSnapshot = value => {
  const x=structuredClone(value);delete x.captured_at;
  for(const r of x.relations){delete r.acl;for(const c of r.columns)if(c.acl==='{}')c.acl=null;}
  return x;
};

test('scheduler reconstruction: RLS plus explicit scheduler RPC grants do not replace prerequisite table grants',async()=>{
  const db=await fixture();try {
    await assert.rejects(as(db,'service_role',`select * from public.sofia_campaign_claim_v1('${rid}')`),e=>e.code==='42501');
    assert.equal((await db.query('select send_status from public.sofia_campaign_recipients')).rows[0].send_status,'pending');
  } finally {await db.close();}
});

test('scoped finite grants support actual invoker claim/final-check/finish SQL with new defaults',async()=>{
  const db=await fixture();try {
    const before=await snapshot(db),plan=checkedPlan(db,before);
    assert.equal(plan.production_ready,false);assert.ok(plan.additions>0);
    assert.doesNotMatch(plan.apply_sql,/\bALL\b|\b(?:anon|authenticated)\b|SECURITY DEFINER|ALTER DEFAULT/i);
    await db.exec(plan.apply_sql);
    assert.equal((await as(db,'service_role',`select * from public.sofia_campaign_claim_v1('${rid}')`)).rows.length,1);
    assert.equal((await as(db,'service_role',`select * from public.sofia_campaign_claim_v1('${rid}')`)).rows.length,0);
    assert.equal((await as(db,'service_role',`select public.sofia_campaign_send_allowed_v1('${rid}') as allowed`)).rows[0].allowed,true);
    assert.equal((await as(db,'service_role',`select public.sofia_campaign_finish_v1('${cid}') as done`)).rows[0].done,false);
    await as(db,'service_role',`update public.sofia_campaign_recipients set send_status='accepted',meta_message_id='FICTITIOUS_MESSAGE' where id='${rid}'`);
    assert.equal((await as(db,'service_role',`select public.sofia_campaign_finish_v1('${cid}') as done`)).rows[0].done,true);
    const after=await snapshot(db);
    for(const key of ['functions','policies','defaults','schema_grants','role_config','triggers']) assert.deepEqual(after[key],before[key]);
  } finally {await db.close();}
});

test('append-only receipt insert and duplicate evidence work; UPDATE, DELETE and browser reads stay denied',async()=>{
  const db=await fixture();try {
    await db.exec(checkedPlan(db,await snapshot(db)).apply_sql);
    const sql=`insert into public.sofia_delivery_events(event_key,attempt_id,recipient,status,evidence_source,event_at)
      values('FICTITIOUS_EVENT','${rid}','${phone}','attempted','send_api',now()) on conflict(event_key) do nothing`;
    await as(db,'service_role',sql);await as(db,'service_role',sql);
    assert.equal((await as(db,'service_role','select count(*)::int as n from public.sofia_delivery_events')).rows[0].n,1);
    for(const role of ['anon','authenticated']) {
      await assert.rejects(as(db,role,'select * from public.sofia_delivery_events'),e=>e.code==='42501');
      await assert.rejects(as(db,role,`select * from public.sofia_campaign_claim_v1('${rid}')`),e=>e.code==='42501');
    }
    for(const sql of ['update public.sofia_delivery_events set status=\'read\'','delete from public.sofia_delivery_events',`update public.sofia_campaign_recipients set telefono='573000000009'`]) await assert.rejects(as(db,'service_role',sql),e=>e.code==='42501');
  } finally {await db.close();}
});

test('consent revocation after claim is enforced by the actual final-check function',async()=>{
  const db=await fixture();try {
    await db.exec(checkedPlan(db,await snapshot(db)).apply_sql);
    assert.equal((await as(db,'service_role',`select * from public.sofia_campaign_claim_v1('${rid}')`)).rows.length,1);
    await db.exec('update public.clientes set optin_whatsapp=false');
    assert.equal((await as(db,'service_role',`select public.sofia_campaign_send_allowed_v1('${rid}') as allowed`)).rows[0].allowed,false);
  } finally {await db.close();}
});

test('invoker RPC also requires EXECUTE on its transitive helper; restoring only that grant repairs the fixture',async()=>{
  const db=await fixture({existingGrants:true});try {
    await db.exec('revoke execute on function public.sofia_campaign_contact_eligible_v1(uuid,text) from service_role');
    await assert.rejects(as(db,'service_role',`select * from public.sofia_campaign_claim_v1('${rid}')`),e=>e.code==='42501');
    assert.equal((await db.query('select send_status from public.sofia_campaign_recipients')).rows[0].send_status,'pending');
    const plan=checkedPlan(db,await snapshot(db));
    assert.equal(plan.additions,1);
    assert.match(plan.apply_sql,/GRANT EXECUTE ON FUNCTION public\."sofia_campaign_contact_eligible_v1"\(uuid,text\) TO service_role;/);
    await db.exec(plan.apply_sql);
    assert.equal((await as(db,'service_role',`select * from public.sofia_campaign_claim_v1('${rid}')`)).rows.length,1);
  } finally {await db.close();}
});

test('actual SQL still rejects suppression, unapproved template and altered audience under the new grants',async()=>{
  for(const mutation of [`insert into public.sofia_campaign_suppressions values('${phone}',true)`,
    'update public.sofia_campaigns set approved_at=null',`update public.sofia_campaign_recipients set telefono='573000000009'`]) {
    const db=await fixture();try {
      await db.exec(checkedPlan(db,await snapshot(db)).apply_sql);await db.exec(mutation);
      assert.equal((await as(db,'service_role',`select * from public.sofia_campaign_claim_v1('${rid}')`)).rows.length,0);
    } finally {await db.close();}
  }
});

test('existing finite table grants produce a no-op plan and exact post-commit reversal of additions is proven locally',async()=>{
  for(const existingGrants of [false,true]) {
    const db=await fixture({existingGrants});try {
      const before=await snapshot(db),plan=checkedPlan(db,before);
      if(existingGrants) assert.equal(plan.additions,0);
      if(plan.apply_sql) await db.exec(plan.apply_sql); // autocommit: not a BEGIN-only rollback claim
      assert.equal(checkedPlan(db,await snapshot(db)).additions,0);
      if(plan.reverse_sql) await db.exec(plan.reverse_sql);
      assert.deepEqual(cleanSnapshot(await snapshot(db)),cleanSnapshot(before));
    } finally {await db.close();}
  }
});

test('plans fail closed on incomplete metadata, missing column, owner, RLS, invoker or ambiguous column ACL drift',async()=>{
  const db=await fixture();try {
    const original=await snapshot(db);
    for(const mutate of [s=>delete s.schema_grants,
      s=>{s.relations.find(r=>r.name==='clientes').rls=false;},
      s=>{s.relations.find(r=>r.name==='clientes').owner='other_owner';},
      s=>{s.relations.find(r=>r.name==='clientes').columns=[];},
      s=>{s.relations.find(r=>r.name==='clientes').columns[0].acl='{unreviewed_role=r/postgres}';},
      s=>{s.functions.find(f=>f.name==='sofia_campaign_claim_v1').security_definer=true;}]) {
      const copy=structuredClone(original);mutate(copy);assert.throws(()=>checkedPlan(db,copy));
    }
  } finally {await db.close();}
});

test('reviewed function pins are mandatory and detect real function configuration drift even when EXECUTE already exists',async()=>{
  const db=await fixture({existingGrants:true});try {
    const original=await snapshot(db);
    assert.throws(()=>campaignGrantPlan(original),/Independently reviewed function definition pins required/);
    assert.throws(()=>campaignGrantPlan(original,{functionDefinitions:{}}),/Independently reviewed function definition pins required/);
    await db.exec("alter function public.sofia_campaign_claim_v1(uuid) set statement_timeout='3s'");
    const changed=await snapshot(db);
    assert.throws(()=>checkedPlan(db,changed),/Reviewed function definition drift/);
    assert.deepEqual((await snapshot(db)).relations,changed.relations);
  } finally {await db.close();}
});

test('partial column privileges survive additive apply, idempotent retry and the ORIGINAL post-commit reverse plan',async()=>{
  const db=await fixture();try {
    await db.exec('grant select(id),update(id) on public.clientes to service_role');
    const before=await snapshot(db),plan=checkedPlan(db,before);
    assert.doesNotMatch(plan.apply_sql.split('\n')[0],/\("id"/);
    await db.exec(plan.apply_sql);
    assert.equal(checkedPlan(db,await snapshot(db)).additions,0);
    assert.equal((await as(db,'service_role',`select * from public.sofia_campaign_claim_v1('${rid}')`)).rows.length,1);
    await db.exec(plan.reverse_sql);
    assert.deepEqual(cleanSnapshot(await snapshot(db)),cleanSnapshot(before));
    const privileges=await db.query("select has_column_privilege('service_role','public.clientes','id','SELECT') as can_read,has_column_privilege('service_role','public.clientes','id','UPDATE') as can_update");
    assert.deepEqual(privileges.rows[0],{can_read:true,can_update:true});
  } finally {await db.close();}
});

test('interrupted additive apply can resume without duplicate grants, while original reverse plan restores its exact prior ACL',async()=>{
  const db=await fixture();try {
    const before=await snapshot(db),original=checkedPlan(db,before);
    const lines=original.apply_sql.split('\n');assert.ok(lines.length>1);
    await db.exec(lines[0]);
    const retry=checkedPlan(db,await snapshot(db));assert.equal(retry.additions,original.additions-1);
    await db.exec(retry.apply_sql);
    assert.equal(checkedPlan(db,await snapshot(db)).additions,0);
    await db.exec(original.reverse_sql);
    assert.deepEqual(cleanSnapshot(await snapshot(db)),cleanSnapshot(before));
  } finally {await db.close();}
});

test('unreviewed column grantors/options and table grants that would erase prior column ACL on reversal fail closed',async()=>{
  const db=await fixture();try {
    const before=await snapshot(db);
    for(const acl of ['{service_role=r*/postgres}','{service_role=r/other_owner}','{unreviewed_role=r/postgres}']) {
      const copy=structuredClone(before);copy.relations.find(r=>r.name==='clientes').columns[0].acl=acl;
      assert.throws(()=>checkedPlan(db,copy),/Existing column ACL requires separate review/);
    }
    await db.exec('grant select(id) on public.sofia_campaign_recipients to service_role');
    const partial=await snapshot(db);
    assert.throws(()=>checkedPlan(db,partial),/Table-level grant would require restoration of existing column ACL/);
    assert.deepEqual(await snapshot(db).then(cleanSnapshot),cleanSnapshot(partial));
  } finally {await db.close();}
});
