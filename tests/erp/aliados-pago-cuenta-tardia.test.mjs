import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../../supabase/migrations/20260904165000_completar_pago_aliado_tras_registrar_cuenta.sql',import.meta.url),'utf8');

test('crea la orden faltante cuando la cuenta se registra despues del calculo',()=>{
  assert.match(sql,/not exists \([\s\S]*pi\.operation_id=op\.id[\s\S]*pago_aliado/);
  assert.match(sql,/insert into public\.payment_orders/);
  assert.match(sql,/on conflict\(liquidation_id,beneficiary_id\) do update/);
  assert.match(sql,/insert into public\.payment_items/);
});

test('la recuperacion es idempotente y no modifica liquidaciones aprobadas',()=>{
  assert.match(sql,/create unique index if not exists payment_items_operacion_concepto_sin_bono_uidx/);
  assert.match(sql,/where bonus_id is null/);
  assert.match(sql,/l\.frozen_at is null/);
  assert.match(sql,/l\.estado in \('calculada','revisada','con_novedades'\)/);
  assert.match(sql,/on conflict do nothing/);
});
