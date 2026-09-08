import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile('creditek/erp/aliados-v1-1-app.js', 'utf8');
const html = await readFile('creditek/erp/aliados-bonificaciones.html', 'utf8');
const render = app.slice(app.indexOf('function renderBonuses()'), app.indexOf('function populateExpenseForm()'));

test('Bonificaciones abre en el mes vigente y filtra por fecha real de venta', () => {
  assert.match(render, /bonusFrom/);
  assert.match(render, /bonusTo/);
  assert.match(render, /bogotaDateParts/);
  assert.match(render, /operationSaleDay/);
  assert.match(render, /operationIsCurrent/);
  assert.match(render, /Mes vigente/);
});

test('permite filtrar bonificaciones por plataforma, ejecutivo y estado', () => {
  assert.match(render, /bonusPlatform/);
  assert.match(render, /bonusExecutive/);
  assert.match(render, /bonusState/);
  assert.match(render, /Aprobadas/);
  assert.match(render, /Pendientes/);
  assert.match(render, /Pagadas/);
});

test('la pantalla operativa no repite el histórico cerrado', () => {
  assert.match(render, /Bonificaciones del periodo/);
  assert.match(render, /Fecha de venta/);
  assert.doesNotMatch(render, /Histórico inicial — pagado/);
  assert.doesNotMatch(render, /<h2>Operación nueva<\/h2>/);
  assert.match(html, /aliados-v1-1-app\.js\?v=1\.1\.29/);
});

test('resumen agrupa por identidad y conserva el detalle cerrado', () => {
  const source=render.slice(render.indexOf('const groups = new Map();'),render.lastIndexOf('}'));
  const content={innerHTML:''};
  const items=[{b:{beneficiary_id:'a',valor:20000},beneficiary:{nombre:'Luis'}},{b:{beneficiary_id:'a',valor:20000},beneficiary:{nombre:'Luis'}},{b:{beneficiary_id:'b',valor:5000},beneficiary:{nombre:'Mayte'}}];
  new Function('items','$','esc','cop','from','to','table','rows',source)(items,()=>content,String,String,'2026-09-01','2026-09-07',()=>'<table></table>',()=>[]);
  assert.match(content.innerHTML,/Luis/);
  assert.match(content.innerHTML,/40000/);
  assert.match(content.innerHTML,/5000/);
  assert.match(content.innerHTML,/2 beneficiarios/);
  assert.match(content.innerHTML,/Consultar detalle · 3 registros/);
  assert.doesNotMatch(content.innerHTML,/<details[^>]*\bopen\b/);
});
