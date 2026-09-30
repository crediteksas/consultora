import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync('supabase/migrations/20260930213145_payment_destination_review.sql', 'utf8');
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
      status text, approved_by uuid, paid_by uuid, paid_at timestamptz, support_path text,
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
  await db.query('insert into perfiles values ($1,true,$2),($3,true,$4)', [maite, 'auditoria', oscar, 'gerencia']);
  await db.query(`insert into financial_entries(id,beneficiary,amount,status,approved_by,destination_account)
    values ($1,'MAYTHE',400000,'aprobado',$2,'69228312835')`, [entry, oscar]);
  return db;
}

test('destino: Maite propone y Óscar confirma sin alterar el valor ni pagar', async () => {
  const db = await fixture();
  try {
    await db.query(`set request.jwt.claim.sub = '${maite}'`);
    const proposed = await db.query(`select public.payment_destination_prepare(
      $1,$2,$3,$4,$5,$6) as result`, ['financial_entry', entry, '22624685', 'Bancolombia', 'Ahorros', '69228312835']);
    const correctionId = proposed.rows[0].result.id;
    const before = await db.query('select amount,status,destination_account from financial_entries where id=$1', [entry]);
    assert.equal(before.rows[0].amount, '400000');
    assert.equal(before.rows[0].destination_account, '69228312835');
    await db.query(`set request.jwt.claim.sub = '${oscar}'`);
    const result = await db.query('select public.payment_destination_decide($1,true,null) as result', [correctionId]);
    assert.equal(result.rows[0].result.status, 'confirmado');
    const after = await db.query('select amount,status,beneficiary_document,destination_account from financial_entries where id=$1', [entry]);
    assert.equal(after.rows[0].amount, '400000');
    assert.equal(after.rows[0].status, 'aprobado');
    assert.equal(after.rows[0].beneficiary_document, '22624685');
    assert.equal(after.rows[0].destination_account, 'Bancolombia · Ahorros · 69228312835');
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
