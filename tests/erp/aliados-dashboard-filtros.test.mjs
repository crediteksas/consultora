import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('el dashboard permite filtrar tiendas propias y aliados con catálogos reales', async () => {
  const [html, app] = await Promise.all([
    readFile('creditek/erp/aliados-dashboard.html', 'utf8'),
    readFile('creditek/erp/aliados-v1-1-app.js', 'utf8')
  ]);
  for (const id of ['dashboardFrom','dashboardTo','dashboardBusiness','dashboardPlatform','dashboardExecutive','dashboardEstablishment','dashboardCity','dashboardClear']) assert.match(html,new RegExp(`id="${id}"`));
  assert.match(html,/Propios y aliados/);
  assert.match(app,/function populateDashboardFilters\(\)/);
  assert.match(app,/addEventListener\(["']change["'],\s*renderDashboard\)/);
  assert.match(app,/allRows\(["']origenes["'],\s*["']codigo,nombre,tipo,ciudad,activo,ejecutivo_id["'],\s*["']codigo["']\)/);
});

test('usa las columnas productivas y muestra datos cargados de ambos modelos', async () => {
  const app = await readFile('creditek/erp/aliados-v1-1-app.js', 'utf8');
  assert.match(app,/o\.tipo_establecimiento/);
  assert.match(app,/o\.pago_neto_beneficiario/);
  assert.match(app,/businessType\(o\)\s*===\s*["']propia["']/);
  assert.match(app,/businessType\(o\)\s*===\s*["']aliado["']/);
  assert.match(app,/créditos por fecha de venta/);
  assert.match(app,/anulaciones por fecha de ajuste/);
  assert.match(app,/dashboardOperations\(\)\.filter/);
});
