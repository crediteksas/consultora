import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../../creditek/agentes/agente3-meta-ads.html', import.meta.url), 'utf8');

test('el publicador identifica las variantes A y B sin activar campañas', () => {
  assert.match(html, /VARIANTE A/);
  assert.match(html, /publisher-ab-enabled/);
  assert.match(html, /publisher-piece-b/);
  assert.match(html, /Ambas se crearán en PAUSED/);
  assert.match(html, /variants:\[\{/);
  assert.match(html, /comparison==='A\/B'/);
});

test('la interfaz muestra el detalle Meta sanitizado en vez de ocultarlo', () => {
  assert.match(html, /data\.meta\?\.message/);
  assert.match(html, /data\.reason/);
  assert.doesNotMatch(html, /Meta no está disponible temporalmente/);
});
