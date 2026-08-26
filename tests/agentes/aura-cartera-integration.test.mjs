import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = relative => readFile(path.join(root, relative), 'utf8');

test('Cartera ocupa una sección propia entre Agentes IA y Comercial', async () => {
  const shell = await read('creditek/agentes/index.html');
  assert.match(shell, /Agentes IA[\s\S]*<div class="sidebar-section">Cartera<\/div>[\s\S]*<div class="sidebar-section">Comercial<\/div>/);
  for (const route of ['summary', 'daily', 'customers', 'reconciliation', 'promises']) {
    assert.match(shell, new RegExp(`openCarteraModule\\('${route}'`));
  }
});

test('el módulo Cartera conserva datos ficticios y no integra servicios externos', async () => {
  const source = await read('creditek/agentes/aura-cartera.js');
  const html = await read('creditek/agentes/aura-cartera.html');
  assert.match(html, /SANDBOX · DATOS FICTICIOS · SIN ENVÍOS/);
  assert.doesNotMatch(source, /fetch\s*\(|supabase|graph\.facebook|whatsapp|wrangler/i);
  assert.match(source, /únicamente en sandbox|solo en sandbox/);
});

test('Home, gestión, ficha, conciliaciones y promesas están disponibles', async () => {
  const source = await read('creditek/agentes/aura-cartera.js');
  for (const marker of ['Resumen de cartera', 'Gestión del día', 'Perfil observable', 'Conciliaciones', 'Promesas']) {
    assert.match(source, new RegExp(marker));
  }
  assert.match(source, /data-customer/);
  assert.match(source, /data-sim/);
});

test('la configuración registra Cartera sin alterar permisos de Sofía', async () => {
  const config = await read('creditek/agentes/aura-module-config.js');
  assert.match(config, /sofia\.use/);
  assert.match(config, /appId: 'cartera_sandbox'/);
  assert.match(config, /permission: 'sandbox\.local'/);
});
