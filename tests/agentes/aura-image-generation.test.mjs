import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');

async function read(relative) {
  return readFile(path.join(root, relative), 'utf8');
}

test('el backend fija GPT Image 2.5 Flare para toda generación OpenAI', async () => {
  const worker = await read('creditek/workers/gemini-proxy/index.js');
  assert.match(worker, /OPENAI_IMAGE_MODEL = "gpt-image-2\.5-flare"/);
  assert.match(worker, /tool\?\.type === "image_generation" \? \{ \.\.\.tool, model: OPENAI_IMAGE_MODEL \} : tool/);
  assert.match(worker, /body: JSON\.stringify\(imagePayload\)/);
});

test('la composición bloquea la pieza si no pudo aplicar el logo oficial', async () => {
  const page = await read('creditek/agentes/creditek-agente-redes.html');
  assert.doesNotMatch(page, /if \(!logo\) return dataUrlImagen/);
  assert.doesNotMatch(page, /imgLogo\.onerror = \(\) => resolve\(dataUrlImagen\)/);
  assert.doesNotMatch(page, /imgBase\.onerror = \(\) => resolve\(dataUrlImagen\)/);
  assert.match(page, /No se pudo aplicar el logo oficial de Creditek\. La imagen no se entregará sin marca\./);
});

test('el fondo predeterminado respeta el ambiente visual elegido', async () => {
  const page = await read('creditek/agentes/creditek-agente-redes.html');
  assert.match(page, /const fondoPorEstilo = \{/);
  assert.match(page, /costeno: 'escena fotográfica luminosa de borde a borde, con luz natural cálida/);
  assert.match(page, /chistoso: 'tienda compacta o calle comercial cotidiana del Caribe colombiano/);
  assert.match(page, /minimalista: 'fondo blanco #FFFFFF o muy claro/);
  assert.match(page, /fondoPorEstilo\[currentEstilo\] \|\| fondoPorEstilo\.formal/);
});

test('la integración conserva todos los ambientes del diseñador', async () => {
  const page = await read('creditek/agentes/creditek-agente-redes.html');
  for (const style of ['formal', 'costeno', 'chistoso', 'minimalista', 'contemporaneo', 'custom']) {
    assert.match(page, new RegExp(`selectEstilo\\('${style}',this\\)`), style);
  }
});

test('Chistoso investiga actualidad una sola vez y transforma la referencia sin copiarla', async () => {
  const [page, worker] = await Promise.all([
    read('creditek/agentes/creditek-agente-redes.html'),
    read('creditek/workers/gemini-proxy/index.js'),
  ]);

  assert.match(page, /INVESTIGACIÓN DE HUMOR ACTUAL — OBLIGATORIA/);
  assert.match(page, /detalleEstilo === 'chistoso' \? \{ tools: \[\{ type:'web_search_20250305', name:'web_search', max_uses:1 \}\] \} : \{\}/);
  assert.match(page, /estilo === 'chistoso' \? \{ tools: \[\{ type:'web_search_20250305', name:'web_search', max_uses:1 \}\] \} : \{\}/);
  assert.match(page, /Borrow the comedic mechanism, never the protected expression/);
  assert.match(page, /Never reproduce or closely imitate an existing individualized meme image/);

  assert.match(worker, /requestedWebSearch = Array\.isArray\(payload\.tools\)/);
  assert.match(worker, /type: "web_search_20250305"/);
  assert.match(worker, /max_uses: 1/);
  assert.match(worker, /city: "Monteria"/);
  assert.doesNotMatch(worker, /allowedPayload\.tools\s*=\s*payload\.tools/);
});
