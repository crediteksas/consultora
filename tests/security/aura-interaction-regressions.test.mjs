import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = relative => readFile(new URL(relative, root), 'utf8');
const readOptional = relative => read(relative).catch(() => '');

const hub = await read('creditek/agentes/index.html');
const redes = await read('creditek/agentes/creditek-agente-redes.html');
const metaAds = await read('creditek/agentes/agente3-meta-ads.html');
const calendar = await read('creditek/agentes/creditek-agente-calendario.html');
const sofia = await read('creditek/agentes/creditek-agente-respuestas.html');
const googleBusiness = await read('creditek/agentes/creditek-gbp-fichas.html');
const build = await read('scripts/build-aura-hub.mjs');
const contextHelp = await readOptional('creditek/agentes/aura-context-help.js');
const imageClient = await readOptional('creditek/agentes/aura-image-client.mjs');

test('Agente Redes usa exclusivamente el Worker autenticado para generar imágenes', () => {
  assert.match(redes, /aura-image-client\.mjs/);
  assert.match(redes, /llamarBackendImagen\('\/generate'/);
  assert.match(redes, /llamarBackendImagen\('\/openai\/responses'/);
  assert.doesNotMatch(redes, /api\.openai\.com|X-Worker-Secret|WORKER_SHARED_SECRET/);
  assert.doesNotMatch(redes, /ck_openai_key|ck_gemini_key/);
  assert.match(imageClient, /import \{ auraSessionToken \} from '\.\/agente3-aura-session\.mjs'/);
  assert.match(imageClient, /Authorization: `Bearer \$\{token\}`/);
  assert.doesNotMatch(imageClient, /window\.|localStorage|sessionStorage/);
});

test('Descripción y Foto son modos funcionales, explicados y accesibles', () => {
  assert.match(redes, /class="prod-toggle"[^>]*role="tablist"/);
  assert.match(redes, /class="prod-tab active"[^>]*type="button"[^>]*aria-pressed="true"[^>]*data-aura-help="[^"]+"/);
  assert.match(redes, /class="prod-tab"[^>]*type="button"[^>]*aria-pressed="false"[^>]*data-aura-help="[^"]+"/);
  assert.match(redes, /tab\.setAttribute\('aria-pressed', String\(selected\)\)/);
  assert.match(redes, /producto\.focus\(\)/);
  assert.match(redes, /prodFile\.focus\(\)/);
});

test('la barra lateral de AURA se repliega a iconos y conserva el estado de la sesión', () => {
  assert.match(hub, /--sidebar-collapsed:64px/);
  assert.match(hub, /id="sidebar-toggle"/);
  assert.match(hub, /function toggleAuraSidebar/);
  assert.match(hub, /sessionStorage\.setItem\('aura_sidebar_collapsed'/);
  assert.match(hub, /classList\.toggle\('sidebar-collapsed'/);
  assert.match(hub, /aria-expanded/);
});

test('AURA ofrece ayuda contextual compartida por mouse y teclado', () => {
  assert.match(contextHelp, /data-aura-help/);
  assert.match(contextHelp, /mouseenter|pointerenter/);
  assert.match(contextHelp, /focusin/);
  assert.match(contextHelp, /aura-context-tooltip/);
  for (const source of [hub, redes, metaAds, calendar, sofia, googleBusiness]) {
    assert.match(source, /aura-context-help\.js/);
  }
  assert.match(build, /aura-context-help\.js/);
});

test('los checks de ciudades conservan un cuadro uniforme aunque el nombre ocupe dos líneas', () => {
  assert.match(metaAds, /\.publisher-field input:not\(\[type="checkbox"\]\)/);
  assert.match(metaAds, /\.publisher-checks input\[type="checkbox"\]\{[^}]*width:16px[^}]*height:16px[^}]*min-height:0/);
  assert.match(metaAds, /\.publisher-checks label\{[^}]*min-height:44px/);
});
