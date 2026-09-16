import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync('creditek/erp/tablero.html', 'utf8');
const source = html.slice(html.indexOf('function dibujarGraficos('), html.indexOf('async function cargarSerieUtilidadAcumulada('));

function fixture(rows) {
  let config;
  const drawn = [];
  const attrs = {};
  const ctx = { save() {}, restore() {}, measureText: text => ({ width: text.length * 6 }), fillText: (...args) => drawn.push(args) };
  function Chart(canvas, options) { config = options; }
  Chart.defaults = { font: { family: 'Arial' } };
  const scope = { Chart, chartCreditosObj: null, document: { getElementById: () => ({ getContext: () => ctx, setAttribute: (key, value) => attrs[key] = value }) }, tokenColor: value => value, cargarSerieUtilidadAcumulada() {} };
  vm.runInNewContext(source, scope);
  scope.dibujarGraficos(rows, null, 30, 16, '');
  return { config, ctx, drawn, attrs };
}

test('etiquetas exactas para avance, cero, meta alcanzada, superada y sin meta', () => {
  const rows = [[5,15], [0,12], [20,20], [22,20], [0,0], [3,null]].map(([creditosMes,metaMes], i) => ({creditosMes,metaMes,tienda:{nombre:`Tienda ${i}`}}));
  const { config, ctx, drawn, attrs } = fixture(rows);
  config.plugins[0].afterDatasetsDraw({ ctx, data: config.data, scales: { x: { getPixelForValue: () => 100 }, y: { getPixelForValue: i => i * 30 } }, isDatasetVisible: () => true, getDatasetMeta: index => ({ data: rows.map(row => ({ x: 100 + 10 * (index ? Math.max(row.creditosMes, row.metaMes || 0) : row.creditosMes) })) }) });
  assert.deepEqual(drawn.map(row => row[0]), ['5 de 15','0 de 12','20 de 20','22 de 20','0 · sin meta','3 · sin meta']);
  assert.deepEqual(drawn.map(row => row[1]), [258,228,308,328,108,138]);
  assert.ok(config.options.layout.padding.right >= '0 · sin meta'.length * 6 + 16);
  assert.equal(attrs.role, 'img');
  assert.match(attrs['aria-label'], /Tienda 0: 5 de 15/);
  assert.equal(config.data.datasets[1].data[3], 0);
});

test('filtro sin resultados y cambio de visibilidad no rompen las etiquetas', () => {
  assert.equal(fixture([]).config.options.layout.padding.right, 16);
  const { config, ctx, drawn } = fixture([{creditosMes:5,metaMes:15,tienda:{nombre:'Tolú'}}]);
  config.plugins[0].afterDatasetsDraw({ ctx, data: config.data, scales: {x:{getPixelForValue:()=>0},y:{getPixelForValue:()=>20}}, isDatasetVisible: i => i === 0, getDatasetMeta: i => ({data:[{x: i === 0 ? 50 : 150}]}) });
  assert.deepEqual(drawn, [['5 de 15',58,20]]);
});
