import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app = fs.readFileSync('creditek/erp/aliados-liquidaciones-app.js', 'utf8');
const contextsSql = fs.readFileSync('supabase/migrations/20260905004723_krediya_contextos_operaciones_lectura.sql', 'utf8');
const recoverySql = fs.readFileSync('supabase/migrations/20260905005401_krediya_recuperar_tarifas_manual.sql', 'utf8');
const start = app.indexOf('  function renderKrediyaOperations(');
const end = app.indexOf('  async function loadIncidents(', start);
assert.ok(start >= 0 && end > start, 'El renderizador Krediya debe existir');
const renderSource = app.slice(start, end);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

function operations(rows, contexts = [], incidents = [], selected = {}) {
  const nodes = new Map([
    ['detailHead', { innerHTML: '<tr><th>Cliente / IMEI</th><th>% aplicado</th></tr>' }],
    ['detailBody', { innerHTML: '' }]
  ]);
  const classes = new Set();
  const buttons = new Map();
  const calls = [];
  const $ = (id) => nodes.get(id);
  const document = {
    querySelector(selector) {
      assert.equal(selector, '#detail > .table-wrap');
      return { classList: { add: (name) => classes.add(name) } };
    },
    querySelectorAll(selector) {
      const attribute = selector.match(/^\[(data-[\w-]+)\]$/)?.[1];
      assert.ok(attribute, `Selector de botones esperado: ${selector}`);
      const datasetKey = attribute.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      return [...$('detailBody').innerHTML.matchAll(new RegExp(`${attribute}="([^"]*)"`, 'g'))].map((match) => {
        const key = `${attribute}:${match[1]}`;
        if (!buttons.has(key)) buttons.set(key, { dataset: { [datasetKey]: match[1] } });
        return buttons.get(key);
      });
    }
  };
  const context = {
    $, document, selected: { id: 'batch', frozen_at: null, ...selected },
    esc: escapeHtml,
    // Null would format as zero, so a missing-value regression remains observable.
    money: (value) => `COP ${Number(value)}`,
    openPriceEditor: (id) => calls.push(['editor', id]),
    loadTab: (...args) => calls.push(['tab', ...args])
  };
  vm.runInNewContext(`${renderSource};this.render = renderKrediyaOperations;`, context);
  context.render(rows, contexts, incidents);
  return { $, classes, calls, html: $('detailBody').innerHTML, buttons: (selector) => document.querySelectorAll(selector) };
}

function metricHtml(html, label) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = html.match(new RegExp(`<dt>${escapedLabel}</dt><dd>([\\s\\S]*?)</dd>`));
  assert.ok(match, `Debe mostrar la métrica «${label}»`);
  return match[1];
}

function batchSummary(batch) {
  const nodes = new Map();
  const $ = (id) => {
    if (!nodes.has(id)) nodes.set(id, { value: '', innerHTML: '' });
    return nodes.get(id);
  };
  const helpers = app.slice(app.indexOf('  const ownStoreUtility ='), app.indexOf('  function statesForMode('));
  const batchRenderer = app.slice(app.indexOf('  function renderBatches('), app.indexOf('  function updateActions('));
  const metricRenderer = app.slice(app.indexOf('  function renderMetrics('), app.indexOf('  async function openDetail('));
  const context = {
    $, batches: [batch], selected: batch, listMode: 'pending', esc: escapeHtml,
    money: (value) => `COP ${Number(value)}`, state: String, platformName: String,
    UX: { fechaAuditoria: String, fechaCorta: String, traducirEstado: String },
    document: { querySelectorAll: () => [] }
  };
  vm.runInNewContext(`${helpers}\n${batchRenderer}\n${metricRenderer}\nrenderBatches();renderMetrics();`, context);
  return { list: $('batches').innerHTML, metrics: $('metrics').innerHTML };
}

