import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Retail abre sus tableros con el acumulado del mes vigente', async () => {
  const [tablero, reportes] = await Promise.all([
    readFile('creditek/erp/tablero.html', 'utf8'),
    readFile('creditek/erp/reportes.html', 'utf8'),
  ]);

  assert.match(tablero, /<option value="mes" selected>Este mes<\/option>/);
  assert.match(reportes, /class="btn-nav active" data-periodo="mes">Este mes<\/button>/);
  assert.match(reportes, /let periodoActual = 'mes';/);
});

test('B2B abre con el acumulado del mes vigente', async () => {
  const [html, app] = await Promise.all([
    readFile('creditek/erp/utilidad-creditek.html', 'utf8'),
    readFile('creditek/erp/utilidad-creditek-app.js', 'utf8'),
  ]);

  assert.match(html, /class="quick active" data-rapido="mes">Este mes<\/button>/);
  assert.match(app, /rangoRapido\('mes'\);/);
});

test('Aliados inicializa fechas del mes vigente en horario de Colombia', async () => {
  const app = await readFile('creditek/erp/aliados-v1-1-app.js', 'utf8');

  assert.match(app, /timeZone:'America\/Bogota'/);
  assert.match(app, /monthStart:`\$\{parts\.year\}-\$\{parts\.month\}-01`/);
  assert.match(app, /function populateDashboardFilters\(\)\{setCurrentMonthDashboardRange\(\);/);
  assert.match(app, /day>=from/);
  assert.match(app, /day<=to/);
});
