import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = relative => readFile(path.join(root, relative), 'utf8');

test('los sonidos están desactivados por defecto y se guardan por usuario', async () => {
  const source = await read('design-system/components/kora-product.js');
  assert.match(source, /enabled: false/);
  assert.match(source, /kora_ui_audio:/);
  assert.match(source, /encodeURIComponent\(audioUser\)/);
  assert.match(source, /setUser\(user\)/);
});

test('usa síntesis original, volumen bajo y categorías limitadas', async () => {
  const source = await read('design-system/components/kora-product.js');
  assert.match(source, /AudioContext/);
  assert.match(source, /volume: 0\.18/);
  assert.match(source, /Math\.min\(0\.35/);
  assert.match(source, /interaction/);
  assert.match(source, /success/);
  assert.match(source, /error/);
  assert.doesNotMatch(source, /\.(mp3|wav|m4a)/i);
});

test('Configuración → Experiencia ofrece controles y prueba accesibles', async () => {
  const [source, css, shell] = await Promise.all([
    read('design-system/components/kora-product.js'),
    read('design-system/components/kora-ecosystem.css'),
    read('creditek/erp/sidebar.js'),
  ]);
  assert.match(source, /Configuración · Experiencia/);
  assert.match(source, /Sonidos del sistema/);
  assert.match(source, /data-kora-audio-enabled/);
  assert.match(source, /data-kora-audio-volume/);
  assert.match(source, /data-kora-audio-preview/);
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /event\.key !== 'Tab'/);
  assert.match(css, /\.kora-audio-panel\[hidden\]/);
  assert.match(shell, /data-kora-audio-settings/);
});
