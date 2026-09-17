import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../../supabase/migrations/20260917230803_traslados_recepcion_y_visto_bueno_central.sql', import.meta.url),
  'utf8',
);

function body(name) {
  const start = migration.indexOf(`create or replace function public.${name}`);
  assert.notEqual(start, -1, `No existe ${name}`);
  const end = migration.indexOf('$function$;', start);
  assert.notEqual(end, -1, `No termina ${name}`);
  return migration.slice(start, end);
}

test('la tienda destino solo deja constancia de la recepción física', () => {
  const sql = body('ejecutar_traslado_recepcion');
  assert.match(sql, /rol_actual\(\) is distinct from 'admin_tienda'/);
  assert.match(sql, /tienda_actual\(\) is distinct from v_traslado\.tienda_destino/);
  assert.match(sql, /estado = 'recibido_pendiente_aprobacion'/);
  assert.match(sql, /u\.precio_tienda is distinct from ti\.precio_tienda/);
  assert.doesNotMatch(sql, /insert into public\.cuenta_corriente/);
  assert.doesNotMatch(sql, /set estado = 'disponible'/);
});

test('el visto bueno central mueve inventario y cartera al costo de remisión', () => {
  const sql = body('aprobar_traslado_recepcion');
  assert.match(sql, /not public\.es_central\(\)/);
  assert.match(sql, /v_unidad\.precio_tienda is distinct from v_item\.precio_tienda/);
  assert.match(sql, /set estado = 'disponible',[\s\S]*tienda_actual = v_traslado\.tienda_destino/);
  assert.match(sql, /v_total := v_total \+ \(v_item\.precio_tienda \* v_item\.cantidad\)/);
  assert.match(sql, /v_traslado\.tienda_origen, 'abono'/);
  assert.match(sql, /v_traslado\.tienda_destino, 'cargo'/);
  assert.match(sql, /estado = 'cerrado'/);
  assert.match(sql, /aprobado_por = auth\.uid\(\)/);
});

test('anular antes del visto bueno restaura inventario sin inventar un cargo', () => {
  const sql = body('anular_traslado');
  assert.match(sql, /'despachado', 'recibido_pendiente_aprobacion'/);
  assert.match(sql, /tienda_actual = v_traslado\.tienda_origen/);
  assert.doesNotMatch(sql, /insert into public\.cuenta_corriente/);
});

test('los RPC sensibles no conservan ejecución pública', () => {
  assert.match(migration, /revoke all on function public\.ejecutar_traslado_recepcion\(uuid\) from public, anon/);
  assert.match(migration, /revoke all on function public\.aprobar_traslado_recepcion\(uuid\) from public, anon/);
  assert.match(migration, /grant execute on function public\.aprobar_traslado_recepcion\(uuid\) to authenticated/);
});
