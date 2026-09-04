import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync('creditek/erp/aliados-v1-1.css','utf8');
test('Plataformas se apilan a todo el ancho, sin estirar las tarjetas cerradas',()=>{
  assert.match(css,/\.platform-grid\{[^}]*grid-template-columns:minmax\(0,1fr\)[^}]*align-items:start/);
  assert.match(css,/\.platform-card table\{[^}]*min-width:0!important;table-layout:fixed!important/);
  assert.match(css,/\.platform-card td\{white-space:normal!important/);
});
