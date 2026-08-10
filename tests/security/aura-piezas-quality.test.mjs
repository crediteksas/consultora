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
  assert.match(frontend, /USER BRIEF — PRIORIDAD MÁXIMA/);
  assert.match(frontend, /Conserva cada objeto, escena, ubicación y restricción explícita/);
  assert.match(frontend, /COLOMBIAN PHONE MARKET VISUAL CONTEXT/);
  assert.match(frontend, /buildMandatoryUserBrief\(\)/);
});

test('cada generación se bloquea desde el primer clic y todas las salidas restauran el estado', () => {
  assert.match(frontend, /let imageGenerationInFlight = false/);
  assert.match(frontend, /function beginImageGeneration\(/);
  assert.match(frontend, /function finishImageGeneration\(/);
  assert.match(frontend, /if \(imageGenerationInFlight\) return false/);
  assert.match(frontend, /requestAnimationFrame\(\(\) => requestAnimationFrame\(resolve\)\)/);
  const start = frontend.indexOf('async function generarImagen');
  const end = frontend.indexOf('// ── COMPOSICIÓN DEL LOGO OFICIAL', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.match(frontend.slice(start, end), /finally \{[\s\S]*finishImageGeneration\(\);/);
});

test('el logo oficial se compone después de cada generación y no se delega al modelo', () => {
  assert.match(frontend, /return await componerLogoSobreImagen\(src\);/);
  assert.match(frontend, /return await componerLogoSobreImagen\('data:image\/png;base64,' \+ b64\);/);
  assert.doesNotMatch(frontend, /integrate it naturally into the composition/);
});

test('Detalle hoy se propone con IA y no queda dominado por un banco fijo de escenas', () => {
  assert.match(frontend, /async function proponerDetalleCreativoConIA\(/);
  assert.match(frontend, /recentCreativeConcepts/);
  assert.doesNotMatch(frontend, /const BANCO_DETALLES\s*=/);
  assert.doesNotMatch(frontend, /una plaza de pueblo con palomas, estilo Corozal o Chinú/);
});

test('el compositor usa un logo sin tarjeta blanca y busca una zona visual segura', () => {
  assert.match(frontend, /function quitarFondoBlancoDelLogo\(/);
  assert.match(frontend, /function elegirUbicacionLogo\(/);
  assert.match(frontend, /function adaptarLogoAFondoOscuro\(/);
  assert.match(frontend, /luminosidadZonaLogo\(ctx, pos\.x, pos\.y, logoAncho, logoAlto\) < 0\.54/);
  assert.match(frontend, /espacio negativo real/);
  assert.doesNotMatch(frontend, /ctx\.fillStyle = 'white'; \/\/ dispara la sombra/);
});

test('GPT Image recibe libertad de dirección gráfica y no una plantilla azul lateral fija', () => {
  assert.match(frontend, /DIRECCIÓN GRÁFICA VARIABLE/);
  assert.match(frontend, /PROHIBIDO usar un gran bloque o degradado azul como plantilla recurrente/);
  assert.doesNotMatch(frontend, /producto en primer plano a la derecha \(55% del ancho\), textos jerarquizados a la izquierda/);
});
