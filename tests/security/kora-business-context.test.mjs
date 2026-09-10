import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../../creditek/erp/sidebar.js', import.meta.url), 'utf8');
const functions = source.slice(source.indexOf('  function koraBusinessContext('), source.indexOf('  function installDelayedTooltips('));

test('cabecera: Retail conserva tienda; Aliados, B2B y administración no la muestran', () => {
  const store = { style: {}, value: 'CK-02' };
  const business = { style: {}, textContent: '' };
  const title = {};
  const breadcrumb = {};
  const nodes = { '[data-kora-retail-store]': store, '[data-kora-business-context]': business,
    '.kora-topbar__title': title, '.kora-breadcrumb': breadcrumb };
  const root = { querySelector: selector => nodes[selector] };
  const context = vm.createContext({ document: { querySelector: () => root }, escapeHtml: String });
  vm.runInContext(functions, context);
  for (const [group, label, retail] of [
    ['CREDITEK RETAIL', 'Retail', true], ['CREDITEK ALIADOS', 'Aliados', false],
    ['CREDITEK B2B', 'B2B', false], ['ADMINISTRACIÓN', 'Administración', false],
    ['TABLERO', 'Administración', false], ['MI TIENDA', 'Retail', true],
  ]) {
    context.setKoraContext('Pantalla', ['KORA', group, 'Pantalla']);
    assert.equal(store.style.display, retail ? '' : 'none', group);
    assert.equal(business.style.display, retail ? 'none' : '', group);
    assert.equal(business.textContent, label);
    assert.equal(store.value, 'CK-02', 'conserva la selección al volver a Retail');
  }
  assert.match(source, /updateKoraBusinessContext\(root, \[shellProductName, current\?\.group, current\?\.label\]\)/);
});
