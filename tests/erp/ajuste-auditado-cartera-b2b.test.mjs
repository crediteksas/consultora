import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration=await readFile(new URL('../../supabase/migrations/20260924173241_ajuste_auditado_cartera_b2b_luis.sql',import.meta.url),'utf8');
const selfService=await readFile(new URL('../../supabase/migrations/20260924180119_ajustes_gerencia_autoservicio.sql',import.meta.url),'utf8');
const oscar='6de0ad26-64af-4966-8cd9-d468880af627';

test('deuda B2B Luis solo cambia tras autorizar Oscar, exactamente una vez',async()=>{
  const db=await PGlite.create();
  try{
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.origenes(codigo text primary key,nombre text,tipo text,activo boolean);
      create table public.perfiles(id uuid primary key,activo boolean,rol text);
      create table public.cuentas_cartera(id uuid primary key,tipo_cuenta text,tienda_codigo text,activo boolean);
      create table public.movimientos_cartera(id uuid primary key default gen_random_uuid(),cuenta_id uuid,
        tienda_codigo text,efecto text,monto numeric,concepto text,referencia_tipo text,
        referencia_id text,fecha_efectiva date,metadatos jsonb,creado_por uuid,created_at timestamptz default now());
      create table public.audit_log(usuario text,accion text,tabla text,registro_id text,detalle jsonb);
      insert into public.origenes values('CK-13','Luis','cliente_b2b',true);
      insert into public.perfiles values('${oscar}',true,'gerencia');
      insert into public.cuentas_cartera values('a1a702ef-afc7-41c2-9dfc-813e3e6ba167','cliente_b2b','CK-13',true);
      insert into public.movimientos_cartera(cuenta_id,tienda_codigo,efecto,monto,concepto)
        values('a1a702ef-afc7-41c2-9dfc-813e3e6ba167','CK-13','debito',5244000,'Remisión #68'),
          ('a1a702ef-afc7-41c2-9dfc-813e3e6ba167','CK-13','debito',2440000,'Remisión #57');
    `);
    await db.exec(migration);
    await db.exec(`create table public.saldo_ajustes_auditoria(id uuid primary key,tienda_codigo text,
      motivo text,caja_base numeric,deuda_base numeric,caja_objetivo numeric,deuda_objetivo numeric,
      referencia text,fecha_corte date); create table public.cuenta_corriente(tienda_codigo text,tipo text,monto numeric);
      create function public.caja_calcular_interno(p_tienda text,p_fecha date) returns jsonb
      language sql as $$select jsonb_build_object('esperado',0)$$;
      create function public.autorizar_ajuste_saldos_auditados(p_id uuid) returns jsonb
      language sql as $$select '{}'::jsonb$$;`);
    await db.exec(selfService);
    const id=(await db.query("select id from public.ajustes_auditoria_cartera_b2b where referencia='CK13-LUIS-AUD-20260924'")).rows[0].id;
    assert.equal(Number((await db.query("select sum(monto) as n from public.movimientos_cartera where tienda_codigo='CK-13'")).rows[0].n),7684000);
    await assert.rejects(db.query('select public.autorizar_ajuste_auditoria_cartera_b2b($1)',[id]),/Solo Oscar/);
    await assert.rejects(db.query(`select public.ajuste_gerencia_b2b($1,$2,$3,$4,$5)`,
      ['522e03de-3dbd-45cd-bd20-a5a0445504e4','CK-13',7684000,8000000,
        'Nueva auditoría de cartera validada por Gerencia']),/Solo Oscar/);
    await db.exec(`set request.jwt.claim.sub='${oscar}'`);
    await assert.rejects(db.query(`insert into public.movimientos_cartera(cuenta_id,tienda_codigo,efecto,monto,
      referencia_tipo,referencia_id) values('a1a702ef-afc7-41c2-9dfc-813e3e6ba167','CK-13','debito',1,
      'ajuste_auditoria_b2b',$1)`,[id]),/requiere autorización/);
    const first=(await db.query('select public.autorizar_ajuste_auditoria_cartera_b2b($1) as r',[id])).rows[0].r;
    assert.equal(first.estado,'aplicado');assert.equal(first.ya_aplicado,false);
    assert.equal(Number(first.saldo),15882540);
    const second=(await db.query('select public.autorizar_ajuste_auditoria_cartera_b2b($1) as r',[id])).rows[0].r;
    assert.equal(second.ya_aplicado,true);
    const rows=(await db.query("select efecto,monto,metadatos from public.movimientos_cartera where referencia_tipo='ajuste_auditoria_b2b'")).rows;
    assert.equal(rows.length,1);assert.equal(rows[0].efecto,'debito');assert.equal(Number(rows[0].monto),8198540);
    assert.equal(rows[0].metadatos.sin_movimiento_bancario,true);
    assert.equal((await db.query("select count(*)::int as n from public.audit_log where accion='ajuste_auditoria_cartera_b2b_autorizado'")).rows[0].n,1);
    const request='522e03de-3dbd-45cd-bd20-a5a0445504e4';
    const args=[request,'CK-13',15882540,16000000,'Nueva auditoría de cartera validada por Gerencia'];
    const generic=await db.query(`select public.ajuste_gerencia_b2b($1,$2,$3,$4,$5) as r`,args);
    assert.equal(generic.rows[0].r.estado,'aplicado');
    assert.equal(Number(generic.rows[0].r.saldo),16000000);
    const retry=await db.query(`select public.ajuste_gerencia_b2b($1,$2,$3,$4,$5) as r`,args);
    assert.equal(retry.rows[0].r.ya_aplicado,true);
    assert.equal((await db.query("select count(*)::int as n from public.movimientos_cartera where referencia_tipo='ajuste_auditoria_b2b'")).rows[0].n,2);
  }finally{await db.close()}
});
