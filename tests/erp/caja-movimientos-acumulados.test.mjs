import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const caja = await readFile(path.join(root, 'creditek/erp/caja.html'), 'utf8');

test('Caja muestra el libro completo y verifica el saldo contra el cálculo oficial', () => {
  assert.match(caja, /Movimientos y saldo acumulado/);
  assert.match(caja, /from\('movimientos_caja_tienda'\)/);
  assert.match(caja, /Saldo inicial/);
  assert.match(caja, /Saldo actual esperado/);
  assert.match(caja, /CreditekCajaLibro\.construir/);
  assert.match(caja, /c\.libroCaja\.cuadra/);
  assert.match(caja, /CreditekCajaLibroUI\.todas/);
});

test('la vista permite filtrar por tipo, usuario o concepto', () => {
  assert.match(caja, /id="filtroMovimientosCaja"/);
  assert.match(caja, /m\.tipo.*m\.concepto.*m\.usuario/s);
  assert.match(caja, /c\.libroCaja\.filas\.filter/);
  assert.match(caja, /addEventListener\('input'/);
});
