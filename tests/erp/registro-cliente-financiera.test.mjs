import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const html = await readFile(path.join(root, 'creditek/erp/registro-interno.html'), 'utf8');
const migration = (await readFile(
  path.join(root, 'creditek/erp/migrations/20260902_kora_normalizar_financiera_solicitudes.sql'),
  'utf8',
)).replace(/\s+/g, ' ').toLowerCase();

test('el formulario envía los códigos canónicos de las cuatro financieras', () => {
  for (const value of ['payjoy', 'alocredit', 'addi', 'krediya']) {
    assert.match(html, new RegExp(`<option value=["']${value}["']>`));
  }
});

test('la base normaliza nombres de financieras antes de validar la solicitud', () => {
  assert.match(migration, /before insert or update of financiera/);
  assert.match(migration, /new\.financiera := case v_financiera/);
  for (const value of ['payjoy', 'alocredit', 'addi', 'krediya']) {
    assert.match(migration, new RegExp(`when '${value}' then '${value}'`));
  }
  assert.match(migration, /financiera_cliente_invalida/);
});

test('la pantalla explica errores de plataforma y datos obligatorios', () => {
  assert.match(html, /solicitudes_financiera_check/);
  assert.match(html, /financiera_cliente_invalida/);
  assert.match(html, /datos_cliente_invalidos/);
  assert.match(html, /data\?\.error \|\| data\?\.codigo/);
});
