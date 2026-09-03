import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('../../creditek/erp/aliados-v1-1-app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../../creditek/erp/aliados-plataformas.html', import.meta.url), 'utf8');

test('Plataformas abre en el mes vigente y permite filtrar periodo y negocio', () => {
  assert.match(app, /platformFrom/);
  assert.match(app, /platformTo/);
  assert.match(app, /platformBusiness/);
  assert.match(app, /Mes vigente/);
  assert.match(app, /Todo el histórico/);
  assert.match(app, /Periodo de liquidación visible/);
  assert.match(app, /operationReportingDay/);
  assert.match(app, /Operaciones liquidadas/);
});

test('Plataformas explica y separa la base cerrada de la operación nueva', () => {
  assert.match(app, /Créditos cerrados/);
  assert.match(app, /Resultado generado \(ya retirado\)/);
  assert.match(app, /Saldo histórico disponible/);
  assert.match(app, /Operaciones nuevas/);
  assert.match(html, /Comparativo por plataforma, periodo y tipo de negocio/);
  assert.match(html, /aliados-v1-1-app\.js\?v=1\.1\.13/);
});
