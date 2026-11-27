import test from'node:test';import assert from'node:assert/strict';
import{setup,read,value,asActor,enableFictional,operator}from'./core-fixture.mjs';
import{fullSetup}from'./full-fixture.mjs';
for(const mode of ['core','full'])test(mode+' non-superuser installer assigns all function ownership without identity-schema grant option',async()=>{
 const db=mode==='full'?(await fullSetup({install:false})).db:await setup({install:false});try{
  await db.exec('create role fictional_installer createrole bypassrls;grant create on database postgres to fictional_installer;grant usage on schema auth to fictional_installer;');
  const schemas=['public','kora_private','storage','realtime'];
  for(const n of schemas)await db.exec('alter schema '+n+' owner to fictional_installer;');
  const tables=(await db.query("select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','kora_private','storage','realtime') and c.relkind in('r','p')")).rows;
  for(const r of tables)await db.exec(`alter table "${r.nspname}"."${r.relname}" owner to fictional_installer;`);
  const views=(await db.query("select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v'")).rows;
  for(const r of views)await db.exec(`alter view "${r.nspname}"."${r.relname}" owner to fictional_installer;`);
  const sequences=(await db.query("select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='S'")).rows;
  for(const r of sequences)await db.exec(`alter sequence "${r.nspname}"."${r.relname}" owner to fictional_installer;`);
  const functions=(await db.query("select p.oid::regprocedure::text signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','kora_private') and p.prokind='f'")).rows;
  for(const r of functions)await db.exec('alter function '+r.signature+' owner to fictional_installer;');
  await db.exec('set session authorization fictional_installer;');
  assert.equal(await value(db,"select rolsuper from pg_roles where rolname=current_user"),false);
  assert.equal(await value(db,"select has_schema_privilege(current_user,'auth','USAGE WITH GRANT OPTION')"),false);
  // Only installer name and its GRANT target differ. The actual role creation,
  // ownership assignments, schema grants/revokes and RPCs run unchanged.
  const original=read('candidate/scope-'+mode+'.sql');
  const sql=original.replace("current_user<>'postgres'","current_user<>'fictional_installer'").replace('grant kora_cartera_operator to postgres with','grant kora_cartera_operator to fictional_installer with');
  await db.exec(sql);
  assert.equal(await value(db,"select has_schema_privilege('kora_cartera_operator','auth','USAGE')"),false);
  assert.equal(await value(db,"select has_schema_privilege('fictional_installer','auth','USAGE WITH GRANT OPTION')"),false);
  assert.equal(await value(db,"select pg_get_userbyid(proowner) from pg_proc where oid='public.cartera_operador_inicio()'::regprocedure"),'kora_cartera_operator');
  if(mode==='full')for(const signature of ['public.cartera_operador_datos(text,date,uuid,uuid,integer,integer,uuid)','public.cartera_operador_guardar_gestion(uuid,uuid,text,text,text,date,numeric)','public.cartera_operador_solicitar_provision(uuid,jsonb)'])assert.equal(await value(db,"select pg_get_userbyid(proowner) from pg_proc where oid='"+signature+"'::regprocedure"),'kora_cartera_operator');
  await enableFictional(db);await asActor(db);assert.equal((await value(db,'select public.cartera_operador_inicio()')).profile.id,operator);
 }finally{await db.close();}
});
