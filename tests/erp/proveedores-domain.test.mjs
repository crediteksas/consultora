import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '../..');
const source = await readFile(path.join(root, 'creditek/erp/proveedores-domain.js'), 'utf8');
const proveedoresHtml = await readFile(path.join(root, 'creditek/erp/proveedores.html'), 'utf8');
const compraProveedorHtml = await readFile(path.join(root, 'creditek/erp/compra-proveedor.html'), 'utf8');
const sidebarJs = await readFile(path.join(root, 'creditek/erp/sidebar.js'), 'utf8');
const context = { window: {} };
vm.runInNewContext(source, context);
const proveedores = context.window.CreditekProveedoresDomain;

test('normaliza factura, líneas y pagos sin alterar sus totales', () => {
  const detalle = proveedores.normalizarDetalle({
    factura: { id: 'f1', total: '150000', saldo: '50000' },
    lineas: [
      { cantidad: 2, costo_unitario: '50000' },
      { cantidad: 1, costo_unitario: '50000' },
    ],
    pagos: [{ monto: '100000' }],
  });

  assert.equal(detalle.factura.total, 150000);
  assert.equal(detalle.factura.saldo, 50000);
  assert.equal(detalle.totalLineas, 150000);
  assert.equal(detalle.totalPagado, 100000);
});

test('valida un pago positivo que no supera el saldo', () => {
  const pago = proveedores.validarPago({
    monto: '25000',
    saldo: 50000,
    fecha: '2026-07-27',
  });
  assert.equal(pago.monto, 25000);
  assert.equal(pago.fecha, '2026-07-27');
  assert.throws(
    () => proveedores.validarPago({ monto: 50001, saldo: 50000, fecha: '2026-07-27' }),
    /supera el saldo/
  );
  assert.throws(
    () => proveedores.validarPago({ monto: 0, saldo: 50000, fecha: '2026-07-27' }),
    /mayor que cero/
  );
});

test('conserva el día contable de una fecha SQL en la zona local', () => {
  assert.equal(
    proveedores.normalizarFechaLocal('2026-07-27'),
    '2026-07-27T00:00:00'
  );
  assert.equal(
    proveedores.normalizarFechaLocal('2026-07-27T15:30:00Z'),
    '2026-07-27T15:30:00Z'
  );
});

test('genera la fecha del formulario con el calendario local', () => {
  assert.equal(
    proveedores.fechaCalendarioLocal(new Date(2026, 6, 27, 23, 30)),
    '2026-07-27'
  );
});

test('resume la cartera filtrada sin duplicar facturas', () => {
  const resumen = proveedores.resumirCartera({
    facturas: [
      { id: 'f1', proveedor_id: 'p1', total: 100000, saldo: 40000, fecha_vencimiento: '2026-07-30' },
      { id: 'f1', proveedor_id: 'p1', total: 100000, saldo: 40000, fecha_vencimiento: '2026-07-30' },
      { id: 'f2', proveedor_id: 'p1', total: 90000, saldo: 30000, fecha_vencimiento: '2026-07-20' },
      { id: 'f3', proveedor_id: 'p1', total: 80000, saldo: 0, fecha_vencimiento: '2026-07-10' },
      { id: 'f4', proveedor_id: 'p2', total: 70000, saldo: 10000, fecha_vencimiento: '2026-07-31' },
    ],
    proveedorIds: ['p1'],
    hoy: '2026-07-27',
  });

  assert.deepEqual(JSON.parse(JSON.stringify(resumen)), {
    totalPorPagar: { cantidad: 2, valor: 70000 },
    porVencer: { cantidad: 1, valor: 40000 },
    vencidas: { cantidad: 1, valor: 30000 },
    pagadas: { cantidad: 1, valor: 80000 },
    sinVencimiento: { cantidad: 0, valor: 0 },
  });
});

test('separa facturas pendientes sin vencimiento sin inventar su estado', () => {
  const resumen = proveedores.resumirCartera({
    facturas: [{ id: 'f1', proveedor_id: 'p1', total: 50000, saldo: 50000, fecha_vencimiento: null }],
    proveedorIds: ['p1'],
    hoy: '2026-07-27',
  });

  assert.equal(resumen.totalPorPagar.valor, 50000);
  assert.equal(resumen.porVencer.cantidad, 0);
  assert.equal(resumen.vencidas.cantidad, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(resumen.sinVencimiento)), { cantidad: 1, valor: 50000 });
});

test('la pantalla integra detalle y pago de cuentas por pagar', () => {
  assert.match(proveedoresHtml, /proveedores-domain\.js/);
  assert.match(proveedoresHtml, /obtener_detalle_factura_proveedor/);
  assert.match(proveedoresHtml, /registrar_pago_proveedor/);
  assert.match(proveedoresHtml, /data-detalle-factura/);
  assert.match(proveedoresHtml, /Registrar pago/);
});

test('el módulo se presenta como Cartera de Proveedores', () => {
  assert.match(proveedoresHtml, /<title>Cartera de Proveedores · Creditek<\/title>/);
  assert.match(proveedoresHtml, />Cartera de Proveedores<\/h1>/);
  assert.match(sidebarJs, /label: 'Cartera de Proveedores', href: 'proveedores\.html'/);
});

test('la interfaz incluye las cuatro tarjetas y captura el vencimiento al comprar', () => {
  assert.match(proveedoresHtml, /id="card-total-por-pagar"/);
  assert.match(proveedoresHtml, /id="card-por-vencer"/);
  assert.match(proveedoresHtml, /id="card-vencidas"/);
  assert.match(proveedoresHtml, /id="card-pagadas"/);
  assert.match(compraProveedorHtml, /id="fecha-vencimiento"/);
  assert.match(compraProveedorHtml, /registrar_compra_proveedor_con_vencimiento/);
});
