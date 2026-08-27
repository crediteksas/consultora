import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const shell = await readFile(path.join(root, 'creditek/agentes/index.html'), 'utf8');

test('conserva los siete grupos en el orden aprobado', () => {
  const order = ['Principal', 'Agentes IA', 'Clientes', 'NOVA Autorizaciones', 'Cartera', 'Comercial', 'Sistema'];
  let cursor = -1;
  for (const label of order) {
    const next = shell.indexOf(`>${label}</div>`, cursor + 1);
    assert.ok(next > cursor, `${label} debe conservar su posición`);
    cursor = next;
  }
});

test('convierte los seis grupos con submenú en controles accesibles con chevron', () => {
  assert.match(shell, /function initializeSidebarGroups\(\)/);
  assert.match(shell, /data-lucide="chevron-down"/);
  assert.match(shell, /setAttribute\('aria-expanded', 'false'\)/);
  assert.match(shell, /setAttribute\('aria-controls', group\.id\)/);
  assert.match(shell, /event\.key === 'Enter' \|\| event\.key === ' '/);
});

test('mantiene un solo grupo abierto y permite cerrarlo', () => {
  assert.match(shell, /function setOpenSidebarGroup\(groupKey = '', persist = true\)/);
  assert.match(shell, /classList\.toggle\('open', open\)/);
  assert.match(shell, /header\?\.getAttribute\('aria-expanded'\) === 'true' \? '' : groupKey/);
});

test('abre automáticamente el grupo del elemento activo y conserva estado de sesión', () => {
  assert.match(shell, /openSidebarGroupForItem\(item\)/);
  assert.match(shell, /activateNavigationItem\(el\)/);
  assert.match(shell, /aura_sidebar_open_group/);
  assert.match(shell, /sessionStorage\.setItem\(SIDEBAR_GROUP_STORAGE_KEY, groupKey\)/);
});

test('no altera rutas ni guardas de permisos de Clientes NOVA y Cartera', () => {
  assert.match(shell, /AURA_CAPABILITIES, hasAuraCapability, isAuraFunctionalAdmin/);
  assert.match(shell, /data-aura-capability="cartera\.read"/);
  assert.match(shell, /openClientsModule\('search'/);
  assert.match(shell, /openNovaModule\('summary'/);
  assert.match(shell, /openCarteraModule\('summary'/);
});

test('el modo de sidebar reducido conserva todos los iconos navegables', () => {
  assert.match(shell, /#app\.sidebar-collapsed \.sidebar-group-items\{grid-template-rows:1fr\}/);
  assert.match(shell, /#app\.sidebar-collapsed \.sidebar-group-items-inner\{overflow:visible\}/);
});
