import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../../creditek/convenios/index.html', import.meta.url), 'utf8');

test('conserva el formulario público y agrega a Marco como gestor', () => {
  assert.match(html, /value='Marco Marín'/);
  assert.doesNotMatch(html, /<input[^>]+type=["']password["']/i);
});

test('captura por separado nombres y apellidos del representante', () => {
  assert.match(html, /id="nombresRepresentante"[^>]*required/);
  assert.match(html, /id="apellidosRepresentante"[^>]*required/);
});

test('no solicita responsables internos de Creditek al aliado', () => {
  assert.doesNotMatch(html, /id="mismoComercial"/);
  assert.doesNotMatch(html, /id="mismoAdministrativo"/);
  assert.doesNotMatch(html, /responsableComercial:/);
  assert.doesNotMatch(html, /responsableAdministrativo:/);
});

test('completa los campos de tienda exigidos por Krediya', () => {
  assert.match(html, /id="codigoPostal"[^>]*required/);
  assert.match(html, /id="contactoTiendaIgual" checked/);
  assert.match(html, /codigoPostal:document\.getElementById\('codigoPostal'\)/);
});

test('captura la cuenta bancaria del aliado para KORA', () => {
  assert.match(html, /id="titularCuentaEsRepresentante" checked/);
  assert.match(html, /id="bancoAliado"[^>]*required/);
  assert.match(html, /id="tipoCuentaAliado"[^>]*required/);
  assert.match(html, /id="numeroCuentaAliado"[^>]*required/);
  assert.match(html, /cuentaBancaria:\{/);
  assert.match(html, /beneficiario:/);
  assert.match(html, /identificacion:/);
});

test('permite tomar fotos o adjuntar archivos existentes', () => {
  assert.doesNotMatch(html, /capture="environment"/);
  assert.match(html, /accept="image\/\*,\.pdf"/);
});
