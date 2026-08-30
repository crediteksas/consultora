import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const code = await readFile(new URL('../../google-apps-script/convenios/Codigo.gs', import.meta.url), 'utf8');

test('PayJoy genera M3 únicamente cuando fue solicitado', () => {
  assert.match(code, /plataformas\.indexOf\('payjoy'\) !== -1[\s\S]*generarExcelM3/);
});

test('Krediya genera un Excel de cuatro hojas solo cuando fue solicitado', () => {
  assert.match(code, /plataformas\.indexOf\('krediya'\) !== -1/);
  for (const sheet of ['ALIADO', 'TIENDA', 'VENDEDORES', 'CATALOGO']) {
    assert.match(code, new RegExp(`(?:setName|insertSheet)\\('${sheet}'\\)`));
  }
});

test('el archivo Krediya se adjunta al correo interno y el temporal se elimina', () => {
  assert.match(code, /opcionesCorreo\.attachments = \[formatoKrediya\]/);
  assert.match(code, /GmailApp\.sendEmail\(CORREO_CREDITEK/);
  assert.match(code, /finally \{\s*tempFile\.setTrashed\(true\)/);
});

test('el número bancario usa la misma llave enviada por el formulario', () => {
  assert.match(code, /cuenta\.numeroCuenta \|\| ''/);
  assert.doesNotMatch(code, /cuenta\.numero \|\| ''/);
});

test('el backend acepta solamente las cuatro plataformas conocidas', () => {
  assert.match(code, /\['payjoy', 'alo_credit', 'addi', 'krediya'\]/);
});
