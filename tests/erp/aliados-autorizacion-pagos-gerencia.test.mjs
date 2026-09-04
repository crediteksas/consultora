import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = 'supabase/migrations/20260903161914_restringir_autorizacion_pagos_oscar.sql';
const eventMigration = 'supabase/migrations/20260903165524_permitir_evento_autorizacion_pago.sql';
const approvalGateMigration = 'supabase/migrations/20260903230000_bloquear_pagos_sin_liquidacion_aprobada.sql';

test('solo el aprobador activo de Gerencia puede autorizar pagos', async () => {
  const sql = await readFile(migration, 'utf8');
  assert.match(sql, /create or replace function public\.es_autorizador_pagos/);
  assert.match(sql, /o\.capacidad = 'aprobador'/);
  assert.match(sql, /p\.rol = 'gerencia'/);
  assert.match(sql, /aliados_un_solo_aprobador_activo_idx/);
  assert.match(sql, /Solo Oscar Pacheco, desde su usuario de Gerencia, puede autorizar pagos/);
});

test('un pago no puede ejecutarse sin autorización previa trazable', async () => {
  const sql = await readFile(migration, 'utf8');
  assert.match(sql, /add column if not exists authorized_by/);
  assert.match(sql, /add column if not exists authorized_at/);
  assert.match(sql, /p_estado='pagado'[\s\S]*v\.authorized_by is null or v\.authorized_at is null/);
  assert.match(sql, /El pago requiere autorización previa de Oscar Pacheco/);
  assert.match(sql, /'aliados_pago_autorizado_gerencia'/);
});

test('las programaciones anteriores solo se reconocen si las hizo el aprobador', async () => {
  const sql = await readFile(migration, 'utf8');
  assert.match(sql, /a\.accion = 'aliados_pago_programado'/);
  assert.match(sql, /o\.capacidad = 'aprobador'/);
  assert.match(sql, /po\.authorized_by is null/);
});