const row = {
  id: 'credit-redmi',
  referencia: 'XIAOMI REDMI 15C 256GB 8 RAM',
  modelo: 'Redmi 15C',
  imei: '861234567890123',
  cliente_nombre: 'Cliente de prueba',
  establishment_name: 'Comercio de prueba',
  tipo_establecimiento: 'aliado',
  operation_at: '2026-08-28T14:30:00Z',
  reconocida: true,
  inicial: 70150,
  monto_credito: 631350,
  valor_comercial: 0,
  pagamos: 0,
  pago_neto_beneficiario: 0,
  pago_neto_tienda: 0,
  bonos_aplicados: 0,
  utilidad_creditek: 0,
  liquidation_calculations: []
};
const tariff = {
  operation_id: row.id,
  fecha: '2026-08-28',
  pvp_guardado: 646400,
  pvp_recibido: 701500,
  pagamos_guardado: 484800,
  diferencia_pvp: 55100,
  bonos: 20000
};
const priceIssue = { operation_id: row.id, tipo: 'krediya_precio_venta_diferente' };

test('cada operación identifica referencia completa e IMEI sin cabeceras de la tabla anterior', () => {
  const result = operations([row], [tariff]);
  assert.match(result.html, /<h3>XIAOMI REDMI 15C 256GB 8 RAM<\/h3>/);
  assert.match(result.html, /IMEI: 861234567890123/);
  assert.match(result.html, /Cliente: Cliente de prueba/);
  assert.match(result.html, /Comercio de prueba · Aliado/);
  assert.equal(result.$('detailHead').innerHTML, '');
  assert.doesNotMatch(result.html, /<th\b|Cliente \/ IMEI|% aplicado|Estado \/ novedad/);
  assert.ok(result.classes.has('operations-cards'));
});

test('sin cálculo ignora ceros provisionales y muestra tarifa 646400, Pagamos 484800, giro 414650 y bonos 20000', () => {
  const { html } = operations([row], [tariff], [priceIssue]);
  assert.match(metricHtml(html, 'PVP guardado'), /COP 646400/);
  assert.match(metricHtml(html, 'PVP recibido de Krediya'), /COP 701500/);
  assert.match(metricHtml(html, 'Pagamos antes de inicial'), /COP 484800/);
  assert.match(metricHtml(html, 'Inicial'), /COP 70150/);
  assert.match(metricHtml(html, 'Pagamos − inicial · estimado'), /COP 414650/);
  assert.match(html, /Bonos configurados: <strong[^>]*>COP 20000<\/strong>/);
  assert.match(html, /Utilidad: <span[^>]*>Pendiente de calcular<\/span>/);
  assert.match(html, />Sin calcular<\/span>/);
  assert.match(html, /Pagamos sí está registrado/);
  assert.match(html, /El giro es estimado; no es un pago autorizado/);
  assert.doesNotMatch(html, /COP 0(?:<|\b)/);
});

test('tarifa ausente queda pendiente y no se convierte en Pagamos cero', () => {
  const { html } = operations([row], [{ ...tariff, pvp_guardado: null, pagamos_guardado: null }], [
    { operation_id: row.id, tipo: 'krediya_regla_precio_ausente' }
  ]);
  for (const label of ['PVP guardado', 'Pagamos antes de inicial']) {
    assert.match(metricHtml(html, label), /Sin tarifa vinculada/);
    assert.doesNotMatch(metricHtml(html, label), /COP 0/);
  }
  assert.match(metricHtml(html, 'Pagamos − inicial · estimado'), /Pendiente de tarifa/);
  assert.match(html, /No significa que Pagamos sea \$0/);
  assert.doesNotMatch(html, /COP 0(?:<|\b)/);
});

