import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile('creditek/erp/aliados-liquidaciones.html', 'utf8');
const app = await readFile('creditek/erp/aliados-liquidaciones-app.js', 'utf8');

test('la bandeja principal muestra solo estados que requieren acción', () => {
  assert.match(app, /PENDING_STATES = \['importada', 'validada', 'con_novedades', 'calculada', 'revisada'\]/);
  assert.match(app, /batches\.filter\(\(b\) => statesForMode\(\)\.includes\(b\.estado\)\)/);
  assert.match(app, /No hay liquidaciones pendientes/);
});

test('los estados terminados se consultan desde un historial separado', () => {
  assert.match(app, /HISTORY_STATES = \['aprobada', 'programada', 'pagada', 'conciliada', 'cerrada', 'anulada'\]/);
  assert.match(html, /id="showHistory">Consultar historial \(0\)</);
  assert.match(app, /showHistory.*Consultar historial/);
});

test('la pantalla permite actualizar y muestra la hora de la última consulta', () => {
  assert.match(html, /id="refreshBatches">Actualizar</);
  assert.match(html, /id="lastUpdated">Consultando información/);
  assert.match(app, /refreshBatches'\)\.onclick = loadBatches/);
  assert.match(app, /lastUpdated'\)\.textContent = `Actualizado/);
});

test('una aprobación bloqueada muestra la causa y abre Novedades', () => {
  assert.match(html, /id="workflowError" role="alert"/);
  assert.match(app, /No se puede aprobar: existen novedades bloqueantes/);
  assert.match(app, /if \(approvalBlocked\) await loadTab\('incidents'\)/);
});
