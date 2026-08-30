import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(
  new URL('../../creditek/erp/bodega-central.html', import.meta.url),
  'utf8',
);

test('bodega conserva el dominio y agrega configuración y shell KORA', () => {
  assert.doesNotMatch(html, /^(?:<<<<<<<|=======|>>>>>>>)/m);
  assert.match(html, /<script src="bodega-domain\.js"><\/script>/);
  assert.match(html, /<script src="\/config\/kora-environment\.generated\.js"><\/script>/);
  assert.match(html, /<script src="kora-access-control\.js\?v=2\.0\.15"><\/script>/);
  assert.match(html, /<script src="sidebar\.js\?v=2\.0\.15" data-kora-shell="1\.0\.0"><\/script>/);
  assert.match(html, /const bodegaDomain = window\.CreditekBodegaDomain/);
});

test('alerta toma únicamente inventario físico y lotes con factura', () => {
  assert.match(html, /SB\.rpc\('obtener_lotes_cantidad_central'\)/);
  assert.match(html, /\.eq\('estado', 'disponible'\)/);
  assert.match(html, /\.is\('imei', null\)/);
  assert.match(html, /\(lotesResp\.data \|\| \[\]\)\.forEach/);
  assert.doesNotMatch(html, /SB\.from\('stock_cantidad'\)[\s\S]{0,180}\.eq\('tienda_codigo', 'CENTRAL'\)/);
});

test('despacho consolida y crea payload mediante el dominio con factura', () => {
  assert.match(html, /productosDisponibles = bodegaDomain\.consolidarDisponibilidad\(\{/);
  assert.match(html, /lotes: lotesRes\.data \|\| \[\]/);
  assert.match(html, /facturaId: facturaFiltro \|\| null/);
  assert.match(html, /payload\.push\(bodegaDomain\.crearItemPayload\(it, facturaFiltro\)\)/);
  assert.match(html, /p\.precios_varian \? ' · varía por factura' : ''/);
});

test('cambiar factura limpia artículos para impedir mezclar lotes', () => {
  assert.match(
    html,
    /getElementById\('filtro-factura'\)\.addEventListener\('change', \(\) => \{[\s\S]*?if \(despachoItems\.length\)[\s\S]*?despachoItems = \[\][\s\S]*?despachoRender\(\)[\s\S]*?cargarDataDespacho\(\)/,
  );
});
