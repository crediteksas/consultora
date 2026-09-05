import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const sourcePath = new URL('../../creditek/portal/Code.gs', import.meta.url);
const portalPath = new URL('../../creditek/portal/index.html', import.meta.url);

const extractFunction = (source, name) => {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `No existe ${name}`);
  let depth = 0;
  let opened = false;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === '{') {
      depth += 1;
      opened = true;
    } else if (source[index] === '}') {
      depth -= 1;
      if (opened && depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`No fue posible extraer ${name}`);
};

test('la búsqueda de teléfonos ignora tildes y mayúsculas en tienda y ciudad', async () => {
  const source = await readFile(sourcePath, 'utf8');
  const context = {};
  vm.runInNewContext(extractFunction(source, 'normalizarClaveTienda_'), context);

  assert.equal(context.normalizarClaveTienda_('Móvil Shoping'), 'movil shoping');
  assert.equal(context.normalizarClaveTienda_('Sonivox Chinú'), 'sonivox chinu');
  assert.equal(context.normalizarClaveTienda_('CIÉNAGA DE ORO'), 'cienaga de oro');
});

test('la configuración inicial y el actualizador conservan los 10 teléfonos de Sofía', async () => {
  const source = await readFile(sourcePath, 'utf8');
  const telefonos = {
    'CRD-TOL-01': '573112889758',
    'CRD-COR-01': '573014991556',
    'CRD-COR-02': '573113052878',
    'CRD-COR-03': '573205417745',
    'CRD-CHI-01': '573234052533',
    'CRD-CHI-02': '573239176227',
    'CRD-CHI-03': '573207235872',
    'CRD-CIE-01': '573021297349',
    'CRD-CIE-02': '573006177114',
    'CRD-COV-01': '573507098377',
  };

  for (const [id, telefono] of Object.entries(telefonos)) {
    const coincidencias = source.match(new RegExp(`'${id}'[^\\n]*'${telefono}'`, 'g')) || [];
    assert.equal(coincidencias.length, 2, `${id} debe coincidir en inicialización y actualización`);
  }
  assert.doesNotMatch(source, /578001608332|573008529877/);
});

test('el portal apunta al Apps Script verificado en producción', async () => {
  const portal = await readFile(portalPath, 'utf8');
  assert.match(portal, /AKfycbxB7NBPbHhbkfy6niqicIQ6z2odUDDcCCF6iW2iaFWMk8ByyLws6s5e-yxLQf-WV8_7\/exec/);
  assert.doesNotMatch(portal, /AKfycbxanckSp6EwHLjSE3neSC3E6aSxAPJbQA2rTLe-foV_8w8LszngF3nabDAwOSPD3CER/);
});

test('WhatsApp obtiene su credencial desde las propiedades seguras del Apps Script', async () => {
  const source = await readFile(sourcePath, 'utf8');

  assert.match(source, /PropertiesService\.getScriptProperties\(\)\.getProperty\(CONFIG\.WA_ACCESS_TOKEN_PROPERTY\)/);
  assert.match(source, /'Authorization': 'Bearer ' \+ tokenWhatsApp/);
  assert.doesNotMatch(source, /WA_ACCESS_TOKEN:\s*['"][A-Za-z0-9]/);
  assert.doesNotMatch(source, /CONFIG\.WA_ACCESS_TOKEN\b/);
});
