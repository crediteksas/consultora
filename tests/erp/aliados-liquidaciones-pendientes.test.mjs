import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const html = await readFile('creditek/erp/aliados-liquidaciones.html', 'utf8');
const app = await readFile('creditek/erp/aliados-liquidaciones-app.js', 'utf8');

test('la bandeja principal muestra solo estados que requieren acción', () => {
  assert.match(app, /PENDING_STATES = \['importada', 'validada', 'con_novedades', 'calculada', 'revisada'\]/);
  assert.match(app, /!isHistoricalBatch\(batch\) && PENDING_STATES\.includes\(batch\.estado\)/);
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

test('Novedades identifica la tienda y el IMEI que requieren revisión', () => {
  assert.match(app, /liquidation_operations\(establishment_name,imei,referencia,modelo,origen_codigo\)/);
  assert.match(app, /class="incident-card"/);
  assert.match(app, /liquidation_operations\?\.establishment_name/);
  assert.match(app, /liquidation_operations\?\.imei/);
});

test('pendientes e historial no mezclan estados finales; filtros de búsqueda y fecha se conservan', () => {
  const from=app.indexOf('  const PENDING_STATES'),to=app.indexOf('  function updateStateFilter()',from);
  assert.ok(from>=0&&to>from);
  const nodes={filterState:{value:''},filterSearch:{value:''},historyFrom:{value:''},historyUntil:{value:''}};
  const batches=['importada','validada','con_novedades','calculada','revisada','aprobada','programada','pagada','conciliada','cerrada','anulada','desconocida'].map(estado=>({id:estado,estado,plataforma:'alo',fecha_corte:'2026-10-08',liquidation_operations:[{establishment_name:'Comercio',imei:'12345'}]}));
  batches.push({...batches[0],id:'confirmed',approved_at:'2026-10-08T15:00:00Z'});
  const context={batches,listMode:'pending',$:id=>nodes[id],Summary:{periodos:()=>({})},UX:{traducirEstado:v=>v}};
  vm.runInNewContext(app.slice(from,to),context);
  assert.deepEqual(Array.from(context.batchesForExport(),b=>b.id),['importada','validada','con_novedades','calculada','revisada']);
  nodes.filterState.value='revisada';assert.deepEqual(Array.from(context.batchesForExport(),b=>b.id),['revisada']);
  nodes.filterState.value='';nodes.filterSearch.value='no existe';assert.equal(context.batchesForExport().length,0);
  nodes.filterSearch.value='12345';assert.equal(context.batchesForExport().length,5);
  context.listMode='history';assert.deepEqual(Array.from(context.batchesForExport(),b=>b.id),['aprobada','programada','pagada','conciliada','cerrada','anulada','confirmed']);
  nodes.historyFrom.value='2026-10-09';assert.equal(context.batchesForExport().length,0);
});
