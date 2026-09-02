alter table public.creditos_historicos_plataforma
  add column if not exists historico_inicial boolean not null default false,
  add column if not exists pagado_antes_inicio boolean not null default false,
  add column if not exists requiere_soporte boolean not null default true,
  add column if not exists fecha_inicio_operacion date;

comment on column public.creditos_historicos_plataforma.historico_inicial is
  'Distingue la carga de apertura de los créditos generados por la operación normal de KORA.';
comment on column public.creditos_historicos_plataforma.pagado_antes_inicio is
  'Indica que el crédito ya había sido liquidado antes del inicio operativo en KORA.';
comment on column public.creditos_historicos_plataforma.requiere_soporte is
  'Controla si KORA debe solicitar soporte de pago; la carga histórica inicial no lo requiere.';
comment on column public.creditos_historicos_plataforma.fecha_inicio_operacion is
  'Fecha de corte que separa la carga histórica inicial de la operación nueva.';

update public.creditos_historicos_plataforma
set historico_inicial = true,
    pagado_antes_inicio = true,
    requiere_soporte = false,
    fecha_inicio_operacion = date '2026-09-02',
    datos_origen = datos_origen || jsonb_build_object(
      'clasificacion_kora', 'historico_inicial_pagado',
      'requiere_foto_soporte', false,
      'fecha_inicio_operacion', '2026-09-02'
    ),
    actualizado_at = now()
where fecha_credito < timestamptz '2026-09-02 00:00:00-05';

insert into public.creditos_historicos_plataforma (
  plataforma, codigo_credito, fecha_credito, estado, cliente_documento,
  cliente_nombre, establecimiento, vendedor, imei, referencia, modelo,
  plazo_meses, monto_credito, cuota_inicial, archivo_origen, correo_origen_at,
  datos_origen, historico_inicial, pagado_antes_inicio, requiere_soporte,
  fecha_inicio_operacion
)
select
  o.plataforma,
  o.external_id,
  o.operation_at,
  'activo',
  o.cliente_documento,
  o.cliente_nombre,
  o.establishment_name,
  o.normalized_data->>'vendedorNombre',
  o.imei,
  o.referencia,
  o.modelo,
  nullif(o.normalized_data->>'plazo', '')::integer,
  o.monto_credito,
  o.inicial,
  f.original_name,
  f.uploaded_at,
  o.normalized_data || jsonb_build_object(
    'clasificacion_kora', 'historico_inicial_pagado',
    'requiere_foto_soporte', false,
    'fecha_inicio_operacion', '2026-09-02',
    'liquidacion_origen_id', o.liquidation_id
  ),
  true,
  true,
  false,
  date '2026-09-02'
from public.liquidation_operations o
join public.liquidations l on l.id = o.liquidation_id
left join public.liquidation_imported_files f on f.liquidation_id = l.id
where o.operation_at < timestamptz '2026-09-02 00:00:00-05'
  and o.external_id is not null
on conflict (plataforma, codigo_credito) do update
set historico_inicial = true,
    pagado_antes_inicio = true,
    requiere_soporte = false,
    fecha_inicio_operacion = excluded.fecha_inicio_operacion,
    datos_origen = public.creditos_historicos_plataforma.datos_origen || excluded.datos_origen,
    actualizado_at = now();
