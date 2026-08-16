import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(
  new URL('../../creditek/erp/ventas.html', import.meta.url),
  'utf8',
);

test('ventas carga conjuntamente los tres motores activos', () => {
  assert.doesNotMatch(html, /^(?:<<<<<<<|=======|>>>>>>>)/m);
  assert.match(html, /<script src="ventas-domain\.js"><\/script>/);
  assert.match(html, /<script src="ventas-utilidad-domain\.js"><\/script>/);
  assert.match(html, /<script src="caja-piloto-domain\.js"><\/script>/);
  assert.match(html, /const ventasDomain = window\.CreditekVentasDomain/);
  assert.match(html, /const ventasUtilidad = window\.CreditekVentasUtilidad/);
  assert.match(html, /const ventasPagos = window\.CreditekCajaPiloto/);
});

test('listado consulta todos los campos aprobados de main y KORA', () => {
  assert.match(
    html,
    /\.select\('\*, clientes\(nombre_completo,cedula\), origen:tienda_codigo\(nombre\), vendedor_perfil:vendedor\(nombre\), creditos\(financiera\), venta_items\(cantidad, precio_venta, unidades\(imei\), productos\(nombre\)\)'\)/,
  );
});

test('cada línea conserva su valor propio y abre el detalle de la venta', () => {
  assert.match(html, /const items = v\.venta_items\?\.length \? v\.venta_items : \[null\]/);
  assert.match(html, /it\s*\? Number\(it\.precio_venta \|\| 0\) \* Number\(it\.cantidad \|\| 0\)\s*:\s*Number\(v\.total \|\| 0\)/);
  assert.match(html, /<tr data-id="\$\{v\.id\}" tabindex="0"/);
  assert.match(html, /abrirDetalleVenta\(row\.dataset\.id\)/);
  assert.match(html, /clientes\?\.cedula/);
  assert.match(html, /CC \$\{escapeHtml\(v\.clientes\.cedula\)\}/);
});
