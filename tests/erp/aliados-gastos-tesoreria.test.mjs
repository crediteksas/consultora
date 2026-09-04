import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('un gasto aprobado crea una sola obligación de tesorería y exige autorización', async () => {
  const sql = await read('supabase/migrations/20260904204314_conectar_gastos_aliados_con_tesoreria.sql');
  assert.match(sql, /treasury_movements_aliados_gasto_unique/);
  assert.match(sql, /'aliados-gasto:'\|\|v\.id/);
  assert.match(sql, /El pago del gasto requiere autorización de Oscar/);
  assert.match(sql, /tesoreria_aplicar_saldo\(m\.unit,'debit',m\.amount/);
});

test('Gastos captura destino y Tesorería muestra la obligación separada', async () => {
  const [expensesHtml, expensesJs, treasuryHtml, treasuryJs] = await Promise.all([
    read('creditek/erp/aliados-gastos.html'),
    read('creditek/erp/aliados-v1-1-app.js'),
    read('creditek/erp/aliados-tesoreria.html'),
    read('creditek/erp/aliados-tesoreria-app.js'),
  ]);
  assert.match(expensesHtml, /expenseBeneficiary/);
  assert.match(expensesHtml, /expenseAccount/);
  assert.match(expensesJs, /p_beneficiario/);
  assert.match(expensesJs, /p_cuenta_destino/);
  assert.match(treasuryHtml, /Gastos aprobados por pagar/);
  assert.match(treasuryJs, /aliados_gasto_id/);
  assert.match(treasuryJs, /Autorizar pago/);
});