test('Infinix conserva Pagamos manual 890000 y estimado 770100 sin inventar el PVP pendiente', () => {
  const infinix = { ...row, id: 'credit-infinix', referencia: 'INFINIX HOT 60 PRO+ 256GB 8+8RAM', inicial: 119900 };
  const { html } = operations([infinix], [{
    ...tariff, operation_id: infinix.id, pvp_guardado: null, pagamos_guardado: 890000,
    pvp_recibido: 1199000, diferencia_pvp: null,
    fuente_pagamos: { pagamos: 890000, pvp: null, celda: 'K55' }
  }], [{ operation_id: infinix.id, tipo: 'krediya_regla_precio_ausente' }]);
  assert.match(metricHtml(html, 'PVP guardado'), /Sin tarifa vinculada/);
  assert.doesNotMatch(metricHtml(html, 'PVP guardado'), /operation-amount|COP \d/);
  assert.match(metricHtml(html, 'PVP recibido de Krediya'), /COP 1199000/);
  assert.match(metricHtml(html, 'Pagamos antes de inicial'), /COP 890000/);
  assert.match(metricHtml(html, 'Pagamos − inicial · estimado'), /COP 770100/);
  assert.match(html, /Pagamos está respaldado en el manual/);
  assert.match(html, /Falta resolver únicamente el PVP/);
  assert.match(html, /El giro es estimado; no es un pago autorizado/);
  assert.doesNotMatch(html, /COP 0(?:<|\b)/);
});

test('un cálculo real conserva ceros autoritativos aunque la tarifa y la decisión tengan valores', () => {
  const calculation = {
    explanation: { valor_comercial: 0, base_liquidable: 646400 },
    pagamos: 0, pago_aliado: 0, total_bonos: 0, utilidad_creditek: 0
  };
  for (const liquidation_calculations of [calculation, [calculation]]) {
    const { html } = operations([{ ...row, valor_comercial: 999999, liquidation_calculations }], [
      { ...tariff, decision: { precio_venta: 700000, pagamos: 525000 } }
    ]);
    for (const label of ['PVP liquidado', 'Pagamos antes de inicial', 'Pago neto liquidado']) {
      assert.match(metricHtml(html, label), />COP 0<\/strong>/);
    }
    assert.match(html, /Bonos liquidados: <strong[^>]*>COP 0<\/strong>/);
    assert.match(html, /Utilidad: <strong[^>]*>COP 0<\/strong>/);
    assert.match(html, />Calculada<\/span>/);
    assert.doesNotMatch(html, /COP (?:646400|484800|700000|525000|999999)\b/);
    assert.doesNotMatch(html, /El giro es estimado/);
  }
});

test('la decisión por operación prevalece sobre tarifa y recalcula el estimado una sola vez', () => {
  const { html } = operations([row], [{ ...tariff, decision: { precio_venta: 700000, pagamos: 525000 } }]);
  assert.match(metricHtml(html, 'PVP decidido'), /COP 700000/);
  assert.match(metricHtml(html, 'Pagamos antes de inicial'), /COP 525000/);
  assert.match(metricHtml(html, 'Pagamos − inicial · estimado'), /COP 454850/);
  assert.match(html, /Bonos configurados: <strong[^>]*>COP 20000<\/strong>/);
  assert.doesNotMatch(html, /COP (?:646400|484800)\b/);
});

test('una operación excluida no presenta un giro estimado y dirige a su novedad', () => {
  const result = operations([{ ...row, reconocida: false }], [tariff], [priceIssue]);
  assert.match(result.html, />Excluida<\/span>/);
  assert.match(result.html, /Excluida del cálculo/);
  assert.doesNotMatch(metricHtml(result.html, 'Pagamos − inicial · estimado'), /operation-amount|COP \d/);
  assert.doesNotMatch(result.html, /COP 414650|El giro es estimado/);
  assert.equal(result.buttons('[data-edit-operation-price]').length, 0);
  const [button] = result.buttons('[data-manage-issue]');
  assert.equal(typeof button?.onclick, 'function');
  button.onclick();
  assert.deepEqual(result.calls, [['tab', 'incidents', row.id]]);
});

test('Comparar y editar precios abre directamente el editor de la operación correspondiente', () => {
  const result = operations([row], [tariff], [priceIssue]);
  const buttons = result.buttons('[data-edit-operation-price]');
  assert.equal(buttons.length, 1);
  assert.match(result.html, /Comparar y editar precios<\/button>/);
  assert.equal(typeof buttons[0].onclick, 'function');
  buttons[0].onclick();
  assert.deepEqual(result.calls, [['editor', row.id]]);
});

