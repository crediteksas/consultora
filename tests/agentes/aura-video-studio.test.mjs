import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  VIDEO_DURATION_SECONDS,
  buildVideoPrompt,
  canApproveVideo,
  canDownloadVideo,
  estimateVideoCost,
  validateSourceImage,
} from '../../creditek/agentes/aura-video-domain.mjs';

const studioHtml = readFileSync(new URL('../../creditek/agentes/creditek-estudio-video.html', import.meta.url), 'utf8');
const studioJs = readFileSync(new URL('../../creditek/agentes/aura-video-studio.mjs', import.meta.url), 'utf8');
const designer = readFileSync(new URL('../../creditek/agentes/creditek-agente-redes.html', import.meta.url), 'utf8');

test('el Estudio de Video es un módulo separado del diseñador', () => {
  assert.match(studioHtml, /Estudio de Video/);
  assert.match(studioHtml, /no cambia el diseñador ni el archivo original/i);
  assert.match(studioHtml, /id="sourceImage"/);
  assert.doesNotMatch(designer, /aura-video-studio\.mjs/);
});

test('el costo visible corresponde a Veo 3.1 Fast de ocho segundos', () => {
  assert.equal(VIDEO_DURATION_SECONDS, 8);
  assert.deepEqual(estimateVideoCost(), { usd: 0.64, cop: 2000 });
  assert.match(studioHtml, /Veo 3\.1 Fast/);
  assert.match(studioJs, /window\.confirm\(`/);
});

test('la imagen fuente exige un formato permitido y máximo 20 MB', () => {
  assert.equal(validateSourceImage(null), 'Selecciona una imagen aprobada.');
  assert.equal(validateSourceImage({ type: 'application/pdf', size: 10 }), 'La imagen debe ser PNG, JPG o WebP.');
  assert.equal(validateSourceImage({ type: 'image/png', size: 21 * 1024 * 1024 }), 'La imagen debe pesar máximo 20 MB.');
  assert.equal(validateSourceImage({ type: 'image/jpeg', size: 1024 }), '');
});

test('el prompt protege texto, precio, marca y producto de la pieza aprobada', () => {
  const prompt = buildVideoPrompt({ product: 'Samsung A17', city: 'Corozal', motion: 'zoom' });
  assert.match(prompt, /Samsung A17/);
  assert.match(prompt, /Corozal/);
  assert.match(prompt, /Preserve the product identity, colors, composition, logo, prices, spelling, typography and every visible word exactly as supplied/);
  assert.match(prompt, /Do not add, remove, rewrite, translate or hallucinate text/);
});

test('descarga y aprobación están bloqueadas por el punto de control humano', () => {
  assert.equal(canApproveVideo('pendiente_aprobacion'), true);
  assert.equal(canApproveVideo('aprobado'), false);
  assert.equal(canDownloadVideo('pendiente_aprobacion'), false);
  assert.equal(canDownloadVideo('aprobado'), true);
  assert.match(studioHtml, /Ningún video se publica sin tu aprobación/);
  assert.match(studioHtml, /id="download"[^>]*hidden/);
  assert.match(studioJs, /status: 'pendiente_aprobacion'/);
});

test('los borradores y videos se guardan localmente en IndexedDB', () => {
  assert.match(studioJs, /indexedDB\.open\(DB_NAME, 1\)/);
  assert.match(studioJs, /videoBlob/);
  assert.match(studioJs, /saveDraft\(draft\)/);
});
