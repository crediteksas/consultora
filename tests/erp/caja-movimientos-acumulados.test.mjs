import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const caja = await readFile(path.join(root, 'creditek/erp/caja.html'), 'utf8');

test('Caja muestra movimientos explícitos y saldo acumulado sin duplicar el cálculo financiero', () => {
  assert.match(caja, /Movimientos y saldo acumulado/);
  assert.match(caja, /from\('movimientos_caja_tienda'\)/);
  assert.match(caja, /Saldo inicial/);
  assert.match(caja, /Saldo actual esperado/);
  assert.match(caja, /const tiposSalida = new Set/);
  assert.match(caja, /saldo \+= salida \? -Number\(m\.monto\) : Number\(m\.monto\)/);
});

test('la vista permite filtrar por tipo, usuario o concepto', () => {
  assert.match(caja, /id="filtroMovimientosCaja"/);
  assert.match(caja, /m\.tipo.*m\.observacion.*m\.creado_por/s);
  assert.match(caja, /addEventListener\('input'/);
});
