import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/20260924205132_b2b_client_payment_destinations.sql', import.meta.url), 'utf8');
const cartera = readFileSync(new URL('../../creditek/erp/cartera-b2b.html', import.meta.url), 'utf8');
const proveedores = readFileSync(new URL('../../creditek/erp/proveedores.html', import.meta.url), 'utf8');

test('abono B2B exige elegir un único destino y conserva idempotencia', () => {
  assert.match(migration, /destino in \('creditek','proveedor'\)/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /El identificador ya corresponde a otro abono/);
  assert.match(migration, /El abono supera la deuda actual del cliente/);
  assert.match(migration, /soporte_path text not null/);
});

test('consignación directa aplica FIFO a proveedor y no acredita Tesorería', () => {
  const block = migration.slice(migration.indexOf("if p_destino='proveedor' then\n    v_restante:="), migration.indexOf("  insert into public.audit_log", migration.indexOf("if p_destino='proveedor' then\n    v_restante:=")));
  assert.match(block, /order by fecha,created_at,id for update/);
  assert.match(block, /registrar_pago_proveedor/);
  assert.match(block, /aplicaciones_abono_cliente_b2b_proveedor/);
  assert.doesNotMatch(block, /tesoreria_aplicar_saldo|insert into public\.treasury_movements/);
});

test('consignación a Creditek acredita B2B y ambas rutas reducen cartera una vez', () => {
  assert.match(migration, /insert into public\.movimientos_cartera[\s\S]*'credito',p_monto/);
  assert.match(migration, /if p_destino='creditek' then[\s\S]*tesoreria_aplicar_saldo\('b2b','credit',p_monto/);
  assert.match(migration, /if p_efecto='credito' then raise exception/);
  assert.match(cartera, /rpc\(rpc,params\)/);
  assert.match(cartera, /registrar_abono_cliente_b2b_destino/);
});

test('pago con saldo B2B baja Tesorería y factura dentro de la misma función', () => {
  const block = migration.slice(migration.indexOf('create function public.registrar_pago_proveedor_desde_saldo_b2b'), migration.indexOf('-- La ruta antigua'));
  assert.match(block, /tesoreria_aplicar_saldo\('b2b','debit',p_monto/);
  assert.match(block, /registrar_pago_proveedor\(p_factura_id,p_monto/);
  assert.match(block, /if p_monto>v_factura.saldo then/);
  assert.match(block, /if exists\(select 1 from public\.pagos_proveedor where idempotency_key=p_id\)/);
  assert.match(proveedores, /SB\.rpc\('registrar_pago_proveedor_desde_saldo_b2b'/);
  assert.match(proveedores, /SB\.rpc\('registrar_pago_proveedor'/);
});