test('Tesorería muestra pagos completos sin tablas partidas', async () => {
  const [html, app] = await Promise.all([
    readFile('creditek/erp/aliados-tesoreria.html', 'utf8'),
    readFile('creditek/erp/aliados-tesoreria-app.js', 'utf8'),
  ]);
  assert.match(html, /payment-card__grid/);
  assert.match(html, /Detalle completo del pago/);
  assert.match(app, /Ver detalle completo/);
  assert.match(app, /Número de cuenta/);
  assert.match(app, /Autorización de Gerencia/);
  assert.match(app, /Esperando autorización de Oscar/);
  assert.match(app, /aliados_autorizar_pago/);
  assert.doesNotMatch(app, /table\(\['Aliado','Plataforma','Corte'/);
});

test('el detalle de pago queda por encima de encabezados fijos y bloquea el fondo', async () => {
  const [html, app] = await Promise.all([
    readFile('creditek/erp/aliados-tesoreria.html', 'utf8'),
    readFile('creditek/erp/aliados-tesoreria-app.js', 'utf8'),
  ]);
  assert.match(html, /body>\.modal\{[^}]*z-index:2147483000!important/);
  assert.match(html, /html\.kora-payment-modal-open,body\.kora-payment-modal-open\{overflow:hidden!important/);
  assert.match(html, /body>\.modal>\.modal-box\{[^}]*position:relative;z-index:1/);
  assert.match(app, /function syncPaymentModalState\(\)/);
  assert.match(app, /showPaymentModal\(\$\('#paymentDetailModal'\)\)/);
  assert.match(app, /event\.key!=='Escape'/);
});

test('la auditoría admite el evento de autorización sin revertir el pago', async () => {
  const sql = await readFile(eventMigration, 'utf8');
  assert.match(sql, /drop constraint if exists liquidation_domain_events_event_type_check/);
  assert.match(sql, /'payment\.authorized'::text/);
  assert.match(sql, /'payment\.scheduled'::text/);
  assert.match(sql, /'treasury\.movement_completed'::text/);
});

test('no permite autorizar ni pagar antes de aprobar y fondear la liquidación', async () => {
  const [sql, app] = await Promise.all([
    readFile(approvalGateMigration, 'utf8'),
    readFile('creditek/erp/aliados-tesoreria-app.js', 'utf8'),
  ]);
  assert.match(sql, /before update of estado on public\.payment_orders/);
  assert.match(sql, /v_liquidation\.frozen_at is null/);
  assert.match(sql, /liquidation_treasury_destinations/);
  assert.match(sql, /Primero Mayte debe revisar y Oscar aprobar la liquidación/);
  assert.match(app, /liquidations\(id,plataforma,fecha_corte,estado,frozen_at,approved_at,approved_by\)/);
  assert.match(app, /Primero: Mayte revisa y Oscar aprueba la liquidación/);
  assert.match(app, /storage\.from\('soportes'\)\.remove\(\[support\]\)/);
});

test('Liquidaciones guía el orden revisión, aprobación y autorización', async () => {
  const app = await readFile('creditek/erp/aliados-liquidaciones-app.js', 'utf8');
  assert.match(app, /payment\.estado === 'pendiente'[\s\S]*selected\.frozen_at[\s\S]*selected\.estado === 'aprobada'/);
  assert.match(app, /await sb\.rpc\('aliados_autorizar_pago'/);
  assert.match(app, /Pendiente de revisión administrativa/);
  assert.match(app, /Utilidad total del negocio/);
  assert.match(app, /Operaciones originadas en tiendas propias/);
  assert.match(app, /Operaciones originadas en aliados/);
  assert.doesNotMatch(app, /Pendiente de costo real en Retail/);
});

test('Tesorería separa los pagos vigentes del historial cerrado', async () => {
  const [html, app, sql] = await Promise.all([
    readFile('creditek/erp/aliados-tesoreria.html', 'utf8'),
    readFile('creditek/erp/aliados-tesoreria-app.js', 'utf8'),
    readFile('supabase/migrations/20260904041238_corregir_destinos_tesoreria_y_separar_historial.sql', 'utf8'),
  ]);
  assert.match(html, /Pagos por gestionar/);
  assert.match(html, /Consultar historial/);
  assert.match(app, /function isClosedPayment\(p\)/);
  assert.match(app, /treasuryView==='history'\?isClosedPayment\(p\):!isClosedPayment\(p\)/);
  assert.match(sql, /liq_op\.valor_comercial/);
  assert.match(sql, /v_fixed := replace/);
  assert.match(sql, /if v_fixed = v_definition then/);
});

test('todo lo anterior al 1 de septiembre queda cerrado y fuera de pendientes', async () => {
  const [app, sql] = await Promise.all([
    readFile('creditek/erp/aliados-liquidaciones-app.js', 'utf8'),
    readFile('supabase/migrations/20260904042711_cerrar_liquidaciones_anteriores_inicio_operativo.sql', 'utf8'),
  ]);
  assert.match(app, /String\(batch\.fecha_corte \|\| ''\) < '2026-09-01'/);
  assert.match(app, /!isHistoricalBatch\(batch\)/);
  assert.match(sql, /where po\.cutoff_snapshot < date '2026-09-01'/);
  assert.match(sql, /set estado = 'cerrada'/);
  assert.match(sql, /payment_order_classify_historical_cutoff/);
});

test('Tesorería muestra nombres de tiendas y reserva CK como código interno', async () => {
  const app = await readFile('creditek/erp/aliados-tesoreria-app.js', 'utf8');
  assert.match(app, /function storeName\(code\)/);
  assert.match(app, /from\('origenes'\)\.select\('codigo,nombre'\)/);
  assert.match(app, /storeName\(x\.store_code\)/);
});

test('Tesorería separa compensaciones aplicadas y utilidad sin duplicar el módulo de Gastos', async () => {
  const app = await readFile('creditek/erp/aliados-tesoreria-app.js', 'utf8');
  const html = await readFile('creditek/erp/aliados-tesoreria.html', 'utf8');
  const ledger = await readFile('creditek/erp/cuenta-corriente.html', 'utf8');
  assert.match(app, /data-compensation-select/);
  assert.match(app, /Aplicada a cartera/);
  assert.match(app, /commissionCompensation/);
  assert.doesNotMatch(app, /\$\('#movements'\)/);
  assert.match(html, /Abonos automáticos a cartera de tiendas/);
  assert.match(html, /Utilidad del negocio por créditos de tiendas propias/);
  assert.doesNotMatch(html, /Otros movimientos de Tesorería|Registrar movimiento/);
  assert.match(ledger, /new URLSearchParams\(location\.search\)\.get\('tienda'\)/);
});
