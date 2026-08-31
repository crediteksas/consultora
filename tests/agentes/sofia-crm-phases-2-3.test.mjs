import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../../creditek/agentes/creditek-agente-respuestas.html', import.meta.url), 'utf8');
const ts = await readFile(new URL('../../creditek/workers/creditek-bot/index.ts', import.meta.url), 'utf8');
const runtime = await readFile(new URL('../../creditek/workers/creditek-bot/index.js', import.meta.url), 'utf8');

for (const [name, source] of [['TypeScript', ts], ['runtime', runtime]]) {
  test(`${name}: el endpoint de seguimiento exige autorización y estados canónicos`, () => {
    const start = source.indexOf('/api/seguimiento-asesor');
    assert.ok(start > 0);
    const route = source.slice(start, start + 5_500);
    assert.match(route, /if \(!autorizado\)/);
    assert.match(route, /contactado/);
    assert.match(route, /no_contactado/);
    assert.match(route, /venta_cerrada/);
    assert.match(route, /estado_funnel[^\n]+transferido_asesor/);
    assert.match(route, /transicionConfirmacionPermitida/);
  });

  test(`${name}: actualizar seguimiento no puede reasignar tienda`, () => {
    const start = source.indexOf('/api/seguimiento-asesor');
    const nextRoute = source.indexOf('/api/reintentar-handoff', start);
    const statsRoute = source.indexOf('/api/stats', start);
    const end = [nextRoute, statsRoute].filter(index => index > start).sort((a, b) => a - b)[0];
    const route = source.slice(start, end);
    assert.match(route, /JSON\.stringify\(\{ confirmacion_asesor: estado \}\)/);
    assert.doesNotMatch(route, /JSON\.stringify\(\{[^}]*tienda_id/);
  });
}

test('fase 2 muestra control operativo y conserva venta cerrada como terminal', () => {
  assert.match(html, /actualizarSeguimientoAsesor/);
  assert.match(html, /No fue posible contactar/);
  assert.match(html, /Cliente contactado/);
  assert.match(html, /Venta cerrada/);
  assert.match(html, /actual==='venta_cerrada'/);
});

test('fase 3 muestra KPIs y conversión real por tienda', () => {
  assert.match(html, /id="kpi-pending"/);
  assert.match(html, /id="kpi-sla"/);
  assert.match(html, /id="kpi-contacted"/);
  assert.match(html, /id="kpi-closed"/);
  assert.match(html, /id="kpi-conversion"/);
  assert.match(html, /cerrados\.length\/transferidos\.length/);
  assert.match(html, /d\.cerradas\/d\.asignados/);
});
