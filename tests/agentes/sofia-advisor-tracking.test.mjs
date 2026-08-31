import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ts = await readFile(
  new URL('../../creditek/workers/creditek-bot/index.ts', import.meta.url),
  'utf8',
);
const runtime = await readFile(
  new URL('../../creditek/workers/creditek-bot/index.js', import.meta.url),
  'utf8',
);
const panel = await readFile(
  new URL('../../creditek/agentes/creditek-agente-respuestas.html', import.meta.url),
  'utf8',
);

for (const [name, source] of [['TypeScript', ts], ['runtime', runtime]]) {
  test(`${name}: la respuesta del asesor se enlaza al wamid exacto`, () => {
    assert.match(source, /msg\.context\?\.id/);
    assert.match(source, /meta_response_id=eq\./);
    assert.match(source, /response_key&limit=2/);
    assert.match(source, /advisor_handoff:\(\.\+\)/);
  });

  test(`${name}: el respaldo antiguo solo acepta un pendiente`, () => {
    assert.match(source, /confirmacion_asesor=is\.null[^`]+limit=2&select=telefono/);
    assert.match(source, /pendientes\.length === 1/);
    assert.doesNotMatch(source, /limit=1&select=telefono[^\n]+cliente m[aá]s reciente/i);
  });

  test(`${name}: una asociación ambigua no modifica clientes`, () => {
    assert.match(source, /if \(!cliente\) \{[\s\S]*?requiere revisi/);
    assert.match(source, /actualizarCliente\(cliente\.telefono, \{ confirmacion_asesor: estadoConfirmacion \}/);
  });

  test(`${name}: el seguimiento avanza y no permite regresiones`, () => {
    assert.match(source, /actual === ['"]no_contactado['"][\s\S]*?contactado[\s\S]*?venta_cerrada/);
    assert.match(source, /actual === ['"]contactado['"][\s\S]*?venta_cerrada/);
    assert.match(source, /regresiva ignorada/);
    assert.match(source, /cerrado_sin_venta/);
  });
}

test('AURA muestra responsable, estado, SLA y recordatorio del seguimiento', () => {
  assert.match(panel, /Seguimiento de tienda/);
  assert.match(panel, /Tienda responsable/);
  assert.match(panel, /Asesor responsable/);
  assert.match(panel, /Estado de atención/);
  assert.match(panel, /Control SLA/);
  assert.match(panel, /SLA vencido/);
  assert.match(panel, /recordatorio_asesor_enviado_en/);
  assert.match(panel, /Tienda no confirmó contacto dentro del SLA/);
  assert.match(panel, /Tienda no pudo contactar al cliente/);
});

for (const [name, source] of [['TypeScript', ts], ['runtime', runtime]]) {
  test(`${name}: insiste al asesor cada 24 horas mientras el caso siga abierto`, () => {
    assert.match(source, /24 \* 60 \* 60/);
    assert.match(source, /confirmacion_asesor\.eq\.contactado/);
    assert.match(source, /confirmacion_asesor\.eq\.no_contactado/);
    assert.match(source, /recordatorio_asesor_enviado_en\.lte/);
    assert.doesNotMatch(source, /confirmacion_asesor\.eq\.venta_cerrada[^\n]+recordatorio_asesor_enviado_en/);
  });
}

test('el recontacto automático al cliente permanece limitado a una sola vez', () => {
  assert.match(ts, /Máximo 1 recordatorio automático por lead/);
  assert.match(runtime, /recordatorio_enviado_at/);
});

test('AURA permite cerrar el caso sin venta y detener la insistencia al asesor', () => {
  assert.match(panel, /Cerrar sin venta/);
  assert.match(panel, /Cerrado sin venta/);
  assert.match(ts, /cerrado_sin_venta/);
  assert.doesNotMatch(ts, /confirmacion_asesor\.eq\.cerrado_sin_venta[^\n]+recordatorio_asesor_enviado_en/);
});
