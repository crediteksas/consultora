import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '../..');
const catalogo = await readFile(path.join(root, 'creditek/erp/catalogo.html'), 'utf8');
const permisosSource = await readFile(path.join(root, 'creditek/erp/producto-foto.js'), 'utf8');
const context = { window: {} };
vm.runInNewContext(permisosSource, context);
const permisos = context.window.CreditekProductoFoto;

test('auditoria puede crear productos y el formulario muestra Código', () => {
  assert.equal(permisos.permisosCatalogo('auditoria').puedeEditarProducto, true);
  assert.match(catalogo, /<label>Código<\/label><input type="text" id="prodCodigo"/);
  assert.match(catalogo, /document\.getElementById\('prodCodigo'\)\.value\.trim\(\)/);
});

test('catálogo valida el código antes de insertar', () => {
  const validacion = catalogo.indexOf('productoFoto.buscarProductoPorCodigo');
  const insercion = catalogo.indexOf("sb.from('productos').insert(payload)");
  assert.ok(validacion >= 0 && validacion < insercion);
  assert.match(catalogo, /Ya existe un producto con ese código\./);
});

test('acepta un código nuevo y rechaza uno existente sin confundir la edición', async () => {
  const consultas = [];
  const crearSb = resultado => ({
    from(tabla) {
      const consulta = { tabla, filtros: [] };
      consultas.push(consulta);
      const cadena = {
        select() { return cadena; },
        eq(campo, valor) { consulta.filtros.push(['eq', campo, valor]); return cadena; },
        neq(campo, valor) { consulta.filtros.push(['neq', campo, valor]); return cadena; },
        async maybeSingle() { return { data: resultado, error: null }; },
      };
      return cadena;
    },
  });

  assert.equal(await permisos.buscarProductoPorCodigo({ sb: crearSb(null), codigo: 'NUEVO-01' }), null);
  assert.deepEqual(
    await permisos.buscarProductoPorCodigo({ sb: crearSb({ id: 'existente' }), codigo: 'DUP-01' }),
    { id: 'existente' }
  );
  await permisos.buscarProductoPorCodigo({ sb: crearSb(null), codigo: 'EDIT-01', productoId: 'actual' });
  assert.deepEqual(consultas.at(-1).filtros, [
    ['eq', 'codigo', 'EDIT-01'],
    ['neq', 'id', 'actual'],
  ]);
});

test('los permisos de los demás roles no cambian', () => {
  assert.equal(permisos.permisosCatalogo('gerencia').puedeEditarProducto, true);
  assert.equal(permisos.permisosCatalogo('admin_tienda').puedeEditarProducto, false);
  assert.equal(permisos.permisosCatalogo('asesor').puedeEditarProducto, false);
});
