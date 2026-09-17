import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const read = file => readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
const source = await read('creditek/erp/kora-responsive.js');
const css = await read('design-system/components/kora-responsive.css');
const classification = source.slice(source.indexOf('  function cleanLabel'), source.indexOf('  function alignColumns'));
const context = vm.createContext({});
vm.runInContext(classification, context);

test('cabeceras y valores usan ejes consistentes sin alterar su contenido', () => {
  for (const label of ['Estado', 'Acciones', 'Cantidad', 'Créditos / meta', 'PayJoy', 'Aliadas activas']) {
    assert.equal(context.columnAlignment(label), 'center', label);
  }
  for (const label of ['Saldo inicial', 'Costo unit.', 'Comisión registrada', 'Valor', 'Utilidad', 'Margen %']) {
    assert.equal(context.columnAlignment(label), 'right', label);
  }
  for (const label of ['Tienda', 'Proveedor / NIT', 'Concepto', 'Beneficiario', 'Fecha']) {
    assert.equal(context.columnAlignment(label), 'left', label);
  }
  assert.match(source, /row\.cells\.length !== headers\.length/);
  assert.match(source, /cell\.colSpan > 1 \|\| cell\.rowSpan > 1/);
  assert.match(css, /table\.kora-responsive-cards :is\(tbody, tfoot\) td\[data-kora-align\][\s\S]*?text-align: left !important/);
});

test('interacciones visibles respetan estado deshabilitado y movimiento reducido', () => {
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)/);
  assert.match(css, /:hover:not\(:disabled\):not\(\[aria-disabled="true"\]\)/);
  assert.match(css, /transform: translateY\(-2px\)/);
  assert.match(css, /transform: translateY\(1px\) scale\(\.985\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?transition: none/);
  assert.match(css, /\.dashboard-panel, section\.bg-white\)[\s\S]*?border-top: 2px solid var\(--ctk-color-secondary-500\)/);
});
