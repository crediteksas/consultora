import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync('supabase/migrations/20260831200946_krediya_liquidacion_aislada.sql','utf8');
const app = fs.readFileSync('creditek/erp/aliados-liquidaciones-app.js','utf8');
const html = fs.readFileSync('creditek/erp/aliados-liquidaciones.html','utf8');

test('Krediya usa motor aislado sin modificar la función PayJoy/ALO', () => {
  assert.match(migration, /aliados_calcular_liquidacion_krediya/);
  assert.doesNotMatch(migration, /create or replace function public\.aliados_calcular_liquidacion\(p_id/);
  assert.match(app, /selected\.plataforma === 'krediya' \? 'aliados_calcular_liquidacion_krediya'/);
});

test('diferencias de Precio de venta y Pagamos bloquean y requieren decisión de Mayte', () => {
  assert.match(migration, /krediya_precio_venta_diferente/);
  assert.match(migration, /krediya_pagamos_diferente/);
  assert.match(migration, /aliados_resolver_precio_krediya/);
  assert.match(app, /Decisión de Mayte/);
});

test('solo aliados generan pagos; Retail queda separado para cartera', () => {
  const allyBranch = migration.match(/if o\.tipo_establecimiento='aliado' then[\s\S]*?else total_retail/);
  assert.ok(allyBranch);
  assert.match(allyBranch[0], /insert into public\.payment_orders/);
  assert.match(allyBranch[0], /total_retail/);
});

test('la interfaz mantiene el módulo existente y solo agrega Krediya como opción', () => {
  assert.match(html, /option value="krediya">Krediya/);
  assert.match(html, /Motor de liquidaciones PayJoy, ALO Credit y Krediya/);
});
