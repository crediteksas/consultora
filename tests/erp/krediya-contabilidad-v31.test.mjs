import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath = new URL('../../supabase/migrations/20260903023434_reconciliar_krediya_contabilidad_v31.sql', import.meta.url);

test('Krediya se reconstruye desde 22 créditos y bloquea acumulados descuadrados', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.match(sql, /v\.creditos<>22/);
  assert.match(sql, /v\.recibido<>14516977\.00/);
  assert.match(sql, /v\.pago_aliados<>10028667\.00/);
  assert.match(sql, /v\.utilidad_bruta<>3770242\.09/);
  assert.match(sql, /v\.utilidad_final<>2714574\.29/);
  assert.match(sql, /raise exception 'Conciliación Krediya inválida/);
});

test('la fórmula contable evita descontar dos veces el gasto operativo', async () => {
  const [sql, app] = await Promise.all([
    readFile(migrationPath, 'utf8'),
    readFile(new URL('../../creditek/erp/aliados-v1-1-app.js', import.meta.url), 'utf8'),
  ]);
  assert.match(sql, /gasto_operativo_referencia_historico=20000/);
  assert.match(sql, /utilidad_final=\(utilidad_archivo-valor_financiado\*0\.004\)\*0\.72/);
  assert.match(app, /incluida en esa provisión, sin duplicar el descuento/);
  assert.match(app, /Resultado histórico final/);
});
