import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '../..');
const source = await readFile(path.join(root, 'creditek/erp/inventario-export.js'), 'utf8');
const html = await readFile(path.join(root, 'creditek/erp/inventario.html'), 'utf8');
const context = { window: {}, Intl, Date };
vm.runInNewContext(source, context);
const exportador = context.window.CreditekInventarioExport;

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
});

test('la tienda no solicita costos internos en las consultas de inventario', () => {
  assert.doesNotMatch(html, /from\('unidades'\)[\s\S]{0,120}\.select\('\*'/);
  assert.doesNotMatch(html, /from\('stock_cantidad'\)[\s\S]{0,120}\.select\('\*'/);
  assert.match(html, /if \(esCentral\(\)\) columnas\.splice\(5, 0, 'costo_remision'\)/);
  assert.match(html, /if \(esCentral\(\)\) columnas\.splice\(4, 0, 'costo_promedio'\)/);
  assert.match(html, /select\('tipo, nota, created_at'\)/);
  assert.match(html, /No fue posible cargar el inventario/);
});
