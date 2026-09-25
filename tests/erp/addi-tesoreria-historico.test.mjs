import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const app = await readFile(new URL('../../creditek/erp/aliados-tesoreria-app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../../creditek/erp/aliados-tesoreria.html', import.meta.url), 'utf8');

test('Tesorería no vuelve a ofrecer autorización de Addi ya autorizados o compensados', () => {
  const expression = app.match(/const addiPending = (.*);\n\s*\$\("#addiAuthorizationCount"\)/)?.[1];
  assert.ok(expression, 'la cola Addi debe tener un filtro explícito');
  const rows = [
    { consecutivo: 37, tipo_tienda: 'propia', pago_autorizado_at: '2026-09-23', compensacion_aplicada: '2026-09-24' },
    { consecutivo: 163, tipo_tienda: 'propia', pago_autorizado_at: '2026-09-23', compensacion_aplicada: '2026-09-24' },
    { consecutivo: 212, tipo_tienda: 'propia', pago_autorizado_at: '2026-09-23', compensacion_aplicada: '2026-09-24' },
    { consecutivo: 286, tipo_tienda: 'propia', pago_autorizado_at: '2026-09-23', compensacion_aplicada: '2026-09-24' },
    { consecutivo: 437, tipo_tienda: 'propia', pago_autorizado_at: null, compensacion_aplicada: null },
    { consecutivo: 438, tipo_tienda: 'aliada', pago_autorizado_at: null, compensacion_aplicada: null },
  ];
  const pending = vm.runInNewContext(expression, { data: { addiLiquidations: rows } });
  assert.deepEqual(Array.from(pending, row => row.consecutivo), [437]);
});

test('el histórico Addi abre los abonos aplicados con el filtro de plataforma', () => {
  assert.match(html, /id="appliedCompensationsHistory"[\s\S]*?<h2>Histórico de abonos aplicados<\/h2>/);
  assert.match(app, /const addiPending = [^\n]*!x\.pago_autorizado_at/);
  assert.match(app, /data-open-addi-history="1"/);
  assert.match(app, /\$\('#compensationPlatform'\)\.value = 'addi';[\s\S]*?\$\('#appliedCompensationsHistory'\)\.scrollIntoView/);
  assert.match(app, /function compensationView\(\) \{[\s\S]*?x\.applied_at && !x\.reversed_at && \(x\.accepted_at \|\| x\.legacy_applied\)/);
});
