import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const frontend = await readFile(new URL('../../creditek/agentes/creditek-agente-redes.html', import.meta.url), 'utf8');

test('Piezas comerciales usa reglas creativas, no bancos de titulares repetibles', () => {
  assert.match(frontend, /function buildCreativeStyleDirection\(/);
  assert.match(frontend, /function buildRecentHeadlinePenalty\(/);
  assert.doesNotMatch(frontend, /Ombe, aquí empiezas tu trámite/);
  assert.doesNotMatch(frontend, /Llave, ese celular sí se puede/);
  assert.doesNotMatch(frontend, /Sin banco\. Con la cédula alcanza/);
});

test('el brief explícito del usuario tiene prioridad y las referencias se usan sin copiar terceros', () => {
  assert.match(frontend, /function buildMandatoryUserBrief\(/);
  assert.match(frontend, /USER BRIEF — HIGHEST PRIORITY/);
  assert.match(frontend, /Every explicit object, scene, location and constraint in this brief must be visibly present/);
  assert.match(frontend, /MARKET REFERENCES — INFLUENCE, DO NOT COPY/);
  assert.match(frontend, /buildMandatoryUserBrief\(\)/);
});

test('cada generación se bloquea desde el primer clic y todas las salidas restauran el estado', () => {
  assert.match(frontend, /let imageGenerationInFlight = false/);
  assert.match(frontend, /function beginImageGeneration\(/);
  assert.match(frontend, /function finishImageGeneration\(/);
  assert.match(frontend, /if \(imageGenerationInFlight\) return false/);
  assert.match(frontend, /finally \{\s*finishImageGeneration\(\);/);
});

test('el logo oficial se compone después de cada generación y no se delega al modelo', () => {
  assert.match(frontend, /return await componerLogoSobreImagen\(src\);/);
  assert.match(frontend, /return await componerLogoSobreImagen\('data:image\/png;base64,' \+ b64\);/);
  assert.doesNotMatch(frontend, /integrate it naturally into the composition/);
});
