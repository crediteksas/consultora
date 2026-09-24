import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL('../../supabase/migrations/20260924043449_addi_autorizacion_pago_antes_compensacion.sql', import.meta.url), 'utf8');
const oscar = '00000000-0000-4000-8000-000000000002';
const maite = '00000000-0000-4000-8000-000000000001';
const addiId = '00000000-0000-4000-8000-000000000163';
const saleId = '00000000-0000-4000-8000-000000000999';

test('Addi exige autorización individual antes de preparar o aplicar la compensación', async () => {
  const db = await PGlite.create();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema cobros_private;
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.perfiles(id uuid primary key,nombre text);
      create table public.origenes(codigo text primary key,nombre text,tipo text,activo boolean);
      create table public.ventas(id uuid primary key,anulada boolean);
      create table public.cobros_expected(id uuid primary key,estado text,importe numeric);
      create table public.cobros_deposits(id uuid primary key,estado text);
      create table public.cobros_allocations(expected_id uuid,deposit_id uuid,estado text,importe numeric);
      create table public.addi_liquidaciones(id uuid primary key,venta_id uuid,consecutivo integer,
        tienda_codigo text,estado text,pago_tienda numeric,neto_estimado numeric,
        credito_bruto numeric,tarifa_addi numeric,iva_tarifa numeric,utilidad_creditek numeric,
        fecha_venta date,fecha_esperada date,cobro_expected_id uuid,updated_at timestamptz);
      create table public.retail_b2b_compensations(id uuid primary key default gen_random_uuid(),
        addi_liquidacion_id uuid,compensation_value numeric,applied_at timestamptz,reversed_at timestamptz);
      create table public.audit_log(usuario uuid,accion text,tabla text,registro_id uuid,detalle jsonb);
      create function public.es_autorizador_pagos() returns boolean language sql stable as
        $$select auth.uid()='${oscar}'::uuid$$;
      create function cobros_private.autorizado(boolean) returns boolean language sql stable as
        $$select auth.uid() is not null$$;
      create function cobros_private.addi_preparar_compensacion(p_id uuid) returns uuid
        language plpgsql as $$declare v_id uuid; begin
          insert into public.retail_b2b_compensations(addi_liquidacion_id,compensation_value)
          select id,pago_tienda from public.addi_liquidaciones where id=p_id returning id into v_id;
          return v_id;
        end$$;
      insert into public.perfiles values ('${oscar}','Oscar'),('${maite}','Maite');
      insert into public.origenes values ('MOVIL','Móvil Shopping','propia',true);
      insert into public.ventas values ('${saleId}',false);
      insert into public.cobros_expected values ('00000000-0000-4000-8000-000000000888','activo',500912);
      insert into public.addi_liquidaciones(id,venta_id,consecutivo,tienda_codigo,estado,pago_tienda,neto_estimado,cobro_expected_id)
        values ('${addiId}','${saleId}',163,'MOVIL','aprobada',418000,500912,'00000000-0000-4000-8000-000000000888');
    `);
    await db.exec(migration);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [maite]);
    await assert.rejects(() => db.query('select public.addi_pago_autorizar($1)', [addiId]), /Solo Oscar/);
    await assert.rejects(() => db.query('insert into public.retail_b2b_compensations(addi_liquidacion_id,compensation_value) values($1,418000)', [addiId]), /autorización individual/);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [oscar]);
    await assert.rejects(() => db.query('select public.addi_pago_autorizar($1)', [addiId]), /Primero concilia/);
    await db.exec("insert into public.cobros_deposits values ('00000000-0000-4000-8000-000000000777','activo'); insert into public.cobros_allocations values ('00000000-0000-4000-8000-000000000888','00000000-0000-4000-8000-000000000777','activo',500912);");
    await db.query('select public.addi_pago_autorizar($1)', [addiId]);
    const result = await db.query('select a.pago_autorizado_valor,c.compensation_value,c.applied_at from public.addi_liquidaciones a join public.retail_b2b_compensations c on c.addi_liquidacion_id=a.id');
    assert.equal(Number(result.rows[0].pago_autorizado_valor), 418000);
    assert.equal(Number(result.rows[0].compensation_value), 418000);
    assert.equal(result.rows[0].applied_at, null, 'autorizar no aplica a la cartera');
    await assert.rejects(() => db.query('select public.addi_pago_autorizar($1)', [addiId]), /ya fue autorizado/);
    await assert.rejects(() => db.query('update public.addi_liquidaciones set pago_tienda=1 where id=$1', [addiId]), /inmutable/);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [maite]);
    await db.query('update public.retail_b2b_compensations set applied_at=now() where addi_liquidacion_id=$1', [addiId]);
    assert.equal((await db.query('select count(*)::integer as n from public.retail_b2b_compensations where applied_at is not null')).rows[0].n, 1);
    assert.equal((await db.query("select count(*)::integer as n from public.audit_log where accion='addi_pago_tienda_autorizado'")).rows[0].n, 1);
  } finally { await db.close(); }
});
