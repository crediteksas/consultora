import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');

test('Traslados usa el campo productivo despachado_at en carga, filtro y fecha visible', async () => {
  const html = await readFile(path.join(root, 'creditek/erp/traslados.html'), 'utf8');

  assert.match(html, /\.order\('despachado_at',\s*\{\s*ascending:\s*false\s*\}\)/);
  assert.match(html, /t\.despachado_at\.slice\(0,\s*10\)/);
  assert.match(html, /new Date\(t\.despachado_at\)\.toLocaleDateString\('es-CO'\)/);
  assert.doesNotMatch(html, /traslados[\s\S]{0,800}\.order\('created_at'/);
});

test('un fallo de carga no expone especificaciones técnicas de la base de datos', async () => {
  const html = await readFile(path.join(root, 'creditek/erp/traslados.html'), 'utf8');

  assert.match(html, /No fue posible cargar los traslados\. Intenta nuevamente\./);
  assert.doesNotMatch(html, /Error cargando traslados:\s*['"]?\s*\+\s*error\.message/);
});
