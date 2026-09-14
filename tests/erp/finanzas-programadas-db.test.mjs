import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {before, after, test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';

const maite='d1782db6-bacc-4caf-af6f-ce1b8d1c0391';
const oscar='6de0ad26-64af-4966-8cd9-d468880af627';
const retail='00000000-0000-0000-0000-000000000003';
let db;
before(async()=>{
  db=await PGlite.create();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage; create schema cron;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table public.perfiles(id uuid primary key,activo boolean,rol text);
    insert into public.perfiles values ('${maite}',true,'auditoria'),('${oscar}',true,'gerencia'),('${retail}',true,'tienda');
    create function public.rol_actual() returns text language sql stable security definer set search_path='' as $$select rol from public.perfiles where id=auth.uid()$$;
    create table public.origenes(codigo text primary key);
    create table public.audit_log(usuario text,accion text,tabla text,registro_id text,detalle jsonb);
    create table storage.objects(bucket_id text,name text);
    alter table storage.objects enable row level security;
    create table cron.job(jobid bigint,jobname text,schedule text,command text);
    create function cron.unschedule(bigint) returns boolean language sql as $$select true$$;
    create function cron.schedule(text,text,text) returns bigint language sql as $$insert into cron.job values(1,$1,$2,$3) returning jobid$$;
    grant usage on schema public,auth,storage to authenticated;
  `);
  // pg_cron is hosted infrastructure; all business SQL runs unchanged.
  const sql=readFileSync(new URL('../../supabase/migrations/20260914200633_obligaciones_recurrentes_y_retiros_por_negocio.sql',import.meta.url),'utf8');
  await db.exec(sql.replace('create extension if not exists pg_cron;',''));
});
after(async()=>{await db?.close();});
async function asUser(id){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');}
async function create(account='Nequi · Billetera digital · 3001234567',type='gasto'){
  const {rows}=await db.query(`select * from public.finanzas_registrar_movimiento($1,'b2b','2026-09-14','contador','Prueba local','Beneficiario prueba',null,$2,800000,null,null,null)`,[type,account]);return rows[0];
}
test('activa vacío, cron solo genera pendientes y las APIs no son SECURITY DEFINER públicas',async()=>{
  assert.equal((await db.query('select count(*)::int n from financial_entries')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from financial_recurring_templates')).rows[0].n,0);
  assert.equal((await db.query('select schedule from cron.job')).rows[0].schedule,'10 5 * * *');
  const {rows}=await db.query("select proname,prosecdef from pg_proc where pronamespace='public'::regnamespace and (proname like 'finanzas_%' or proname='es_controlador_financiero')");
  assert.equal(rows.length,6);assert.ok(rows.every(r=>!r.prosecdef));
  assert.equal((await db.query("select has_function_privilege('anon','public.finanzas_generar_pendientes()','execute') allowed")).rows[0].allowed,false);
});
test('Maite registra pendiente; no aprueba; Oscar aprueba; exige soporte real y no duplica pago',async()=>{
  await asUser(maite);const entry=await create();assert.equal(entry.status,'pendiente_aprobacion');assert.equal(entry.paid_at,null);
  await assert.rejects(db.query("select public.finanzas_decidir_movimiento($1,'aprobado')",[entry.id]),/Solo Oscar/);
  await assert.rejects(db.query("select public.finanzas_registrar_pago($1,'finanzas/00000000-0000-0000-0000-000000000010.pdf')",[entry.id]),/soporte.*no está cargado/);
  await db.exec("reset role;insert into storage.objects values ('soportes','finanzas/00000000-0000-0000-0000-000000000010.pdf')");
  await asUser(maite);
  await assert.rejects(db.query("select public.finanzas_registrar_pago($1,'finanzas/00000000-0000-0000-0000-000000000010.pdf')",[entry.id]),/no está aprobado/);
  await asUser(oscar);const approved=await db.query("select * from public.finanzas_decidir_movimiento($1,'aprobado')",[entry.id]);assert.equal(approved.rows[0].status,'aprobado');
  await asUser(maite);const paid=await db.query("select * from public.finanzas_registrar_pago($1,'finanzas/00000000-0000-0000-0000-000000000010.pdf')",[entry.id]);assert.equal(paid.rows[0].status,'pagado');assert.equal(paid.rows[0].approved_by,oscar);assert.equal(paid.rows[0].paid_by,maite);
  await assert.rejects(db.query("select public.finanzas_registrar_pago($1,'finanzas/00000000-0000-0000-0000-000000000010.pdf')",[entry.id]),/ya fue pagado/);
  await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from audit_log where registro_id=$1',[entry.id])).rows[0].n,3);
});
test('Retail no ve datos ni escribe; ni Maite puede saltarse la API',async()=>{
  await asUser(retail);assert.equal((await db.query('select * from financial_entries')).rows.length,0);
  await assert.rejects(create(),/Solo Maite u Oscar/);
  await assert.rejects(db.query('select kora_private.generate_financial_entries(current_date)'),/permission denied/);
  await asUser(maite);await assert.rejects(db.query("update financial_entries set status='pagado'"),/permission denied/);
  await asUser('');await assert.rejects(create(),/Solo Maite u Oscar/);
});
test('rechaza correos, conceptos vacíos y retiros sin período',async()=>{
  await asUser(maite);await assert.rejects(create('persona@example.com'),/account_not_email/);
  await assert.rejects(create(null,'retiro_utilidad'),/período/);
  await assert.rejects(db.query("select public.finanzas_registrar_movimiento('gasto','b2b',current_date,'otro',' ','Prueba',null,null,10)"),/check constraint/);
});
test('recurrencias son pendientes, idempotentes y preservan el importe configurado',async()=>{
  await asUser(maite);
  const {rows}=await db.query("select * from public.finanzas_guardar_recurrencia(null,'business_general','b2b',null,'contador','Prueba mensual','Beneficiario prueba',null,null,'fijo',100,array[1]::smallint[],'2026-09-01','2026-09-01',true)");
  await db.query('select public.finanzas_generar_pendientes()');await db.query('select public.finanzas_generar_pendientes()');
  const entries=await db.query('select * from financial_entries where template_id=$1',[rows[0].id]);assert.equal(entries.rows.length,1);assert.equal(entries.rows[0].status,'pendiente_aprobacion');assert.equal(Number(entries.rows[0].amount),100);
});
