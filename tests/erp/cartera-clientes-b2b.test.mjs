import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../../creditek/erp/cartera-b2b.html', import.meta.url), 'utf8');
const access = readFileSync(new URL('../../creditek/erp/kora-access-control.js', import.meta.url), 'utf8');
const sidebar = readFileSync(new URL('../../creditek/erp/sidebar.js', import.meta.url), 'utf8');
const sql = readFileSync(new URL('../../supabase/migrations/20260903231515_separar_clientes_cartera_b2b.sql', import.meta.url), 'utf8');

test('Oscar, Luis y Meico se reclasifican como clientes B2B sin alterar saldos', () => {
  assert.match(sql, /update public\.origenes set tipo='cliente_b2b'/i);
  assert.match(sql, /codigo in \('CK-12','CK-13','CK-14'\)/);
  assert.doesNotMatch(sql, /insert into public\.movimientos_cartera[\s\S]*CK-12/);
});

test('cada cliente B2B tiene un libro separado de Retail', () => {
  assert.match(sql, /tipo_cuenta='cliente_b2b'/);
  assert.match(sql, /v_cartera_clientes_b2b/);
  assert.match(sql, /security_invoker=true/);
});

test('solo Gestión y Gerencia registran cargos o abonos con soporte', () => {
  assert.match(sql, /rol not in \('gerencia','auditoria'\)/);
  assert.match(sql, /Concepto y soporte son obligatorios/);
  assert.match(sql, /p_efecto not in \('debito','credito'\)/);
  assert.match(page, /accept="image\/\*,application\/pdf"/);
});

test('la pantalla ofrece mes vigente, detalle, trazabilidad y exportación', () => {
  assert.match(page, /h\.slice\(0,7\)\+'-01'/);
  assert.match(page, /Fecha efectiva/);
  assert.match(page, /Responsable/);
  assert.match(page, /esc\(m\.id\)/);
  assert.match(page, />Excel</);
  assert.match(page, />PDF</);
});

test('la navegación B2B enlaza el libro correcto', () => {
  assert.match(access, /Cartera clientes B2B[^\n]+cartera-b2b\.html/);
  assert.match(sidebar, /Cartera clientes B2B[^\n]+cartera-b2b\.html/);
});
