import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../../creditek/erp/reportes.html', import.meta.url), 'utf8');

test('Retail muestra los KPI comerciales esenciales del período', () => {
  for (const id of ['kpi-facturas', 'kpi-unidades', 'kpi-upf', 'kpi-ticket', 'kpi-celulares', 'kpi-accesorios']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /const unidadesPorFactura = ventas\.length \? unidades \/ ventas\.length : 0/);
  assert.match(html, /item\.productos\?\.tipo === 'serializado'/);
});

test('Gerencia y auditoría pueden analizar por ciudad sin abrir datos a las tiendas', () => {
  assert.match(html, /id="filtroCiudadWrap" class="solo-central"/);
  assert.match(html, /select\('codigo, nombre, ciudad'\)/);
  assert.match(html, /tiendasCache\.filter\(t => t\.ciudad === ciudad\)/);
  assert.match(html, /if \(!esCentral\(\)\) document\.querySelectorAll\('\.solo-central'\)/);
});

test('el comparativo 2025 es visible y respeta período y tiendas', () => {
  assert.match(html, /id="comparativo-actual"/);
  assert.match(html, /id="comparativo-anterior"/);
  assert.match(html, /id="comparativo-delta"/);
  assert.match(html, /async function referenciaVentas2025\(desde, hasta\)/);
  assert.match(html, /q = aplicarFiltroTienda\(q\)/);
  assert.match(html, /mismas fechas de 2025/);
  assert.match(html, /3\.1 CRECIMIENTO MES A MES[\s\S]*?<details open>/);
});
