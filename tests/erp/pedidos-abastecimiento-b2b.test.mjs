import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const [page, access, sidebar, aura, migration, extras] = await Promise.all([
  read('creditek/erp/pedidos-b2b.html'),
  read('creditek/erp/kora-access-control.js'),
  read('creditek/erp/sidebar.js'),
  read('creditek/agentes/index.html'),
  read('supabase/migrations/20260903195442_flujo_pedidos_compras_b2b_kora.sql'),
  read('supabase/migrations/20260903201111_linea_adicional_recepcion_b2b.sql'),
]);

test('tiendas crean pedidos dentro de KORA y el acceso queda por tienda', () => {
  assert.match(access, /'pedidos-b2b\.html'/);
  assert.match(page, /crear_pedido_b2b/);
  assert.match(migration, /tienda_codigo = \(select tienda_codigo from public\.perfiles/);
});

test('Gestión convierte pedidos en órdenes y las envía sin aprobación adicional', () => {
  assert.match(sidebar, /Pedidos y abastecimiento/);
  assert.match(page, /crear_orden_compra_b2b/);
  assert.match(page, /enviar_orden_compra_b2b/);
  assert.match(migration, /Solo Gestión o Gerencia pueden enviar órdenes/);
});

test('la recepción exige soporte y crea factura, inventario y remisiones', () => {
  assert.match(migration, /La factura o soporte del proveedor es obligatorio/);
  assert.match(migration, /registrar_compra_proveedor_operativa/);
  assert.match(migration, /insert into public\.remisiones/);
  assert.match(page, /accept="\.pdf,image\/jpeg,image\/png"/);
});

test('los cambios de costo y precio exigen motivo y conservan auditoría', () => {
  assert.match(migration, /orden_compra_cambios/);
  assert.match(migration, /'costo_compra'/);
  assert.match(migration, /'precio_tienda'/);
  assert.match(migration, /Explica la diferencia de cantidad, costo o precio/);
});

test('Gestión puede aceptar referencias adicionales con motivo y tienda destino', () => {
  assert.match(extras, /agregar_linea_adicional_orden_b2b/);
  assert.match(extras, /referencia_adicional/);
  assert.match(extras, /El motivo de la adición es obligatorio/);
  assert.match(page, /El proveedor entregó una referencia adicional/);
});

test('AURA deja de mostrar el Portal B2B heredado', () => {
  assert.doesNotMatch(aura, /<span class="nav-label">Portal B2B<\/span>/);
  assert.doesNotMatch(aura, /<div class="tool-name">Portal de Pedidos B2B<\/div>/);
});

test('la orden imprimible contiene membrete y trazabilidad', () => {
  assert.match(page, /CREDITEK S\.A\.S\./);
  assert.match(page, /creditek-logo\.png/);
  assert.match(page, /ORDEN DE COMPRA/);
  assert.match(page, /Trazabilidad digital/);
});
