import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = relative => readFile(path.join(root, relative), 'utf8');

test('el shell KORA se activa únicamente en las tres pantallas piloto', async () => {
  const [tablero, utilidad, agentes] = await Promise.all([
    read('creditek/erp/tablero.html'),
    read('creditek/erp/utilidad-creditek.html'),
    read('creditek/agentes/index.html'),
  ]);

  assert.match(tablero, /sidebar\.js" data-kora-shell="1\.0\.0"/);
  assert.match(utilidad, /sidebar\.js" data-kora-shell="1\.0\.0"/);
  assert.match(
    agentes,
    /\.\.\/erp\/sidebar\.js" data-kora-shell="1\.0\.0" data-kora-shell-mode="agents"/,
  );
});

test('la navegación KORA usa Design System, Lucide fijado y no estilos inline', async () => {
  const [source, css] = await Promise.all([
    read('creditek/erp/sidebar.js'),
    read('design-system/components/kora-shell.css'),
  ]);

  assert.match(source, /lucide@1\.27\.0/);
  assert.match(source, /kora-shell\.css/);
  assert.match(source, /data-lucide=/);
  assert.doesNotMatch(source, /koraShellStyles.*createElement\('style'\)/s);
  assert.match(css, /@import url\("\.\.\/tokens\/index\.css"\)/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/gi);
  assert.doesNotMatch(css, /\brgba?\(/gi);
});

test('preserva rutas y roles verificables del ERP', async () => {
  const source = await read('creditek/erp/sidebar.js');
  const contracts = [
    "Dashboard', href: 'tablero.html', roles: ['gerencia', 'auditoria']",
    "Stock', href: 'inventario.html', roles: ['gerencia', 'auditoria', 'admin_tienda', 'asesor']",
    "Ventas', href: 'ventas.html', roles: ['gerencia', 'auditoria', 'admin_tienda', 'asesor']",
    "Cartera de Proveedores', href: 'proveedores.html', roles: ['gerencia', 'auditoria']",
    "Utilidad Creditek', href: 'utilidad-creditek.html', roles: ['gerencia', 'auditoria']",
    "Dashboard', href: 'reportes.html', roles: ['gerencia', 'auditoria', 'admin_tienda', 'asesor']",
  ];
  contracts.forEach(contract => assert.ok(source.includes(contract), contract));
  assert.match(source, /creditek_sidebar_tienda/);
  assert.match(source, /sb\.auth\.signOut\(\)/);
});

test('incluye activo, drawer accesible, foco, Escape y extensiones futuras', async () => {
  const [source, css] = await Promise.all([
    read('creditek/erp/sidebar.js'),
    read('design-system/components/kora-shell.css'),
  ]);

  [
    'aria-current="page"',
    "event.key === 'Escape'",
    "event.key === 'Tab'",
    'data-kora-notifications',
    'data-kora-connectivity',
    "setAttribute('aria-modal', 'true')",
  ].forEach(contract => assert.ok(source.includes(contract), contract));
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /max-width: 63\.999rem/);
  assert.match(css, /max-width: 47\.999rem/);
  assert.match(css, /overflow-x: clip/);
});

test('documenta el contrato previo y la versión del shell', async () => {
  const documentation = await read('docs/KORA_NAVIGATION_SHELL.md');
  assert.match(documentation, /Producto: KORA/);
  assert.match(documentation, /Empresa: Creditek/);
  assert.match(documentation, /Versión: 1\.0\.0/);
  assert.match(documentation, /Comportamiento preservado de `sidebar\.js`/);
  assert.match(documentation, /No implementa sincronización offline/);
});
