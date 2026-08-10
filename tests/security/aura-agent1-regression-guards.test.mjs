import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = file => readFile(new URL(file, root), 'utf8');

test('guardia contra pantalla blanca y scripts legacy', async () => {
  const [html, bootstrap] = await Promise.all([
    read('creditek/agentes/creditek-agente-redes.html'),
    read('creditek/agentes/aura-agent-bootstrap.js'),
  ]);
  assert.match(html, /id="app"/);
  assert.match(html, /aura-module-config\.js[^>]+defer/);
  assert.match(html, /aura-agent-bootstrap\.js[^>]+defer/);
  assert.match(html, /aura-context-help\.js[^>]+defer/);
  assert.doesNotMatch(html, /aura-agent-config\.js|aura-sidebar-loader\.js|kora-agent-context\.js/);
  assert.match(bootstrap, /embedded.*===\s*['"]1['"]/s);
  assert.match(bootstrap, /classList\.add\(['"]show['"]\)/);
});

test('guardia de copy: Detalle hoy es contexto obligatorio y no vuelve el banco legacy', async () => {
  const html = await read('creditek/agentes/creditek-agente-redes.html');
  assert.match(html, /function generarMasTitulares[\s\S]*DETALLE HOY \(contexto obligatorio del copy\)/);
  assert.match(html, /function generarContenido[\s\S]*DETALLE HOY \(contexto obligatorio del copy\)/);
  assert.match(html, /function getDetalleDelDia[\s\S]*modo-contexto/);
  assert.doesNotMatch(html, /BANCO_DETALLES|BANCO_DETALLES_REF/);
  assert.doesNotMatch(html, /una plaza de pueblo con palomas/);
  assert.doesNotMatch(html, /Tecnología a crédito en el Caribe colombiano/);
});

test('guardias GPT/Gemini: marca, composición y escala no regresan', async () => {
  const html = await read('creditek/agentes/creditek-agente-redes.html');
  assert.match(html, /GPT_BRANDING_GUARD/);
  assert.match(html, /GPT_LAYOUT_GUARD/);
  assert.match(html, /NO logo, NO word Creditek/);
  assert.match(html, /function componerLogoSobreImagen/);
  assert.match(html, /function calcularDimensionesLogo/);
  assert.doesNotMatch(html, /canvas\.width\s*\*\s*0\.105/);
  assert.match(html, /generarConGemini[\s\S]*componerLogoSobreImagen/);
});

test('guardia contra doble clic de generación', async () => {
  const html = await read('creditek/agentes/creditek-agente-redes.html');
  assert.match(html, /let imageGenerationInFlight\s*=\s*false/);
  assert.match(html, /function beginImageGeneration/);
  assert.match(html, /if \(!beginImageGeneration\(\)\) return/);
  assert.match(html, /label\.textContent\s*=\s*['"]Generando/);
  assert.match(html, /visibleBtn\.disabled\s*=\s*true/);
});

test('guardia de deploy puntual protege Worker, auth, routing y assets globales', async () => {
  const script = await read('scripts/deploy-aura-piezas.mjs');
  assert.match(script, /aura-module-config\.js/);
  assert.match(script, /aura-agent-bootstrap\.js/);
  assert.match(script, /aura-context-help\.js/);
  assert.match(script, /creditek\/workers\/aura-hub\/src\/index\.js/);
  assert.match(script, /wrangler\.aura-hub\.jsonc/);
  assert.match(script, /AUTH_ALIAS/);
  assert.match(script, /difiere de la base estable/);
  assert.match(script, /artefacto global alterado/);
});
