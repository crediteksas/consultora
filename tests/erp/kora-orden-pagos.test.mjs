import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const UX = require('../../creditek/erp/aliados-liquidaciones-ux.js');
const migration = 'supabase/migrations/20260902160256_aliados_ordenes_pago_informe.sql';

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
  assert.match(app, /p\.estado==='programado'/);
  assert.match(app, /payment_kind:p\.payment_kind/);
});
