import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = 'supabase/migrations/20260903161914_restringir_autorizacion_pagos_oscar.sql';
const eventMigration = 'supabase/migrations/20260903165524_permitir_evento_autorizacion_pago.sql';

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
