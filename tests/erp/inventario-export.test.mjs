import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '../..');
const source = await readFile(path.join(root, 'creditek/erp/inventario-export.js'), 'utf8');
const html = await readFile(path.join(root, 'creditek/erp/inventario.html'), 'utf8');
const context = { window: {}, Intl, Date };
vm.runInNewContext(source, context);
const exportador = context.window.CreditekInventarioExport;
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const unidad = {
  tienda_actual: 'TIENDA-PRUEBA',
  imei: '000000000000001',
  costo_remision: 100000,
  productos: { nombre: '=MODELO', categoria: 'celular' },
};

test('una tienda exporta inventario sin costos internos', () => {
  const contenido = exportador.exportarCelulares({
    unidades: [unidad], esCentral: false, conteoCiego: false,
    corte: '2026-07-26 08:00:00',
  });
  assert.doesNotMatch(contenido, /Costo interno|100000/);
  assert.match(contenido, /Cantidad sistema/);
});

test('el conteo ciego omite cantidad del sistema y costos', () => {
  const contenido = exportador.exportarCelulares({
    unidades: [unidad], esCentral: true, conteoCiego: true,
    corte: '2026-07-26 08:00:00',
  });
  assert.doesNotMatch(contenido, /Cantidad sistema|Costo interno|100000/);
  assert.match(contenido, /Cantidad física/);
});

test('neutraliza fórmulas en celdas CSV', () => {
  const contenido = exportador.exportarCelulares({
    unidades: [unidad], esCentral: false, conteoCiego: false,
    corte: '2026-07-26 08:00:00',
  });
  assert.match(contenido, /"'=MODELO"/);
  assert.doesNotMatch(contenido, /,"=MODELO"/);
});

test('la pantalla fuerza la tienda del perfil para usuarios no centrales', () => {
  assert.match(
    html,
    /const tiendaPermitida = esCentral\(\) \? tienda : currentPerfil\.tienda_codigo/
  );
  assert.match(html, /btnExportarInventario/);
  assert.match(html, /btnExportarConteo/);
  assert.match(html, /btnDescargarPlantilla/);
  assert.match(html, /Descargar plantilla de carga inicial/);
});

test('genera una plantilla de carga inicial separada del importador', () => {
  const libro = exportador.crearPlantillaCargaInicial({ XLSX, tiendaCodigo: 'STORE-1', tiendaNombre: 'Tienda prueba' });
  assert.deepEqual(libro.SheetNames, ['Instrucciones', 'Inventario inicial']);
  const filas = XLSX.utils.sheet_to_json(libro.Sheets['Inventario inicial'], { header: 1 });
  const instrucciones = XLSX.utils.sheet_to_json(libro.Sheets.Instrucciones, { header: 1 });
  assert.equal(filas[1][0], 'EJ-CEL-001');
  assert.equal(filas[1][1], 'Tienda prueba');
  assert.match(instrucciones.at(-1)[1], /validar e importar/i);
});

test('la tienda solicita el costo real en las consultas de inventario', () => {
  assert.doesNotMatch(html, /from\('unidades'\)[\s\S]{0,120}\.select\('\*'/);
  assert.doesNotMatch(html, /from\('stock_cantidad'\)[\s\S]{0,120}\.select\('\*'/);
  assert.match(html, /columnas\.splice\(5, 0, 'costo_remision'\)/);
  assert.match(html, /columnas\.splice\(4, 0, 'costo_promedio'\)/);
  assert.match(html, /select\('tipo, nota, created_at'\)/);
  assert.match(html, /No fue posible cargar el inventario/);
});

test('el Excel de accesorios contiene columnas separadas y valores numéricos', () => {
  const filas = exportador.filasAccesorios([{
    tienda_codigo: 'TIENDA-PRUEBA',
    cantidad: '8',
    precio_tienda: '7011',
    costo_promedio: '9120',
    productos: { nombre: 'Silicona', categoria: 'Accesorios' },
  }], false);

  assert.deepEqual(
    JSON.parse(JSON.stringify(filas)),
    [{
      Tienda: 'TIENDA-PRUEBA',
      Categoría: 'Accesorios',
      'Referencia o producto': 'Silicona',
      Cantidad: 8,
      'Costo unitario': 9120,
      'Valor total al costo': 72960,
    }]
  );
  assert.equal(typeof filas[0].Cantidad, 'number');
  assert.equal(typeof filas[0]['Costo unitario'], 'number');
});

test('el Excel de celulares respeta el orden obligatorio de columnas', () => {
  const filas = exportador.filasCelulares([{
    tienda_actual: 'TIENDA-PRUEBA',
    imei: '000000000000001',
    precio_tienda: '500000',
    costo_remision: '450000',
    productos: { nombre: 'Equipo A', categoria: 'Celulares' },
  }], false);

  assert.deepEqual(Object.keys(filas[0]), [
    'Tienda', 'Categoría', 'Referencia', 'Cantidad', 'IMEI',
    'Costo unitario', 'Valor total al costo',
  ]);
  assert.equal(filas[0].Cantidad, 1);
  assert.equal(filas[0].IMEI, '000000000000001');
  assert.equal(filas[0]['Costo unitario'], 450000);
});

test('la pantalla muestra costo y no precio de venta', () => {
  assert.match(html, /Costo unitario/);
  assert.match(html, /Valor total al costo/);
  assert.match(html, /Costo interno de compra \(no visible para la tienda\)/);
  assert.match(html, /Precio de venta al cliente en la tienda/);
  assert.doesNotMatch(html, /Precio de venta unitario/);
});

test('genera un libro con filtros, anchos y formato monetario sin mutar datos', () => {
  const stock = [{
    tienda_codigo: 'TIENDA-PRUEBA',
    cantidad: 8,
    precio_tienda: 7011,
    costo_promedio: 4200,
    productos: { nombre: 'Silicona', categoria: 'Accesorios' },
  }];
  const original = structuredClone(stock);
  const libro = exportador.crearLibroInventario({
    XLSX, tipo: 'accesorios', registros: stock, esCentral: false,
    corte: '2026-07-27 15:00:00',
  });
  const hoja = libro.Sheets.Inventario;

  assert.deepEqual(stock, original);
  assert.deepEqual(
    JSON.parse(JSON.stringify(hoja['!autofilter'])),
    { ref: hoja['!ref'] }
  );
  assert.ok(hoja['!cols'].every(columna => columna.wch >= 10));
  assert.equal(hoja.E2.t, 'n');
  assert.equal(hoja.E2.z, '$#,##0.00');
});

test('la pantalla descarga inventario normal como xlsx', () => {
  assert.match(html, /xlsx@0\.18\.5/);
  assert.match(html, /crearLibroInventario/);
  assert.match(html, /XLSX\.writeFile/);
  assert.match(html, /\.xlsx/);
});
