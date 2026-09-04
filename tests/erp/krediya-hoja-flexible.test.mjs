import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('creditek/erp/aliados-liquidaciones-app.js','utf8');
const html=fs.readFileSync('creditek/erp/aliados-liquidaciones.html','utf8');

test('Krediya detecta la tabla por columnas y no por un nombre fijo de hoja',()=>{
  assert.match(app,/workbook\.SheetNames\.map/);
  assert.match(app,/# credito/);
  assert.match(app,/headers\.includes\('imei'\)/);
  assert.match(app,/headers\.includes\('monto a financiar'\)/);
  assert.doesNotMatch(app,/headers\.includes\('pagamos'\)/);
  assert.doesNotMatch(app,/workbook\.Sheets\.LIQUIDACION/);
});

test('conserva el nombre real de la hoja en la trazabilidad',()=>{
  assert.match(app,/preview\.sheetName = selectedSheet\.name/);
  assert.match(app,/sheet: preview\.sheetName/);
  assert.match(html,/aliados-liquidaciones-app\.js\?v=2\.1\.5/);
});
