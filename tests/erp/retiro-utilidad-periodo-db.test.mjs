import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';

test('la base fija el periodo posterior al cierre sin tocar caja ni el cierre',async()=>{
  const db=await PGlite.create();
  try{
    const maite='d1782db6-bacc-4caf-af6f-ce1b8d1c0391';
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema storage; create schema cron;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.perfiles(id uuid primary key,activo boolean,rol text);
      insert into public.perfiles values ('${maite}',true,'auditoria');
      create function public.rol_actual() returns text language sql stable security definer set search_path='' as $$select rol from public.perfiles where id=auth.uid()$$;
      create table public.origenes(codigo text primary key);
      create table public.audit_log(usuario text,accion text,tabla text,registro_id text,detalle jsonb);
      create table storage.objects(bucket_id text,name text);
      create table cron.job(jobid bigint,jobname text,schedule text,command text);
      create function cron.unschedule(bigint) returns boolean language sql as $$select true$$;
      create function cron.schedule(text,text,text) returns bigint language sql as $$insert into cron.job values(1,$1,$2,$3) returning jobid$$;
      grant usage on schema public,auth,storage to authenticated;
    `);
    const migration=name=>readFileSync(new URL(`../../supabase/migrations/${name}`,import.meta.url),'utf8');
    await db.exec(migration('20260914200633_obligaciones_recurrentes_y_retiros_por_negocio.sql').replace('create extension if not exists pg_cron;',''));
    await db.exec(migration('20261002213529_cierre_informativo_utilidades_negocio.sql'));
    await db.exec(migration('20261003204510_retiro_utilidad_periodo_automatico.sql'));
    await db.exec("insert into public.utilidades_cierres_negocio(periodo,negocio,utilidad_neta,retiro_declarado,componentes,declaracion) values ('2026-09-01','aliados',33026532.09,33026532.09,'{}','Cierre de prueba')");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[maite]);
    await db.exec('set role authenticated');
    const args=['retiro_utilidad','aliados','2026-10-03','retiro','Retiro de utilidad','SOCIO PRUEBA','12345678','Bancolombia · Ahorros · 1234567890',200000];
    const result=await db.query('select source_period_from,source_period_to,status from public.finanzas_registrar_movimiento($1,$2,$3,$4,$5,$6,$7,$8,$9)',args);
    assert.equal(result.rows[0].source_period_from.toISOString().slice(0,10),'2026-10-01');
    assert.equal(result.rows[0].source_period_to.toISOString().slice(0,10),'2026-10-03');
    assert.equal(result.rows[0].status,'pendiente_aprobacion');
    await assert.rejects(db.query("select public.finanzas_registrar_movimiento('retiro_utilidad','aliados','2026-10-03','retiro','Retiro de utilidad','SOCIO PRUEBA',null,null,100,'2026-09-01','2026-10-03')"),/período de utilidad cambió/);
    await assert.rejects(db.query("select public.finanzas_registrar_movimiento('retiro_utilidad','b2b','2026-10-03','retiro','Retiro de utilidad','SOCIO PRUEBA',null,null,100)"),/Falta registrar el cierre anterior/);
    await db.exec('reset role');
    const count=await db.query('select count(*)::int as n from financial_entries');
    assert.equal(count.rows[0].n,1);
    const close=await db.query("select disponible from utilidades_cierres_negocio where negocio='aliados'");
    assert.equal(Number(close.rows[0].disponible),0);
  }finally{await db.close();}
});
