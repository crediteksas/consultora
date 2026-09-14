import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/20260914232132_corregir_destino_remision_despachada.sql', import.meta.url), 'utf8');

test('el cambio de destino solo aplica antes de recibir y conserva inventario', () => {
  assert.match(migration, /estado <> 'despachada'/);
  assert.match(migration, /recibida_at is not null/);
  assert.match(migration, /tipo = 'propia'/);
  assert.match(migration, /activo = true/);
  assert.match(migration, /p_revision <> v_remision\.revision/);
  assert.match(migration, /insert into remisiones_edicion_private\.historial/);
  assert.match(migration, /set tienda_codigo = v_destino/);
  assert.doesNotMatch(migration, /update public\.(?:unidades|stock_cantidad|movimientos)/);
  assert.doesNotMatch(migration, /delete from public\./);
});

test('el RPC no queda expuesto a usuarios anónimos', () => {
  assert.match(migration, /security invoker/);
  assert.match(migration, /revoke all on function public\.corregir_destino_remision_despachada[\s\S]*from public, anon/);
  assert.match(migration, /grant execute on function public\.corregir_destino_remision_despachada[\s\S]*to authenticated/);
});
