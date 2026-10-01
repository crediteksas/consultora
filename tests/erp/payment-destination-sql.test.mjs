import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync('supabase/migrations/20260930213145_payment_destination_review.sql', 'utf8');
const authorizationMigration = readFileSync('supabase/migrations/20260930232337_autorizar_pago_con_destino_preparado.sql', 'utf8');
const unifiedMigration = readFileSync('supabase/migrations/20261001023032_resolver_destinos_preparados_sin_aprobacion_extra.sql', 'utf8');
const maite = 'd1782db6-bacc-4caf-af6f-ce1b8d1c0391';
const oscar = '6de0ad26-64af-4966-8cd9-d468880af627';
const entry = '77777777-7777-4777-8777-777777777777';

async function fixture() {
  const db = await PGlite.create();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create table public.perfiles(id uuid primary key, activo boolean, rol text);
    create table public.audit_log(usuario text, accion text, tabla text, registro_id text, detalle jsonb);
    create table public.financial_entries(
      id uuid primary key, entry_type text default 'gasto', business_unit text default 'b2b',
      beneficiary text, beneficiary_document text, destination_account text, amount numeric,
      status text, approved_by uuid, approved_at timestamptz, paid_by uuid, paid_at timestamptz, support_path text,
      updated_at timestamptz default now()
    );
    create table public.aliados_gastos_operativos(
      id uuid primary key default gen_random_uuid(),fecha date,plataforma text,origen_codigo text,
      concepto text,descripcion text,valor numeric,beneficiario text,cuenta_destino text,
      soporte_path text,registrado_por uuid,estado text default 'pendiente',aprobado_por uuid,
      aprobado_at timestamptz,updated_at timestamptz default now(),treasury_movement_id uuid
    );
    create table public.treasury_movements(
      id uuid primary key default gen_random_uuid(),unit text,direction text,type text,
      beneficiary text,concept text,amount numeric,destination_account text,movement_date date,
      status text,requested_by uuid,authorized_by uuid,paid_by uuid,support_path text,
      idempotency_key text unique,aliados_gasto_id uuid,updated_at timestamptz default now()
    );
    create function public.es_controlador_financiero() returns boolean language sql as $$ select true $$;
    create function public.tiene_capacidad_aliados(text) returns boolean language sql as $$ select true $$;
  `);
  await db.exec(migration);
  await db.exec(authorizationMigration);
  await db.query('insert into perfiles values ($1,true,$2),($3,true,$4)', [maite, 'auditoria', oscar, 'gerencia']);
  await db.query(`insert into financial_entries(id,beneficiary,amount,status,approved_by,approved_at,destination_account)
    values ($1,'MAYTHE',400000,'aprobado',$2,now()-interval '1 day','69228312835')`, [entry, oscar]);
  return db;
}

test('destino: Maite propone y Óscar vuelve a autorizar el pago sin alterar el valor ni girar', async () => {
  const db = await fixture();
  try {
    await db.query(`set request.jwt.claim.sub = '${maite}'`);
    const proposed = await db.query(`select public.payment_destination_prepare(
      $1,$2,$3,$4,$5,$6) as result`, ['financial_entry', entry, '22624685', 'Bancolombia', 'Ahorros', '69228312835']);
    const correctionId = proposed.rows[0].result.id;
    const before = await db.query('select amount,status,destination_account,approved_at from financial_entries where id=$1', [entry]);
    assert.equal(before.rows[0].amount, '400000');
    assert.equal(before.rows[0].destination_account, '69228312835');
    await db.query(`set request.jwt.claim.sub = '${oscar}'`);
    const result = await db.query('select public.payment_destination_decide($1,true,null) as result', [correctionId]);
    assert.equal(result.rows[0].result.status, 'confirmado');
    const after = await db.query('select amount,status,beneficiary_document,destination_account,approved_at,paid_by,paid_at,support_path from financial_entries where id=$1', [entry]);
    assert.equal(after.rows[0].amount, '400000');
    assert.equal(after.rows[0].status, 'aprobado');
    assert.equal(after.rows[0].beneficiary_document, '22624685');
    assert.equal(after.rows[0].destination_account, 'Bancolombia · Ahorros · 69228312835');
    assert.ok(new Date(after.rows[0].approved_at) > new Date(before.rows[0].approved_at));
    assert.equal(after.rows[0].paid_by, null);
    assert.equal(after.rows[0].paid_at, null);
    assert.equal(after.rows[0].support_path, null);
  } finally { await db.close(); }
});

test('destino: el soporte de pago se bloquea hasta completar los datos', async () => {
  const db = await fixture();
  try {
    await assert.rejects(db.query(`update financial_entries set status='pagado' where id=$1`, [entry]),
      /Completa y confirma identificación/);
    const row = await db.query('select status from financial_entries where id=$1', [entry]);
    assert.equal(row.rows[0].status, 'aprobado');
  } finally { await db.close(); }
});

test('destino: gasto de Tesorería usa la propuesta existente sin crear otro movimiento ni pagarlo', async () => {
  const db = await fixture();
  try {
    const gasto = '88888888-8888-4888-8888-888888888888';
    const movimiento = '99999999-9999-4999-8999-999999999999';
    await db.query(`insert into aliados_gastos_operativos(id,beneficiario,valor,cuenta_destino)
      values ($1,'Lujo red sas',20000,'95700008908')`, [gasto]);
    await db.query(`insert into treasury_movements(id,beneficiary,amount,status,authorized_by,destination_account,aliados_gasto_id)
      values ($1,'Lujo red sas',20000,'programado',$2,'95700008908',$3)`, [movimiento, oscar, gasto]);
    await db.query(`set request.jwt.claim.sub = '${maite}'`);
    const proposed = await db.query(`select public.payment_destination_prepare($1,$2,$3,$4,$5,$6) as result`,
      ['treasury_movement', movimiento, '901971110', 'Bancolombia', 'Ahorros', '95700008908']);
    await db.query(`set request.jwt.claim.sub = '${oscar}'`);
    await db.query('select public.payment_destination_decide($1,true,null)', [proposed.rows[0].result.id]);
    const rows = await db.query('select status,amount,beneficiary_document,destination_account,paid_by,support_path from treasury_movements where id=$1', [movimiento]);
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0].status, 'programado');
    assert.equal(rows.rows[0].amount, '20000');
    assert.equal(rows.rows[0].beneficiary_document, '901971110');
    assert.equal(rows.rows[0].destination_account, 'Bancolombia · Ahorros · 95700008908');
    assert.equal(rows.rows[0].paid_by, null);
    assert.equal(rows.rows[0].support_path, null);
    assert.equal((await db.query('select count(*)::int as total from treasury_movements')).rows[0].total, 1);
    assert.equal((await db.query('select cuenta_destino from aliados_gastos_operativos where id=$1', [gasto])).rows[0].cuenta_destino,
      'Bancolombia · Ahorros · 95700008908');
  } finally { await db.close(); }
});

test('destino: ni Maite aprueba su propuesta ni Óscar la prepara', async () => {
  const db = await fixture();
  try {
    await db.query(`set request.jwt.claim.sub = '${oscar}'`);
    await assert.rejects(db.query(`select public.payment_destination_prepare(
      $1,$2,$3,$4,$5,$6)`, ['financial_entry', entry, '22624685', 'Bancolombia', 'Ahorros', '69228312835']),
    /Solo Maite/);
    await db.query(`set request.jwt.claim.sub = '${maite}'`);
    const proposed = await db.query(`select public.payment_destination_prepare(
      $1,$2,$3,$4,$5,$6) as result`, ['financial_entry', entry, '22624685', 'Bancolombia', 'Ahorros', '69228312835']);
    await assert.rejects(db.query('select public.payment_destination_decide($1,true,null)', [proposed.rows[0].result.id]),
      /Solo Oscar/);
  } finally { await db.close(); }
});

test('destino: una corrección pendiente bloquea el pago aunque el destino anterior esté completo', async () => {
  const db = await fixture();
  try {
    await db.query(`update financial_entries set beneficiary_document='22624685',
      destination_account='Bancolombia · Ahorros · 69228312835' where id=$1`, [entry]);
    await db.query(`set request.jwt.claim.sub = '${maite}'`);
    await db.query(`select public.payment_destination_prepare($1,$2,$3,$4,$5,$6)`,
      ['financial_entry', entry, '22624685', 'Bancolombia', 'Corriente', '69228312835']);
    await assert.rejects(db.query(`update financial_entries set status='pagado' where id=$1`, [entry]),
      /propuesta pendiente de confirmación/);
  } finally { await db.close(); }
});

test('gasto de Aliados nuevo conserva identificación y destino hasta Tesorería', async () => {
  const db = await fixture();
  try {
    await db.query(`set request.jwt.claim.sub = '${maite}'`);
    const result = await db.query(`select (public.aliados_registrar_gasto_v2(
      current_date,'payjoy',null,'Bono estrategia',null,20000,'Aliado','900123456',
      'Bancolombia','Ahorros','1234567890',null)).id as id`);
    await db.query(`set request.jwt.claim.sub = '${oscar}'`);
    await db.query('select public.aliados_decidir_gasto($1,$2)', [result.rows[0].id, 'aprobado']);
    const rows = await db.query('select beneficiary_document,destination_account,amount,status from treasury_movements where aliados_gasto_id=$1', [result.rows[0].id]);
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0].beneficiary_document, '900123456');
    assert.equal(rows.rows[0].destination_account, 'Bancolombia · Ahorros · 1234567890');
    assert.equal(rows.rows[0].amount, '20000');
    assert.equal(rows.rows[0].status, 'pendiente');
  } finally { await db.close(); }
});

test('flujo unificado: Maite guarda datos sin otra autorización ni giro', async () => {
  const db = await fixture();
  try {
    const definition = unifiedMigration.match(/create or replace function public\.payment_destination_prepare\([\s\S]*?end \$\$;/i)?.[0];
    assert.ok(definition, 'La migración debe definir el guardado directo');
    await db.exec(definition);
    await db.query(`set request.jwt.claim.sub = '${maite}'`);
    const before = await db.query('select amount,status,approved_by,approved_at from financial_entries where id=$1', [entry]);
    const result = await db.query('select public.payment_destination_prepare($1,$2,$3,$4,$5,$6) as result',
      ['financial_entry', entry, '22624685', 'Bancolombia', 'Ahorros', '69228312835']);
    assert.equal(result.rows[0].result.status, 'guardado');
    const after = await db.query('select amount,status,approved_by,approved_at,beneficiary_document,destination_account,paid_by,paid_at,support_path from financial_entries where id=$1', [entry]);
    assert.deepEqual(after.rows[0].amount, before.rows[0].amount);
    assert.equal(after.rows[0].status, before.rows[0].status);
    assert.equal(after.rows[0].approved_by, before.rows[0].approved_by);
    assert.deepEqual(after.rows[0].approved_at, before.rows[0].approved_at);
    assert.equal(after.rows[0].beneficiary_document, '22624685');
    assert.equal(after.rows[0].destination_account, 'Bancolombia · Ahorros · 69228312835');
    assert.equal(after.rows[0].paid_by, null);
    assert.equal(after.rows[0].paid_at, null);
    assert.equal(after.rows[0].support_path, null);
    await assert.rejects(db.query('select public.payment_destination_prepare($1,$2,$3,$4,$5,$6)',
      ['financial_entry', entry, '22624685', 'Bancolombia', 'Corriente', '69228312835']),
    /destino completo.*no se reemplaza/);
  } finally { await db.close(); }
});

test('flujo unificado: no autoriza destinos por separado y conserva pagos cerrados', () => {
  assert.match(unifiedMigration, /revoke all on function public\.payment_destination_decide/);
  assert.match(unifiedMigration, /po\.estado='programado' and po\.paid_by is null and po\.fecha_pagada is null/);
  assert.match(unifiedMigration, /if processed<>7 then raise exception/);
  assert.match(unifiedMigration, /if fixed<>2 or total_orders<>3 then/);
});
