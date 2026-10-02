import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const sql = async name => readFile(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url), 'utf8');
const gerente = '11111111-1111-4111-8111-111111111111';
const auditor = '22222222-2222-4222-8222-222222222222';

test('anular cobro revierte Banco una sola vez, conserva trazabilidad y no cambia otra plataforma', async t => {
  const db = await PGlite.create();
  const row = async (q, args = []) => (await db.query(q, args)).rows[0];
  const balance = async () => Number((await row('select saldo_actual from banco_creditek_cuentas')).saldo_actual);
  const voidRecord = (tipo, id) => db.query('select public.cobros_anular_registro($1,$2,$3)', [tipo, id, 'Recepción anulada: el dinero no ingresó al banco']);
  const allocation = async id => (await row('select id from cobros_allocations where deposit_id=$1', [id])).id;
  const receive = async (platform, amount) => (await row(`
    select public.cobros_confirmar_corte_banco(
      (select id from liquidations where plataforma=$1),current_date,$2,true,gen_random_uuid()) id`, [platform, amount])).id;
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema kora_private;
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table perfiles(id uuid primary key,nombre text,rol text,activo boolean);
      insert into perfiles values('${gerente}','Gerente de prueba','gerencia',true),
        ('${auditor}','Auditor de prueba','auditoria',true);
      create table liquidations(id uuid primary key default gen_random_uuid(),plataforma text,fecha_corte date,estado text);
      create table liquidation_operations(liquidation_id uuid,monto_credito numeric,reconocida boolean);
      insert into liquidations(plataforma,fecha_corte,estado) values
        ('alo',current_date,'aprobada'),('payjoy',current_date,'aprobada');
      set request.jwt.claim.sub='${gerente}';
    `);
    await db.exec(await sql('20260905044108_cobros_plataformas_independiente'));
    await db.exec('alter table cobros_expected drop constraint cobros_expected_soporte_check');
    await db.exec(await sql('20260922020943_cobros_confirmacion_bancaria_un_paso'));
    await db.exec(`
      create table banco_creditek_cuentas(id uuid primary key default gen_random_uuid(),numero_cuenta text,
        activa boolean,saldo_inicial numeric check(saldo_inicial>=0),saldo_actual numeric check(saldo_actual>=0),fecha_corte date);
      create table banco_creditek_movimientos(id uuid primary key default gen_random_uuid(),
        cuenta_id uuid references banco_creditek_cuentas(id),solicitud_id uuid,tipo text,
        monto numeric check(monto>0),saldo_antes numeric,saldo_despues numeric,fecha date,
        referencia text,soporte_path text,registrado_por uuid references perfiles(id),created_at timestamptz default now(),
        constraint banco_creditek_movimientos_tipo_check check(tipo in ('saldo_inicial','pago_proveedor')),
        constraint banco_creditek_movimientos_check check(saldo_despues=saldo_antes+monto or saldo_despues=saldo_antes-monto));
      create table payment_orders(id uuid,estado text,fecha_pagada timestamptz,authorized_by uuid,
        soporte_path text,historico_inicial boolean,bank_snapshot jsonb,payment_kind text,valor numeric,concept text,paid_by uuid);
      create table treasury_movements(id uuid,type text,direction text,status text,paid_by uuid,
        support_path text,amount numeric,updated_at timestamptz,created_at timestamptz,concept text);
      create table financial_entries(id uuid,status text,business_unit text,paid_at timestamptz,paid_by uuid,
        support_path text,amount numeric,concept text);
      create function public.finanzas_registrar_pago(uuid,text) returns public.financial_entries
        language sql as $$select * from public.financial_entries limit 1$$;
    `);
    await db.exec(await sql('20260930213125_banco_movimientos_reales'));
    await db.exec(await sql('20261002195421_banco_reverso_cobro_anulado'));
    await db.exec(`insert into banco_creditek_cuentas(numero_cuenta,activa,saldo_inicial,saldo_actual,fecha_corte)
      values('87600004006',true,1000,1000,current_date-1)`);
    const alo = await receive('alo', 100);
    const payjoy = await receive('payjoy', 200);
    const aloAllocation = await allocation(alo);
    const payjoyBefore = await row('select to_jsonb(d) deposit,to_jsonb(m) bank from cobros_deposits d join banco_creditek_movimientos m on m.fuente_id=d.id where d.id=$1', [payjoy]);
    const original = await row('select * from banco_creditek_movimientos where fuente_id=$1', [alo]);
    assert.equal(await balance(), 1300);

    await t.test('solo Gerencia, sin permisos nuevos de escritura directa ni ejecución del trigger', async () => {
      await db.exec(`set request.jwt.claim.sub='${auditor}';set role authenticated`);
      await assert.rejects(voidRecord('allocation', aloAllocation), /Solo Gerencia/);
      await assert.rejects(db.query('update cobros_deposits set estado=$1 where id=$2', ['anulado', alo]), /permission denied/);
      await db.exec('reset role');
      assert.equal((await row("select has_function_privilege('authenticated','kora_private.banco_creditek_cobro_trigger()','execute') allowed")).allowed, false);
      await db.exec(`set request.jwt.claim.sub='${gerente}'`);
    });

    await t.test('sin anular aplicaciones no permite anular la recepción', async () => {
      await assert.rejects(voidRecord('deposit', alo), /Primero anula sus aplicaciones/);
      assert.equal(await balance(), 1300);
    });

    await t.test('anulación atómica: conserva ingreso original, revierte Banco y deja esperado pendiente', async () => {
      await db.exec('begin;set local role authenticated');
      await voidRecord('allocation', aloAllocation);
      await voidRecord('deposit', alo);
      await db.exec('commit');
      assert.equal(await balance(), 1200);
      assert.deepEqual(await row('select * from banco_creditek_movimientos where id=$1', [original.id]), original);
      const reversal = await row("select * from banco_creditek_movimientos where tipo='reverso_ingreso_plataforma'");
      assert.equal(reversal.fuente_id, original.id);
      assert.equal(reversal.fuente_tabla, 'banco_creditek_movimientos');
      assert.equal(Number(reversal.monto), 100);
      assert.equal(reversal.registrado_por, gerente);
      assert.equal((await row('select estado from cobros_deposits where id=$1', [alo])).estado, 'anulado');
      const pending = await row(`select e.estado,e.importe-coalesce(sum(a.importe) filter(where a.estado='activo'),0) pendiente
        from cobros_expected e left join cobros_allocations a on a.expected_id=e.id
        where e.plataforma='alo' group by e.id`);
      assert.equal(pending.estado, 'activo');
      assert.equal(Number(pending.pendiente), 100);
      assert.equal((await row("select count(*)::int n from cobros_events where registro_id=$1 and tipo='deposit_reversado_banco'", [alo])).n, 1);
      assert.deepEqual(await row('select to_jsonb(d) deposit,to_jsonb(m) bank from cobros_deposits d join banco_creditek_movimientos m on m.fuente_id=d.id where d.id=$1', [payjoy]), payjoyBefore);
      assert.equal((await row("select count(*)::int n from liquidations where estado='aprobada'")).n, 2);
    });

    await t.test('retirar el neto erróneo devuelve el corte a pendiente de validar sin anular la liquidación', async () => {
      const expected = await row('select confirmation_expected_id from cobros_deposits where id=$1', [alo]);
      await voidRecord('expected', expected.confirmation_expected_id);
      const summary = (await row('select public.cobros_plataformas_resumen() data')).data;
      assert.equal(summary.candidates.filter(c => c.plataforma === 'alo').length, 1);
      assert.equal(summary.candidates.find(c => c.plataforma === 'alo').estado_liquidacion, 'aprobada');
      assert.equal(await balance(), 1200);
    });

    await t.test('reintentar no duplica el descuento ni permite reactivar el mismo depósito', async () => {
      await voidRecord('allocation', aloAllocation);
      await voidRecord('deposit', alo);
      await db.query("update cobros_deposits set estado='anulado' where id=$1", [alo]);
      assert.equal(await balance(), 1200);
      assert.equal((await row("select count(*)::int n from banco_creditek_movimientos where tipo='reverso_ingreso_plataforma'")).n, 1);
      await assert.rejects(db.query("update cobros_deposits set estado='activo' where id=$1", [alo]), /no se reactiva/);
      const replacement = await receive('alo', 100);
      assert.notEqual(replacement, alo);
      assert.equal(await balance(), 1300);
    });

    await t.test('anular recepción anterior al corte no descuenta Banco', async () => {
      const historical = (await row(`insert into cobros_deposits(plataforma,fecha,banco,cuenta_ultimos4,referencia,importe,soporte,idempotency_key,created_by,created_at)
        values('krediya',current_date-3,'Banco','4006','Anterior al corte',40,'Histórico',gen_random_uuid(),$1,now()-interval '3 days') returning id`, [gerente])).id;
      await voidRecord('deposit', historical);
      assert.equal(await balance(), 1300);
    });

    await t.test('saldo insuficiente revierte toda la operación, incluida la aplicación', async () => {
      const pAllocation = await allocation(payjoy);
      await db.exec('begin; update banco_creditek_cuentas set saldo_actual=50');
      await voidRecord('allocation', pAllocation);
      await assert.rejects(voidRecord('deposit', payjoy), /Saldo Banco insuficiente/);
      await db.exec('rollback');
      assert.equal(await balance(), 1300);
      assert.equal((await row('select estado from cobros_allocations where id=$1', [pAllocation])).estado, 'activo');
      assert.deepEqual(await row('select to_jsonb(d) deposit,to_jsonb(m) bank from cobros_deposits d join banco_creditek_movimientos m on m.fuente_id=d.id where d.id=$1', [payjoy]), payjoyBefore);
    });
  } finally {
    await db.close();
  }
});