test('la operación congelada permite consultar la novedad y no ofrece editar precios', () => {
  const result = operations([row], [tariff], [priceIssue], { frozen_at: '2026-09-04T18:00:00Z' });
  assert.equal(result.buttons('[data-edit-operation-price]').length, 0);
  const buttons = result.buttons('[data-manage-issue]');
  assert.equal(buttons.length, 1);
  buttons[0].onclick();
  assert.deepEqual(result.calls, [['tab', 'incidents', row.id]]);
});

test('referencia, cliente, comercio e IMEI se escapan al generar el HTML', () => {
  const unsafe = {
    ...row,
    referencia: 'REDMI <script>alert("x")</script> & \'LTE\'',
    cliente_nombre: '<img src=x onerror="alert(1)">',
    establishment_name: 'Comercio & <b>Socios</b>',
    imei: '861234567890123" autofocus="true'
  };
  const { html } = operations([unsafe], [tariff]);
  for (const value of [unsafe.referencia, unsafe.cliente_nombre, unsafe.establishment_name, unsafe.imei]) {
    assert.ok(html.includes(escapeHtml(value)), 'Debe conservar el texto escapado');
    assert.ok(!html.includes(value), 'El dato original no debe inyectar HTML');
  }
  assert.doesNotMatch(html, /<script\b|<img\b|<b>Socios|" autofocus="true/);
});

