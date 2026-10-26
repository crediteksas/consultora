import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {sqlStatements} from '../../scripts/supabase-compat/sql-statements.mjs';

// This exact SQL-only migration has no seed data. It was matched by content to
// the applied migration, not selected by a similar name/version. Never replay
// this fixture on a real project. Prerequisite tables and all rows are synthetic.
const source=await readFile(new URL('../fixtures/supabase-compat/kora-budget-report.sql',import.meta.url),'utf8');
const catalog=await readFile(new URL('../../scripts/supabase-compat/catalog-query.sql',import.meta.url),'utf8');
const aid='00000000-0000-0000-0000-000000000001';
const bid='00000000-0000-0000-0000-000000000002';
const phoneA='573000000001',phoneB='573000000002';
const prerequisites=['origenes','perfiles','presupuestos','ventas','creditos','venta_items','productos'];
const snapshot=async db=>(await db.query(catalog)).rows[0].snapshot;
async function as(db,role,sql){
  try{await db.exec('set role '+role);return await db.query(sql);}
  finally{await db.exec('reset role');}
}
async function readGrants(db){
  // v.* in the actual SQL requires SELECT on every ventas column, even one
  // unused downstream. This table-wide service read is not a browser grant.
  await db.exec(`grant select(codigo,nombre,tipo,activo) on public.origenes to service_role;
    grant select(id,nombre,tienda_codigo,activo,rol) on public.perfiles to service_role;
    grant select(fecha,tienda_codigo,meta_venta_total,meta_uds_cel,meta_uds_acc,meta_creditos) on public.presupuestos to service_role;
    grant select on public.ventas to service_role;
    grant select(venta_id) on public.creditos to service_role;
    grant select(venta_id,producto_id,cantidad) on public.venta_items to service_role;
    grant select(id,tipo) on public.productos to service_role;`);
}
async function fixture({legacy=false}={}){
  const db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    grant usage on schema public to anon,authenticated,service_role;
    create table public.origenes(codigo text primary key,nombre text,tipo text,activo boolean);
    create table public.perfiles(id uuid primary key,nombre text,tienda_codigo text,activo boolean,rol text);
    create table public.presupuestos(fecha date,tienda_codigo text,meta_venta_total numeric,meta_uds_cel numeric,meta_uds_acc numeric,meta_creditos numeric);
    create table public.ventas(id int primary key,fecha date,tienda_codigo text,total numeric,anulada boolean,tipo text,synthetic_unused text);
    create table public.creditos(venta_id int,synthetic_private text);
    create table public.venta_items(venta_id int,producto_id int,cantidad numeric);
    create table public.productos(id int primary key,tipo text);`);
  for(const name of prerequisites)await db.exec('alter table public.'+name+' enable row level security');
  if(legacy){
    // Finite legacy defaults in an isolated heap only, not remediation SQL.
    await db.exec(`alter default privileges in schema public grant select,insert,update,delete on tables to anon,authenticated,service_role;
      alter default privileges in schema public grant usage,select on sequences to anon,authenticated,service_role;`);
    await readGrants(db);
    await db.exec('create sequence public.synthetic_legacy_sequence');
  }
  await db.exec(source);
  db.nativeDefinitions=(await db.query(`select proname,md5(pg_get_functiondef(oid)) as hash from pg_proc where proname in ('presupuesto_whatsapp_corte','presupuesto_whatsapp_reservar') order by proname`)).rows;
  // Freeze only time in the reserve function; capture native hashes first.
  await db.exec(`create function public.compat_budget_clock() returns timestamptz language sql stable security invoker as $$select current_setting('compat.budget_time')::timestamptz$$;
    grant execute on function public.compat_budget_clock() to service_role;
    set compat.budget_time='2030-02-10T13:30:00Z';`);
  const reserve=sqlStatements(source).find(s=>/create function public\.presupuesto_whatsapp_reservar\(/i.test(s.raw));
  assert.ok(reserve);
  await db.exec(reserve.raw.replace('create function','create or replace function').replaceAll('now()','public.compat_budget_clock()'));
  await db.exec(`insert into public.origenes values('SYN-A','Synthetic A','propia',true),('SYN-B','Synthetic B','propia',true);
    insert into public.perfiles values('${aid}','Synthetic Admin A','SYN-A',true,'admin_tienda'),('${bid}','Synthetic Admin B','SYN-B',true,'admin_tienda');
    insert into public.presupuesto_whatsapp_destinos values('SYN-A','${aid}','${phoneA}',true),('SYN-B','${bid}','${phoneB}',true);
    insert into public.presupuestos select date '2030-02-01'+d,s,100,2,3,1 from generate_series(0,27) d cross join (values('SYN-A'),('SYN-B')) x(s);
    insert into public.ventas values(1,'2030-02-09','SYN-A',200,false,'contado','synthetic'),(2,'2030-02-08','SYN-A',150,false,'credito','synthetic'),(3,'2030-02-09','SYN-B',50,false,'contado','synthetic'),(4,'2030-02-09','SYN-A',999,true,'contado','synthetic'),(5,'2030-02-10','SYN-A',500,false,'contado','synthetic');
    insert into public.creditos values(2,'synthetic');
    insert into public.productos values(1,'serializado'),(2,'cantidad');
    insert into public.venta_items values(1,1,1),(1,2,3),(2,1,1),(2,2,2),(3,1,1),(4,2,9),(5,2,9);`);
  return db;
}
const report=async db=>(await as(db,'service_role',"select public.presupuesto_whatsapp_corte(date '2030-02-10') as value")).rows[0].value;
const reserve=async db=>(await as(db,'service_role','select public.presupuesto_whatsapp_reservar() as value')).rows[0].value;

test('budget source is an exact SQL-only migration fixture and native definitions remain reproducible',async()=>{
  assert.equal(createHash('md5').update(source).digest('hex'),'a7032c09973985e438dda95ed38d4709');
  assert.ok(!sqlStatements(source).some(s=>['insert','update','delete','truncate'].includes(s.tokens[0]?.value?.toLowerCase())));
  const db=await fixture();try{
    assert.deepEqual(db.nativeDefinitions,[{proname:'presupuesto_whatsapp_corte',hash:'c8ca342dff5bb6efd07d813a280aef37'},{proname:'presupuesto_whatsapp_reservar',hash:'ffc2fab1e85ba25c84f852508a91f32d'}]);
  }finally{await db.close();}
});

test('new-default rebuild: explicit new-table grants do not replace prerequisite SELECT; failure is atomic',async()=>{
  const db=await fixture();try{
    await assert.rejects(report(db),e=>e.code==='42501');
    await assert.rejects(reserve(db),e=>e.code==='42501');
    assert.equal((await db.query('select count(*)::int n from public.presupuesto_whatsapp_envios')).rows[0].n,0);
    await readGrants(db);
    const rows=await report(db);assert.equal(rows.length,2);
    assert.deepEqual(rows.map(r=>[r.tienda_codigo,r.ventas,r.creditos,r.celulares,r.accesorios,r.meta_mensual,r.meta_acumulada,r.meta_hoy,r.presupuesto_completo]),[
      ['SYN-A',350,1,1,5,2800,900,100,true],['SYN-B',50,0,1,0,2800,900,100,true]]);
    const first=await reserve(db);assert.equal(first.length,2);assert.ok(first.every(r=>r.estado==='enviando'&&r.intentos===1));
    assert.equal((await reserve(db)).length,0);
  }finally{await db.close();}
});

test('actual report SELECT star requires the unused ventas column while unrelated credit fields stay denied',async()=>{
  const db=await fixture();try{
    await readGrants(db);await db.exec('revoke select on public.ventas from service_role;grant select(id,fecha,tienda_codigo,total,anulada,tipo) on public.ventas to service_role');
    await assert.rejects(report(db),e=>e.code==='42501');
    await db.exec('grant select(synthetic_unused) on public.ventas to service_role');
    assert.equal((await report(db)).length,2);
    await assert.rejects(as(db,'service_role','select synthetic_private from public.creditos'),e=>e.code==='42501');
    await assert.rejects(as(db,'service_role','update public.ventas set total=0'),e=>e.code==='42501');
  }finally{await db.close();}
});

test('browser roles cannot call either report RPC or read/change internal destinations and attempts',async()=>{
  const db=await fixture();try{
    await readGrants(db);
    for(const role of ['anon','authenticated'])for(const sql of ["select public.presupuesto_whatsapp_corte(date '2030-02-10')",'select public.presupuesto_whatsapp_reservar()','select * from public.presupuesto_whatsapp_destinos','select * from public.presupuesto_whatsapp_envios',"update public.presupuesto_whatsapp_destinos set activo=false"]){
      await assert.rejects(as(db,role,sql),e=>e.code==='42501');
    }
    await assert.rejects(as(db,'service_role','delete from public.presupuesto_whatsapp_envios'),e=>e.code==='42501');
    await db.exec('revoke execute on function public.presupuesto_whatsapp_corte(date) from service_role');
    await assert.rejects(reserve(db),e=>e.code==='42501');
    assert.equal((await db.query('select count(*)::int n from public.presupuesto_whatsapp_envios')).rows[0].n,0);
  }finally{await db.close();}
});

test('provider default revocation preserves existing object ACLs and both invoker flows in an upgrade',async()=>{
  const db=await fixture({legacy:true});try{
    const before=await snapshot(db);
    const sequence=before.relations.find(r=>r.kind==='S'&&r.name==='synthetic_legacy_sequence');
    assert.ok(sequence?.grants.some(g=>g.grantee==='service_role'&&g.privilege==='USAGE'));
    assert.equal((await as(db,'service_role',"select nextval('public.synthetic_legacy_sequence') as n")).rows[0].n,1);
    await db.exec(`alter default privileges for role postgres in schema public revoke select,insert,update,delete on tables from anon,authenticated,service_role;
      alter default privileges for role postgres in schema public revoke usage,select on sequences from anon,authenticated,service_role;`);
    const after=await snapshot(db);
    for(const key of ['relations','functions','policies','triggers','schema_grants','role_config'])assert.deepEqual(after[key],before[key]);
    assert.notDeepEqual(after.defaults,before.defaults);
    assert.equal((await as(db,'service_role',"select nextval('public.synthetic_legacy_sequence') as n")).rows[0].n,2);
    assert.equal((await report(db)).length,2);assert.equal((await reserve(db)).length,2);
    assert.equal((await reserve(db)).length,0);
    await db.exec('create table public.synthetic_future(id int);alter table public.synthetic_future enable row level security');
    await assert.rejects(as(db,'service_role','select * from public.synthetic_future'),e=>e.code==='42501');
    await db.exec('create sequence public.synthetic_future_sequence');
    for(const role of ['anon','authenticated','service_role'])await assert.rejects(as(db,role,"select nextval('public.synthetic_future_sequence')"),e=>e.code==='42501');
  }finally{await db.close();}
});

test('actual filters exclude inactive/mismatched recipients and old ambiguous attempts never retry automatically',async()=>{
  const db=await fixture();try{
    await readGrants(db);await db.exec("update public.perfiles set tienda_codigo='SYN-A' where tienda_codigo='SYN-B'");
    assert.deepEqual((await report(db)).map(r=>r.tienda_codigo),['SYN-A']);
    await db.exec("update public.perfiles set activo=false where tienda_codigo='SYN-A'");
    assert.deepEqual(await report(db),[]);
    await db.exec(`update public.perfiles set activo=true,tienda_codigo=case when id='${aid}' then 'SYN-A' else 'SYN-B' end`);
    assert.equal((await reserve(db)).length,2);
    await db.exec("set compat.budget_time='2030-02-10T13:41:00Z'");
    assert.deepEqual(await reserve(db),[]);
    const rows=(await db.query('select estado,intentos,last_error from public.presupuesto_whatsapp_envios order by tienda_codigo')).rows;
    assert.ok(rows.every(r=>r.estado==='incierto'&&r.intentos===1&&r.last_error==='envio_interrumpido_revisar_meta'));
    await db.exec("set compat.budget_time='2030-02-10T16:00:00Z'");
    assert.deepEqual(await reserve(db),[]);
  }finally{await db.close();}
});
