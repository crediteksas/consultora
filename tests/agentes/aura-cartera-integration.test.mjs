import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = relative => readFile(path.join(root, relative), 'utf8');

test('Clientes, NOVA y Cartera ocupan secciones propias entre Agentes IA y Comercial', async () => {
  const shell = await read('creditek/agentes/index.html');
  assert.match(shell, /Agentes IA[\s\S]*data-aura-capability="consultas\.read">Clientes<\/div>[\s\S]*data-aura-capability="nova\.read">NOVA Autorizaciones<\/div>[\s\S]*data-aura-capability="cartera\.read">Cartera<\/div>[\s\S]*<div class="sidebar-section">Comercial<\/div>/);
  for (const route of ['summary', 'daily', 'segments', 'customers', 'reconciliation', 'promises', 'reports', 'conversations', 'optouts', 'kpis', 'settings']) {
    assert.match(shell, new RegExp(`openCarteraModule\\('${route}'`));
  }
});

test('el módulo Cartera conserva datos ficticios y solo consulta el puente sandbox local', async () => {
  const source = await read('creditek/agentes/aura-cartera.js');
  const html = await read('creditek/agentes/aura-cartera.html');
  assert.match(html, /Canal Creditek Pagos pendiente de activación Meta · DATOS FICTICIOS · SIN ENVÍOS/);
  assert.match(source, /fetch\('\/api\/cartera\/customers'\)/);
  assert.doesNotMatch(source, /supabase\.co|graph\.facebook|PHONE_NUMBER_ID|WHATSAPP_TOKEN|wrangler|service_role|postgres(?:ql)?:\/\//i);
  assert.match(source, /únicamente en sandbox|solo en sandbox/);
});

test('las seis vistas V2 están integradas con sus reglas de dominio visuales', async () => {
  const source = await read('creditek/agentes/aura-cartera.js');
  for (const marker of ['Segmentos', 'Pagos reportados', 'Conversaciones', 'Opt-outs', 'KPIs', 'Configuración']) {
    assert.match(source, new RegExp(marker));
  }
  assert.match(source, /PENDIENTE DE VALIDACIÓN/);
  assert.doesNotMatch(source, /PAGO CONFIRMADO/);
  assert.match(source, /commercial_opt_out/);
  assert.match(source, /collections_opt_out/);
  assert.match(source, /CORRELACIÓN POSTERIOR AL CONTACTO/);
  assert.match(source, /Disponible cuando exista grupo de control real/);
  assert.match(source, /SANDBOX \/ NO PRODUCTIVO/);
});

test('el envío real permanece deshabilitado y todas las acciones son mock', async () => {
  const source = await read('creditek/agentes/aura-cartera.js');
  assert.match(source, /ENVIAR REAL — DESHABILITADO/);
  assert.match(source, /class="send-real" disabled/);
  assert.match(source, /Mensaje simulado localmente; transporte real: NO/);
});

test('los KPI explican medición, cálculo y uso mediante tooltips', async () => {
  const source = await read('creditek/agentes/aura-cartera.js');
  assert.match(source, /title="\$\{h\(help\)\}"/);
  assert.match(source, /Correlación, no causalidad/);
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
  assert.match(config, /appId: 'cartera'/);
  assert.match(config, /permission: 'cartera\.read'/);
});
