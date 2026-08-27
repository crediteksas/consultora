import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../creditek/workers/creditek-clientes/src/index.ts', import.meta.url), 'utf8');

test('los tres informes usan plantillas aprobadas y no texto libre', () => {
  for (const name of ['reporte_gastos_diario', 'reporte_ventas_diario', 'reporte_caja_diario']) {
    assert.match(source, new RegExp(name));
  }
  assert.match(source, /type: 'template'/);
  assert.match(source, /components: \[\{/);
  assert.doesNotMatch(source, /type: 'text',\s*text: \{ body: mensaje/);
});

test('un rechazo de Meta interrumpe el cierre y queda registrado como error', () => {
  assert.match(source, /if \(!r\.ok\)[\s\S]*throw new Error\(`meta_template_rejected:/);
  assert.match(source, /REPORT_TEMPLATES\.gastos/);
  assert.match(source, /REPORT_TEMPLATES\.ventas/);
  assert.match(source, /REPORT_TEMPLATES\.caja/);
});
