import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const require = createRequire(import.meta.url);
const UX = require('../../creditek/erp/aliados-liquidaciones-ux.js');
const Treasury = require('../../creditek/erp/aliados-tesoreria-domain.js');
const migration = 'supabase/migrations/20260902160256_aliados_ordenes_pago_informe.sql';
const businessMigration = 'supabase/migrations/20260911023737_pagos_negocio_snapshot_informacion_exogena.sql';

test('una fecha de pago nula nunca se convierte en 1969', () => {
  assert.equal(UX.fechaCorta(null), '—');
  assert.equal(UX.fechaCorta(undefined), '—');
  assert.equal(UX.fechaCorta(''), '—');
});

test('la programación usa fecha de Colombia y separa aprobación, soporte y conciliación', async () => {
  const sql = await readFile(migration, 'utf8');
  assert.match(sql, /America\/Bogota/);
  assert.match(sql, /p_estado='programado'[\s\S]{0,180}tiene_capacidad_aliados\('aprobador'\)/);
  assert.match(sql, /p_estado='pagado'[\s\S]{0,260}No se puede marcar Pagado sin soporte/);
  assert.match(sql, /p_estado='conciliado'[\s\S]{0,180}tiene_capacidad_aliados\('aprobador'\)/);
  assert.match(sql, /payment_items_refresh_treasury_order/);
  assert.match(sql, /bank_snapshot=coalesce/);
});

test('Tesorería produce una orden imprimible con la cuenta completa y el total', async () => {
  const [html, app] = await Promise.all([
    readFile('creditek/erp/aliados-tesoreria.html', 'utf8'),
    readFile('creditek/erp/aliados-tesoreria-app.js', 'utf8'),
  ]);
  assert.match(html, /Generar orden de pagos/);
  for (const field of ['Beneficiario','Identificación','Banco','Número de cuenta','TOTAL A GIRAR']) assert.match(app, new RegExp(field));
  assert.match(app, /window\.print/);
  assert.match(app, /p\.estado\s*===\s*["']programado["']/);
  assert.match(app, /payment_kind\s*:\s*p\.payment_kind/);
  assert.match(app, /shared\/branding\/creditek-logo\.png/);
  assert.match(app, /Trazabilidad KORA/);
  assert.match(app, /PO-\$\{shortId\(p\.id\)\}/);
  assert.match(app, /LQ-\$\{shortId\(p\.liquidation_id\)\}/);
  assert.match(app, /SUPORTE|soporte/i);
  assert.match(app, /Negocio \/ titular/);
  assert.match(app, /Titular:/);
  assert.match(html, /Histórico de giros por persona/);
  assert.match(html, /Fecha desde/);
  assert.match(html, /Fecha hasta/);
  assert.match(html, /Descargar informe/);
});

test('el informe de giros se obtiene por cualquier rango y consolida por persona', () => {
  const base = {
    estado:'pagado', fecha_pagada:'2026-09-10T18:00:00Z',
    beneficiary_name:'Argemiro Romero', beneficiary_identification:'12345678',
    bank_snapshot:{holder:'Argemiro Romero',holder_identification:'12345678',bank:'Bancolombia',account_type:'ahorros',account_number:'1234567890'},
    business_snapshot:{code:'DM-GRANJA',name:'DIGI MOVIL GRANJA',city:'Montería'},
    platform_snapshot:'krediya',cutoff_snapshot:'2026-09-09',concept:'Pago aliados',
    liquidation_id:'liquidacion-1',soporte_path:'aliados/pagos/soporte.pdf',
  };
  const rows = Treasury.paymentHistoryRows([
    {...base,id:'pago-1',valor:500000},
    {...base,id:'pago-2',valor:250000,fecha_pagada:'2026-09-20T18:00:00Z'},
    {...base,id:'pago-fuera',valor:900000,fecha_pagada:'2026-08-31T18:00:00Z'},
  ],{from:'2026-09-01',to:'2026-09-30'});
  assert.equal(rows.length,2);
  assert.equal(rows[0].business,'DIGI MOVIL GRANJA');
  assert.deepEqual(Treasury.paymentHistorySummary(rows).map(x=>({holder:x.holder,amount:x.amount,payments:x.payments})),[
    {holder:'Argemiro Romero',amount:750000,payments:2},
  ]);
  const csv=Treasury.paymentHistoryCsv(rows);
  for(const value of ['Negocio relacionado','Titular o razón social','DIGI MOVIL GRANJA','Argemiro Romero','12345678','500000']) assert.match(csv,new RegExp(value));
  assert.equal(Treasury.paymentHistoryRows([base],{from:'2026-10-01',to:'2026-09-01'}).length,0);
});

test('el negocio queda congelado en cada orden al autorizarse y no se puede reescribir', async () => {
  const sql = await readFile(businessMigration,'utf8');
  const db = await PGlite.create();
  try {
    await db.exec(`create role anon; create role authenticated;
      create table public.origenes(codigo text primary key,nombre text,ciudad text);
      create table public.liquidation_beneficiaries(id uuid primary key,nombre text,tipo text,origen_codigo text);
      create table public.payment_orders(id uuid primary key,beneficiary_id uuid,estado text,fecha_pagada timestamptz);
      insert into public.origenes values('DM-GRANJA','DIGI MOVIL GRANJA','Montería');
      insert into public.liquidation_beneficiaries values('00000000-0000-4000-8000-000000000001','Argemiro Romero','aliado','DM-GRANJA');
      insert into public.payment_orders values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','pendiente',null);`);
    await db.exec(sql);
    assert.equal((await db.query(`select business_snapshot->>'name' name from payment_orders`)).rows[0].name,'DIGI MOVIL GRANJA');
    await db.exec(`update origenes set nombre='DIGI MOVIL GRANJA ACTUALIZADO'; update payment_orders set estado='programado';`);
    assert.equal((await db.query(`select business_snapshot->>'name' name from payment_orders`)).rows[0].name,'DIGI MOVIL GRANJA ACTUALIZADO');
    await assert.rejects(db.query(`update payment_orders set business_snapshot='{"name":"OTRO"}'::jsonb`),/no se puede editar/);
  } finally {
    await db.close();
  }
});
