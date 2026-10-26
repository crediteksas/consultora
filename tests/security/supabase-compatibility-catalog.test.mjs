import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {sqlStatements} from '../../scripts/supabase-compat/sql-statements.mjs';

const catalogSql=await readFile(new URL('../../scripts/supabase-compat/catalog-query.sql',import.meta.url),'utf8');
const dependenciesSql=await readFile(new URL('../../scripts/supabase-compat/dependencies-query.sql',import.meta.url),'utf8');
const migration=await readFile(new URL('../../supabase/migrations/20261021161019_kora_compat_select_krediya_price_rules.sql',import.meta.url),'utf8');
const snapshot=async db=>(await db.query(catalogSql)).rows[0].snapshot;

async function database({existingSelect=false}={}) {
  const db=new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    grant usage on schema public to anon,authenticated,service_role;
    -- Optional stricter function defaults too; GLOBAL is required to remove
    -- PostgreSQL's built-in PUBLIC EXECUTE, not a per-schema REVOKE.
    alter default privileges revoke execute on functions from public;
    create function public.tiene_capacidad_aliados(text) returns boolean language sql security invoker as
      $$ select coalesce(current_setting('fixture.capability',true)='reviewer',false) $$;
    revoke execute on function public.tiene_capacidad_aliados(text) from public,anon;
    grant execute on function public.tiene_capacidad_aliados(text) to authenticated;
    create table public.krediya_price_rules(id int primary key,referencia text,precio_venta numeric,pagamos numeric);
    alter table public.krediya_price_rules enable row level security;
    create policy krediya_price_rules_select on public.krediya_price_rules for select to authenticated
      using(public.tiene_capacidad_aliados('revisor'));
    create policy krediya_price_rules_write on public.krediya_price_rules for all to authenticated
      using(public.tiene_capacidad_aliados('revisor')) with check(public.tiene_capacidad_aliados('revisor'));
    insert into public.krediya_price_rules values(1,'FICTITIOUS_DEVICE',100,80);
    -- No automatic grants in this disposable database.
    create schema fixture_hidden;
    create function fixture_hidden.review_helper() returns boolean language sql security invoker as $$ select true $$;
    alter function fixture_hidden.review_helper() set app.fixture_secret='FICTITIOUS_CONFIG_VALUE';
    grant usage on schema fixture_hidden to authenticated;
    revoke execute on function fixture_hidden.review_helper() from public;
    grant execute on function fixture_hidden.review_helper() to authenticated;
    create table fixture_hidden.internal_fixture(id serial primary key);
    alter table fixture_hidden.internal_fixture enable row level security;
    create policy private_fixture_select on fixture_hidden.internal_fixture for select to authenticated using(fixture_hidden.review_helper());
    create view fixture_hidden.fixture_view with(security_invoker=true) as select id from public.krediya_price_rules;
  `);
  if(existingSelect) await db.exec('grant select on public.krediya_price_rules to authenticated;');
  return db;
}

async function asRole(db,role,sql,capability='reviewer') {
  try {
    await db.exec(`set role ${role}; set fixture.capability='${capability}';`);
    return await db.query(sql);
  } finally {await db.exec('reset role; reset fixture.capability;');}
}

test('captura de catálogo incluye esquemas privados, ACL y hashes sin filas ni valores de configuración',async()=>{
  const db=await database();
  try {
    const data=await snapshot(db);
    assert.ok(data.schema_grants.some(s=>s.schema==='fixture_hidden'&&s.grants.some(g=>g.grantee==='authenticated'&&g.privilege==='USAGE')));
    const helper=data.functions.find(f=>f.schema==='fixture_hidden'&&f.name==='review_helper');
    assert.ok(helper.grants.some(g=>g.grantee==='authenticated'&&g.privilege==='EXECUTE'));
    assert.match(helper.definition_md5,/^[a-f0-9]{32}$/);
    assert.match(helper.config_md5,/^[a-f0-9]{32}$/);
    const view=data.relations.find(r=>r.name==='fixture_view');
    assert.match(view.definition_md5,/^[a-f0-9]{32}$/);
    assert.ok(data.relations.some(r=>r.schema==='fixture_hidden'&&r.kind==='S'));
    assert.ok(data.policies.some(p=>p.schema==='fixture_hidden'));
    assert.doesNotMatch(JSON.stringify(data),/FICTITIOUS_DEVICE|FICTITIOUS_CONFIG_VALUE/);
    const {captured_at,...before}=data;
    const {captured_at:afterTime,...after}=await snapshot(db);
    assert.deepEqual(after,before);
  } finally {await db.close();}
});

test('dependencias incluyen políticas, secuencias y vistas de esquemas privados',async()=>{
  const db=await database();
  try {
    const data=(await db.query(dependenciesSql)).rows[0].metadata;
    assert.ok(data.schemas.some(s=>s.schema==='fixture_hidden'));
    assert.ok(data.policy_dependencies.some(d=>d.schema==='fixture_hidden'&&d.function_schema==='fixture_hidden'&&d.function==='review_helper'));
    assert.ok(data.sequence_ownership.some(d=>d.schema==='fixture_hidden'&&d.table==='internal_fixture'));
    assert.ok(data.view_dependencies.some(d=>d.schema==='fixture_hidden'&&d.target==='krediya_price_rules'));
  } finally {await db.close();}
});

test('consultas de inventario son sentencias de solo lectura',()=>{
  for(const sql of [catalogSql,dependenciesSql]) {
    const statements=sqlStatements(sql);
    assert.equal(statements.length,1);
    assert.equal(statements[0].tokens[0].value,'with');
    const keywords=statements[0].tokens.filter(t=>t.kind==='word').map(t=>t.value);
    for(const mutation of ['insert','update','delete','grant','revoke','alter','create','drop','truncate','notify']) assert.ok(!keywords.includes(mutation),mutation);
  }
});

test('migración restaura lectura de revisor con defaults nuevos y conserva denegaciones',async()=>{
  const db=await database();
  try {
    await assert.rejects(asRole(db,'authenticated','select * from public.krediya_price_rules'),error=>error.code==='42501');
    const before=await snapshot(db);
    await db.exec(migration);
    const after=await snapshot(db);
    assert.equal((await asRole(db,'authenticated','select * from public.krediya_price_rules')).rows.length,1);
    assert.equal((await asRole(db,'authenticated','select * from public.krediya_price_rules','store_alpha')).rows.length,0);
    assert.equal((await asRole(db,'authenticated','select * from public.krediya_price_rules','store_beta')).rows.length,0);
    await assert.rejects(asRole(db,'anon','select * from public.krediya_price_rules'),error=>error.code==='42501');
    for(const sql of ["insert into public.krediya_price_rules values(2,'FICTITIOUS',100,80)","update public.krediya_price_rules set precio_venta=1","delete from public.krediya_price_rules"]) await assert.rejects(asRole(db,'authenticated',sql),error=>error.code==='42501');
    assert.deepEqual(after.policies,before.policies);
    assert.deepEqual(after.functions,before.functions);
    assert.deepEqual(after.defaults,before.defaults);
    assert.deepEqual(after.schema_grants,before.schema_grants);
    const grants=after.relations.find(r=>r.name==='krediya_price_rules').grants.filter(g=>g.grantee!=='postgres');
    assert.deepEqual(grants.map(g=>[g.grantee,g.privilege,g.grantable]),[['authenticated','SELECT',false]]);
  } finally {await db.close();}
});

test('actualización con SELECT existente es idempotente y no cambia ninguna ACL ni protección',async()=>{
  const db=await database({existingSelect:true});
  try {
    const {captured_at,...before}=await snapshot(db);
    await db.exec(migration);await db.exec(migration);
    const {captured_at:afterTime,...after}=await snapshot(db);
    assert.deepEqual(after,before);
    // For this observed legacy state rollback is a no-op, not a REVOKE SELECT.
  } finally {await db.close();}
});

test('permiso de tabla no oculta falta de EXECUTE en la autorización ni de USAGE en el esquema',async()=>{
  for(const missing of [
    'revoke execute on function public.tiene_capacidad_aliados(text) from authenticated',
    'revoke usage on schema public from public,authenticated'
  ]) {
    const db=await database();
    try {
      await db.exec(missing);
      await assert.rejects(db.exec(migration),/Compatibilidad: faltan permisos previos/);
      const relation=(await snapshot(db)).relations.find(r=>r.name==='krediya_price_rules');
      assert.ok(!relation.grants.some(g=>g.grantee==='authenticated'&&g.privilege==='SELECT'));
    } finally {await db.close();}
  }
});

test('fallo de guardas no concede permisos ni cambia una política más amplia',async()=>{
  for(const change of ['alter table public.krediya_price_rules disable row level security',
    'drop policy krediya_price_rules_select on public.krediya_price_rules',
    'alter policy krediya_price_rules_select on public.krediya_price_rules using(true)',
    'alter policy krediya_price_rules_write on public.krediya_price_rules using(true) with check(true)',
    'alter policy krediya_price_rules_select on public.krediya_price_rules to authenticated,anon',
    'create policy unexpected_read on public.krediya_price_rules for select to authenticated using(true)']) {
    const db=await database();
    try {
      await db.exec(change);
      await assert.rejects(db.exec(migration),/Compatibilidad/);
      const relation=(await snapshot(db)).relations.find(r=>r.name==='krediya_price_rules');
      assert.ok(!relation.grants.some(g=>g.grantee==='authenticated'&&g.privilege==='SELECT'));
    } finally {await db.close();}
  }
});

test('rollback transaccional en reconstrucción aislada restaura exactamente el catálogo previo',async()=>{
  const db=await database();
  try {
    const {captured_at,...before}=await snapshot(db);
    await db.exec('begin');
    await db.exec(migration);
    await db.exec('rollback');
    const {captured_at:afterTime,...after}=await snapshot(db);
    assert.deepEqual(after,before);
  } finally {await db.close();}
});

test('catálogo registra adjuntos y estado de triggers sin exponer sus argumentos o cuerpos',async()=>{
  const db=await database();
  try {
    await db.exec(`create function fixture_hidden.fixture_trigger_fn() returns trigger language plpgsql security invoker
      as $$begin perform 'FICTITIOUS_TRIGGER_BODY';return new;end$$;
      create trigger fixture_guard before insert on fixture_hidden.internal_fixture
      for each row execute function fixture_hidden.fixture_trigger_fn('FICTITIOUS_TRIGGER_ARGUMENT');`);
    const first=await snapshot(db),trigger=first.triggers.find(t=>t.name==='fixture_guard');
    assert.deepEqual({schema:trigger.schema,table:trigger.table,enabled:trigger.enabled,function_schema:trigger.function_schema,function_name:trigger.function_name,function_identity:trigger.function_identity},
      {schema:'fixture_hidden',table:'internal_fixture',enabled:'O',function_schema:'fixture_hidden',function_name:'fixture_trigger_fn',function_identity:''});
    assert.match(trigger.definition_md5,/^[a-f0-9]{32}$/);
    assert.doesNotMatch(JSON.stringify(first),/FICTITIOUS_TRIGGER_BODY|FICTITIOUS_TRIGGER_ARGUMENT/);
    await db.exec('alter table fixture_hidden.internal_fixture disable trigger fixture_guard');
    assert.equal((await snapshot(db)).triggers.find(t=>t.name==='fixture_guard').enabled,'D');
  } finally {await db.close();}
});

test('un trigger real nuevo no supera el control sin una expectativa exacta revisada',async()=>{
  const {checkPermissionContract}=await import('../../scripts/supabase-compat/check-permission-contract.mjs');
  const db=await database();
  try {
    await db.exec(`create function fixture_hidden.fixture_trigger_fn() returns trigger language plpgsql security invoker
      as $$begin return new;end$$;`);
    const before=await snapshot(db);
    await db.exec(`create trigger fixture_guard before insert on fixture_hidden.internal_fixture
      for each row execute function fixture_hidden.fixture_trigger_fn();`);
    const after=await snapshot(db),contract={schema_version:1,project:'fixture',objects:[]};
    assert.equal(checkPermissionContract({before,after,contract,created:[]}).ok,false);
    const stable=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
    contract.allow_catalog_changes={triggers:stable(after.triggers)};
    assert.equal(checkPermissionContract({before,after,contract,created:[]}).ok,true);
    await db.exec('alter table fixture_hidden.internal_fixture disable trigger fixture_guard');
    assert.equal(checkPermissionContract({before,after:await snapshot(db),contract,created:[]}).ok,false);
  } finally {await db.close();}
});
