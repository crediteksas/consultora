import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL('../../supabase/migrations/20260910200436_creditos_cartera_nova_ready.sql', import.meta.url), 'utf8');
const andreaPermission = await readFile(new URL('../../supabase/migrations/20260910204442_cartera_permiso_andrea.sql', import.meta.url), 'utf8');
const html = await readFile(new URL('../../creditek/erp/creditos-cartera.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../../creditek/erp/creditos-cartera-app.js', import.meta.url), 'utf8');
const sidebar = await readFile(new URL('../../creditek/erp/sidebar.js', import.meta.url), 'utf8');

test('Nova queda preparada pero no bloquea pagos actuales', () => {
  assert.match(migration,/nova_enforcement_enabled boolean not null default false/);
  assert.match(migration,/if not coalesce\(v_enabled,false\) then return new/);
  assert.match(migration,/nova_enforcement_from/);
  assert.match(migration,/pre_nova boolean not null default true/);
});

test('separa pago al aliado, cuotas del cliente y gestión Cobra', () => {
  assert.match(migration,/create table public\.credit_portfolio_obligations/);
  assert.match(migration,/create table public\.credit_repayments/);
  assert.match(migration,/create table public\.credit_collection_events/);
  assert.match(migration,/No representa cuentas por pagar a aliados/);
  assert.match(migration,/payment_orders_create_credit_portfolio/);
  assert.match(migration,/clientes_link_credit_portfolio/);
});

test('el puente de Nova es de servicio y no queda expuesto al navegador', () => {
  assert.match(migration,/revoke all on function public\.nova_sincronizar_cliente_aura[^;]+from public, anon, authenticated/s);
  assert.match(migration,/grant execute on function public\.nova_sincronizar_cliente_aura[^;]+to service_role/s);
  assert.match(migration,/revoke all on function public\.nova_registrar_decision[^;]+from public, anon, authenticated/s);
  assert.match(migration,/grant execute on function public\.nova_registrar_decision[^;]+to service_role/s);
});

test('todas las tablas expuestas tienen RLS y la vista respeta al invocador', () => {
  for (const table of ['credit_portfolio_settings','credit_customer_links','nova_authorizations','credit_portfolio_obligations','credit_repayments','credit_collection_events']) {
    assert.match(migration,new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(migration,/with \(security_invoker=true\)/);
  assert.match(migration,/revoke all on public\.creditos_cartera_operaciones from public, anon/);
});

test('KORA ofrece las cuatro vistas operativas sin habilitar Nova desde la interfaz', () => {
  for (const label of ['Cartera','Autorizaciones Nova','Gestión Cobra','Desempeño de crédito']) assert.match(html,new RegExp(label));
  assert.match(app,/creditos_cartera_registrar_pago_cliente/);
  assert.match(app,/creditos_cartera_registrar_gestion/);
  assert.match(app,/function loadAllPortfolio/);
  assert.match(app,/\.range\(from,from\+pageSize-1\)/);
  assert.doesNotMatch(app,/creditos_cartera_configurar_nova/);
});

test('Andrea recibe capacidad explícita para consultar y gestionar Cartera sin ampliar su rol', () => {
  assert.match(andreaPermission,/lower\(u\.email\) = 'andrea\.velez@crediteksas\.com'/);
  assert.match(andreaPermission,/select p\.id, 'manage', true/);
  assert.match(andreaPermission,/create or replace function public\.tiene_capacidad_cartera/);
  assert.match(andreaPermission,/operator\.capability = 'manage'/);
  assert.match(andreaPermission,/creditos_cartera_puede_gestionar/);
  assert.doesNotMatch(andreaPermission,/update public\.perfiles[\s\S]+set rol/i);
  assert.match(sidebar,/tiene_capacidad_cartera/);
  assert.match(sidebar,/perfil\.es_gestor_cartera = puedeGestionarCartera/);
  assert.match(app,/profile\?\.es_gestor_cartera === true/);
});