test('contextos por lote son de solo lectura, respetan permisos del llamador y exigen revisor autenticado', () => {
  assert.match(contextsSql, /stable\s+security invoker\s+set search_path=''/i);
  assert.match(contextsSql, /auth\.uid\(\) is null or not public\.tiene_capacidad_aliados\('revisor'\)/);
  assert.match(contextsSql, /raise exception 'No autorizado'/);
  assert.match(contextsSql, /o\.liquidation_id=p_liquidation_id and o\.plataforma='krediya' and o\.reconocida/);
  assert.match(contextsSql, /jsonb_agg\(public\.aliados_contexto_precio_krediya\(o\.id\)/);
  assert.match(contextsSql, /revoke all on function public\.aliados_contextos_precios_krediya\(uuid\) from public,anon/);
  assert.match(contextsSql, /grant execute on function public\.aliados_contextos_precios_krediya\(uuid\) to authenticated/);
  assert.doesNotMatch(contextsSql, /\b(?:insert\s+into|update|delete\s+from|security\s+definer)\b/i);
});

test('el respaldo recupera únicamente dos tarifas completas con celdas y SHA256 trazables', () => {
  const sources = [...recoverySql.matchAll(/\('([^']+)',(\d+)::numeric,(\d+)::numeric,(\d+),'([^']+)'\)/g)]
    .map((match) => ({ referencia: match[1], pvp: Number(match[2]), pagamos: Number(match[3]), fila: Number(match[4]) }));
  assert.deepEqual(sources, [
    { referencia: 'REDMI A7 PRO 64GB 4RAM', pvp: 492800, pagamos: 369600, fila: 54 },
    { referencia: 'TECNO SPARK GO 3 4GB RAM 64GB REGULAR', pvp: 591500, pagamos: 443625, fila: 49 }
  ]);
  assert.match(recoverySql, /'sha256','48263902ee56de66ecdd007bdd1826dad090962e4a81408cd6cedc5b9dcc55f2'/);
  assert.match(recoverySql, /'pvp_celda','J'\|\|x\.fila,'pagamos_celda','K'\|\|x\.fila/);
  assert.match(recoverySql, /'krediya_tarifa_recuperada_manual'/);
  assert.match(recoverySql, /if not exists\(select 1 from public\.krediya_price_rules/);
});

test('Infinix guarda solo evidencia de Pagamos y bloquea lote y operación antes de modificarla', () => {
  const repair = recoverySql.slice(0, recoverySql.indexOf('create or replace function'));
  assert.match(repair, /op\.external_id='cob6uk5' and op\.referencia='INFINIX HOT 60 PRO\+ 256GB 8\+8RAM'/);
  assert.match(repair, /op\.reconocida and l\.frozen_at is null and l\.estado in \('importada','con_novedades','validada','calculada'\)/);
  assert.match(repair, /for update of l,op loop/i);
  assert.match(repair, /jsonb_build_object\('pagamos',890000,'pvp',null/);
  assert.match(repair, /'hoja','Hoja1','celda','K55'/);
  assert.match(repair, /'pagamos_fuente_manual',v_fuente/);
  assert.match(repair, /'anterior',o\.policy_snapshot,'fuente',v_fuente/);
  const updates = [...repair.matchAll(/\bupdate public\.liquidation_operations\b([\s\S]*?);/gi)];
  assert.equal(updates.length, 1);
  assert.match(updates[0][1], /^ set policy_snapshot=coalesce\(policy_snapshot,'\{\}'::jsonb\)\|\|jsonb_build_object\('pagamos_fuente_manual',v_fuente\) where id=o\.id$/);
  assert.doesNotMatch(repair, /decision_precio|aliados_resolver_precio_krediya/);
  assert.doesNotMatch(recoverySql, /\b(?:insert\s+into|update|delete\s+from)\s+public\.(?:payment_orders|payment_items|liquidation_calculations)\b/i);
  assert.match(recoverySql, /'pvp_guardado',r\.precio_venta,'pagamos_guardado',coalesce\(r\.pagamos,nullif\(o\.policy_snapshot->'pagamos_fuente_manual'->>'pagamos',''\)::numeric\)/);
});

test('resumen pendiente cuenta solo reconocidas y muestra Por calcular sin totales falsos en cero', () => {
  for (const estado of ['importada', 'validada', 'con_novedades']) {
    const batch = {
      id: 'batch', plataforma: 'krediya', estado, fecha_corte: '2026-09-04',
      operaciones_tiendas: 99, operaciones_aliados: 99,
      total_pago_aliados: 0, total_bonos: 0, total_utilidad_creditek: 0, total_pagar: 0,
      liquidation_operations: [
        { reconocida: true, tipo_establecimiento: 'propia', monto_credito: 100000, monto_base: 900000, inicial: 10000 },
        { reconocida: true, tipo_establecimiento: 'aliado', monto_credito: null, monto_base: 200000, inicial: 20000 },
        { reconocida: false, tipo_establecimiento: 'aliado', monto_credito: 999999, inicial: 999999 }
      ]
    };
    const { list, metrics } = batchSummary(batch);
    const cells = [...list.matchAll(/<td>([\s\S]*?)<\/td>/g)].map((match) => match[1]);
    assert.equal(cells[4], '2');
    assert.deepEqual(cells.slice(5, 9), ['Por calcular', 'Por calcular', 'Por calcular', 'Por calcular']);
    assert.match(metrics, /<small>Operaciones reconocidas<\/small><strong>2<\/strong>/);
    assert.match(metrics, /<small>Crédito financiado<\/small><strong>COP 300000<\/strong>/);
    assert.match(metrics, /<small>Iniciales<\/small><strong>COP 30000<\/strong>/);
    assert.match(metrics, /<small>Tiendas propias \/ aliados<\/small><strong>1 \/ 1<\/strong>/);
    assert.doesNotMatch(metrics, /Pago total|Total a girar|Utilidad total del negocio|COP (?:0|999999)<\/strong>/);
  }
});

test('resumen calculado conserva los totales calculados y permite cero real', () => {
  const { list, metrics } = batchSummary({
    id: 'batch', plataforma: 'krediya', estado: 'calculada', fecha_corte: '2026-09-04',
    operaciones_tiendas: 1, operaciones_aliados: 1, total_operaciones: 646400,
    total_pago_tiendas: 0, total_pago_aliados: 414650, total_bonos: 0,
    total_utilidad_creditek: 0, total_utilidad_tiendas: 0, total_pagar: 414650
  });
  assert.doesNotMatch(list, /Por calcular/);
  assert.match(list, /<td>COP 0<\/td>/);
  assert.match(metrics, /<small>Total a girar<\/small><strong>COP 414650<\/strong>/);
  assert.match(metrics, /<small>Utilidad total del negocio<\/small><strong>COP 0<\/strong>/);
});
