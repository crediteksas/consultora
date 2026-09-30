import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const b2b = readFileSync('creditek/erp/utilidad-creditek-app.js', 'utf8');
const b2bPage = readFileSync('creditek/erp/utilidad-creditek.html', 'utf8');
const retail = readFileSync('creditek/erp/reportes.html', 'utf8');
const caja = readFileSync('creditek/erp/caja.html', 'utf8');

test('B2B descuenta gastos una vez en el día de autorización y no los distribuye por referencia', () => {
  const domain = { resumir: rows => ({ utilidad: rows.reduce((n, r) => n + r.facturado - r.costo, 0) }) };
  const ctx = { D: domain, estado: { gastosGenerales: [
    { date: '2026-09-14', value: -800000, source: 'financial_entries', id: 1 },
    { date: '2026-09-14', value: -200000, source: 'financial_entries', id: 2 },
    { date: '2026-10-01', value: -380000, source: 'financial_entries', id: 3 },
  ] } };
  const code = b2b.slice(b2b.indexOf('  function resultadoNeto('), b2b.indexOf('  function sinDistribucion('));
  vm.runInNewContext(`${code}\nthis.resultadoNeto = resultadoNeto;`, ctx);
  const result = ctx.resultadoNeto([{ facturado: 2500000, costo: 1000000 }], '2026-09-01', '2026-09-30');
  assert.deepEqual({ ...result }, { margen: 1500000, gastos: 1000000, neto: 500000 });
  assert.match(b2b, /sinDistribucion\(\) \? 'No disponible' : money\(neto\.neto\)/);
  assert.match(b2bPage, /Utilidad neta B2B/);
  assert.match(b2bPage, /tablero-utilidad\.js/);
});

test('Retail reconoce gastos por registro, sin alterar la fecha de caja del comprobante', () => {
  assert.match(retail, /gte\('created_at', `\$\{desde\}T05:00:00\.000Z`\)/);
  assert.match(retail, /authorizedExpenses\(sb, 'retail', desde, hasta\)/);
  assert.match(caja, /totalUtilidad: utilidadCompleta \? totalUtilidad - totalGastosResultado : null/);
  assert.match(caja, /Utilidad neta de tienda del día/);
  assert.match(caja, /Gastos en efectivo de caja/);
});
