import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const liquidationsHtml = await readFile(new URL('../../creditek/erp/aliados-liquidaciones.html', import.meta.url), 'utf8');
const liquidationsApp = await readFile(new URL('../../creditek/erp/aliados-liquidaciones-app.js', import.meta.url), 'utf8');
const alliesCss = await readFile(new URL('../../creditek/erp/aliados-v1-1.css', import.meta.url), 'utf8');
const alliesApp = await readFile(new URL('../../creditek/erp/aliados-v1-1-app.js', import.meta.url), 'utf8');

test('detalle de operaciones cabe en el ancho disponible sin perder datos esenciales', () => {
  assert.match(liquidationsHtml, /\.operations-table\{overflow-x:hidden}/);
  assert.match(liquidationsHtml, /\.operations-table table\{table-layout:fixed}/);
  assert.match(liquidationsApp, /Cliente \/ IMEI/);
  assert.match(liquidationsApp, /KORA:/);
  assert.doesNotMatch(liquidationsApp, /const headers = \['Tipo de operación'.*'Novedades'\]/);
});

test('novedades se gestionan desde la fila y llevan al incidente correspondiente', () => {
  assert.match(liquidationsApp, /data-manage-issue/);
  assert.match(liquidationsApp, /loadTab\('incidents', button\.dataset\.manageIssue\)/);
  assert.match(liquidationsApp, /focused-incident/);
});

test('tabla de aliados usa todo el ancho y ofrece gestión directa', () => {
  assert.match(alliesCss, /body\[data-aliados-view="allies"\] \.main-content \.page\{width:100%!important;max-width:none!important/);
  assert.match(alliesCss, /body\[data-aliados-view="allies"\] \.table-wrap\{width:100%;overflow-x:hidden!important/);
  assert.match(alliesApp, /aliados-calidad\.html\?establecimiento=/);
  assert.match(alliesApp, /new URLSearchParams\(location\.search\)\.get\("establecimiento"\)/);
});
