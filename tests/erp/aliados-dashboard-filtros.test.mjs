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
  assert.match(app,/addEventListener\('change',renderDashboard\)/);
  assert.match(app,/sb\.from\('origenes'\)/);
});

test('usa las columnas productivas y muestra datos cargados de ambos modelos', async () => {
  const app = await readFile('creditek/erp/aliados-v1-1-app.js', 'utf8');
  assert.match(app,/o\.tipo_establecimiento/);
  assert.match(app,/o\.pago_neto_beneficiario/);
  assert.match(app,/businessType\(o\)==='propia'/);
  assert.match(app,/businessType\(o\)==='aliado'/);
  assert.match(app,/Operación nueva: \$\{ops\.length\} de \$\{db\.operations\.length\}/);
});
