import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const file = new URL('../../creditek/agentes/creditek-agente-calendario.html', import.meta.url);
const html = readFileSync(file, 'utf8');

test('el calendario genera historias todos los días y permite dos cadencias', () => {
  assert.match(html, /id="cadencia"/);
  assert.match(html, /historias para TODOS los días/);
  assert.match(html, /historias \+ Reel todos los días/);
});

test('cada pieza incluye el contrato de producción de Reel e Historias', () => {
  for (const field of ['"formato"', '"objetivo"', '"gancho"', '"guion"', '"escenas"', '"textoPantalla"', '"duracion"', '"hora"', '"cta"', '"historias"']) {
    assert.ok(html.includes(field), `falta ${field}`);
  }
});

test('las guardas bloquean promesas y testimonios no verificados', () => {
  assert.match(html, /PATRONES_RIESGO/);
  assert.match(html, /Testimonio sin fuente y consentimiento verificados/);
  assert.match(html, /Corrige el contenido primero/);
  assert.match(html, /No afirmes valores universales/);
});

test('el calendario detecta regeneraciones antes de crear duplicados', () => {
  assert.match(html, /confirmarRegeneracion/);
  assert.match(html, /Ya existen piezas guardadas para esta quincena/);
});

test('la fecha inicial usa el mes y la quincena actuales', () => {
  assert.match(html, /const hoy = new Date\(\)/);
  assert.match(html, /hoy\.getDate\(\) >= 16/);
});
