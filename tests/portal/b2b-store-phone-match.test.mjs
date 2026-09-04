import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const sourcePath = new URL('../../creditek/portal/Code.gs', import.meta.url);

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

test('el actualizador conserva los celulares vigentes de Sofía', async () => {
  const source = await readFile(sourcePath, 'utf8');

  assert.match(source, /'CRD-COR-02': '573113052878'/);
  assert.match(source, /'CRD-COR-03': '573205417745'/);
  assert.match(source, /'CRD-CHI-01': '573234052533'/);
  assert.match(source, /'CRD-CHI-02': '573239176227'/);
  assert.match(source, /'CRD-CHI-03': '573207235872'/);
  assert.match(source, /'CRD-CIE-01': '573021297349'/);
  assert.match(source, /'CRD-CIE-02': '573006177114'/);
  assert.doesNotMatch(source, /578001608332/);
});
