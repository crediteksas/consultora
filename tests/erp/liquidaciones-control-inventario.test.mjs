import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sql = await readFile('supabase/migrations/20260904015430_controlar_imei_solo_tiendas_con_inventario.sql', 'utf8');
const html = await readFile('creditek/erp/inventario.html', 'utf8');

test('el control de IMEI se activa explícitamente por tienda y fecha', () => {
  assert.match(sql, /inventario_control_activo boolean not null default false/);
  assert.match(sql, /inventario_control_desde timestamptz/);
  assert.match(sql, /where o\.codigo = 'CK-02'/);
  assert.match(sql, /op\.operation_at >= o\.inventario_control_desde/);
});

test('ver una unidad no activa el control: la carga debe cerrarse explícitamente', () => {
  assert.match(sql, /create or replace function public\.inventario_finalizar_carga_inicial\(p_tienda_codigo text\)/);
  assert.doesNotMatch(sql, /after insert on public\.movimientos/);
  assert.match(sql, /v_perfil\.rol not in \('gerencia','auditoria'\)/);
  assert.match(sql, /No se puede finalizar: la tienda todavía no tiene inventario cargado/);
  assert.match(sql, /set inventario_control_activo = true/);
  assert.match(sql, /'inventario_carga_inicial_finalizada'/);
  assert.match(sql, /revoke all on function public\.inventario_finalizar_carga_inicial\(text\) from public,anon/);
  assert.match(html, /id="btnFinalizarCargaInicial"/);
  assert.match(html, /inventario_finalizar_carga_inicial/);
  assert.match(html, /¿Confirmas que el inventario inicial está completo\?/);
});

test('las tiendas sin carga inicial conservan la novedad sin bloquear la liquidación', () => {
  assert.match(sql, /if not v_control_inventario then/);
  assert.match(sql, /bloquea_aprobacion=false/);
  assert.match(sql, /La tienda todavía no tiene su inventario completo cargado en KORA/);
});

test('Móvil Shopping mantiene la validación estricta por venta, crédito e IMEI', () => {
  assert.match(sql, /join public\.ventas v on v\.id=vi\.venta_id/);
  assert.match(sql, /join public\.creditos c on c\.venta_id=v\.id/);
  assert.match(sql, /join public\.unidades u on u\.id=vi\.unidad_id/);
  assert.match(sql, /'imei_no_existe'.*true/s);
  assert.match(sql, /'imei_duplicado'.*true/s);
});

test('la función privilegiada conserva autorización interna y permisos mínimos', () => {
  assert.match(sql, /tiene_capacidad_aliados\('revisor'\)/);
  assert.match(sql, /revoke all on function public\.aliados_resolver_operaciones_propias\(uuid\) from public,anon/);
  assert.match(sql, /grant execute on function public\.aliados_resolver_operaciones_propias\(uuid\) to authenticated/);
});
