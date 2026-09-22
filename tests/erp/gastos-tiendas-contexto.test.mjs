import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html = readFileSync(new URL('../../creditek/erp/gastos.html', import.meta.url), 'utf8');
test('Gastos filtra cada tienda y muestra la procedencia de cada fila', () => {
  const codigo = html.slice(html.indexOf('function renderTablaGastos()'), html.indexOf('async function', html.indexOf('function renderTablaGastos()')));
  const elementos = Object.fromEntries(['filtroTienda','filtroFecha','filtroConcepto','filtroEstado','tbodyGastos','emptyState'].map(id=>[id,{value:'',style:{},querySelectorAll:()=>[]}]));
  const gastosCache = Array.from({length:10},(_,i)=>({id:String(i),tienda_codigo:`CK-${i}`,fecha:'2026-09-11',estado:'aprobado',origenes:{nombre:`Tienda ${i}`},monto:117000}));
  const context = vm.createContext({document:{getElementById:id=>elementos[id]},gastosCache,formatearFechaGasto:x=>x,escapeHtml:x=>x,fmtCOP:x=>x});
  vm.runInContext(codigo,context);
  for (let i=0;i<10;i++) {
    elementos.filtroTienda.value=`CK-${i}`;
    vm.runInContext('renderTablaGastos()',context);
    assert.match(elementos.tbodyGastos.innerHTML,new RegExp(`Tienda ${i}`));
    assert.equal((elementos.tbodyGastos.innerHTML.match(/<tr(?:\s[^>]*)?>/g)||[]).length,1);
  }
});

test('el enlace de la campana abre todos los gastos pendientes aunque hubiera una tienda seleccionada', () => {
  assert.match(html, /new URLSearchParams\(location\.search\)\.get\('pendientes'\) === '1'/);
  assert.match(html, /abrirPendientes \? ''/);
  assert.match(html, /if \(!abrirPendientes\) localStorage\.setItem/);
});
