import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync('creditek/erp/aliados-liquidaciones-app.js','utf8');
test('Ver detalle lleva al panel y muestra las novedades de la base',()=>{
  assert.match(app,/\$\('detail'\)\.scrollIntoView/);
  assert.match(app,/\$\('detail'\)\.focus/);
  assert.match(app,/Pendientes de resolver/);
  assert.match(app,/id="openBatchIssues">Corregir datos indispensables/);
  assert.match(app,/openBatchIssues'\)\.onclick = \(\) => loadTab\('incidents'\)/);
  assert.match(app,/actualIssues = \(rowIssues \|\| \[\]\)\.filter/);
});
