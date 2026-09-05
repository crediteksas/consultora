import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const sql = read('supabase/migrations/20260905044108_cobros_plataformas_independiente.sql');
const app = read('creditek/erp/aliados-tesoreria-app.js');
const html = read('creditek/erp/aliados-tesoreria.html');

test('Cobros no escribe liquidaciones, pagos, tarifas ni saldos existentes', () => {
  const writes = [...sql.matchAll(/\b(?:insert\s+into|update|delete\s+from)\s+public\.([a-z_]+)/gi)];
  assert(writes.length > 0);
  for (const match of writes) assert.match(match[1], /^cobros_/);
  assert.doesNotMatch(sql, /received_from_platform|krediya_flujo_v2|krediya_guardar_tarifa/i);
});

test('RLS limita lectura y RPC valida gerencia activa para las cuatro escrituras', () => {
  for (const table of ['expected', 'deposits', 'allocations', 'events']) {
    assert(sql.includes(`alter table public.cobros_${table} enable row level security`));
    assert(sql.includes(`create policy cobros_lectura on public.cobros_${table}`));
  }
  assert.match(sql, /p\.activo and \(p\.rol='gerencia'/);
  assert.equal((sql.match(/if not cobros_private\.autorizado\(true\)/g) || []).length, 4);
  assert.match(sql, /revoke all on public\.cobros_expected.*from public,anon,authenticated/);
  assert.match(sql, /grant select on public\.cobros_expected/);
  for (const name of ['crear_esperado', 'registrar_abono', 'aplicar_abono', 'anular_registro', 'plataformas_resumen']) {
    const body = sql.split(`create function public.cobros_${name}(`)[1]?.split('$$;')[0];
    assert.match(body || '', /security invoker set search_path=''/);
  }
});

test('aplicar abono bloquea ambos registros, evita cruces y excesos; no borra historial', () => {
  const apply = sql.split('create function cobros_private.aplicar_abono')[1].split('create function cobros_private.anular_registro')[0];
  assert(apply.indexOf('where id=p_deposit_id for update') < apply.indexOf('where id=p_expected_id for update'));
  assert.match(apply, /d\.plataforma<>e\.plataforma/);
  assert.match(apply, /p_importe>d\.importe-usado/);
  assert.match(apply, /p_importe>e\.importe-usado/);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.cobros_/i);
  assert.match(sql, /cobros_abono_no_duplicado/);
  assert.match(sql, /pg_advisory_xact_lock/);
});

test('Tesorería integra cobros y auditoría sin ampliar acceso a salidas', () => {
  assert.match(html, /id="showCobros"/);
  assert.match(html, /id="cobrosContent"/);
  assert.match(html, /id="outgoingContent"/);
  assert.match(html, /cobros-plataformas\.css/);
  assert(html.indexOf('src="cobros-plataformas.js') < html.indexOf('src="aliados-tesoreria-app.js'));
  assert.match(app, /if \(!canViewOutgoing\(\)\) \{[\s\S]*?await cobros\.mount[\s\S]*?return;/);
  assert.match(app, /Base calculada de plataformas · no es ingreso bancario/);
});
