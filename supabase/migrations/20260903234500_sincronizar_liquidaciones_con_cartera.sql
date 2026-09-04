-- Las liquidaciones de plataforma son la fuente de seguimiento de cartera,
-- incluso cuando la tienda todavía no ha registrado el IMEI en Ventas.
-- Esta sincronización no crea ventas, inventario, caja ni órdenes de pago.

create or replace function public.sincronizar_operacion_liquidacion_con_cartera()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_archivo text;
  v_cargado_at timestamptz;
begin
  if new.plataforma not in ('payjoy', 'alo', 'krediya')
     or nullif(btrim(new.external_id), '') is null
     or new.operation_at < timestamptz '2026-09-02 00:00:00-05' then
    return new;
  end if;

  select f.original_name, f.uploaded_at
    into v_archivo, v_cargado_at
  from public.liquidation_imported_files f
  where f.liquidation_id = new.liquidation_id
  order by f.uploaded_at desc, f.id desc
  limit 1;

  insert into public.creditos_historicos_plataforma (
    plataforma, codigo_credito, fecha_credito, estado, cliente_documento,
    cliente_nombre, establecimiento, vendedor, imei, referencia, modelo,
    plazo_meses, monto_credito, cuota_inicial, archivo_origen, correo_origen_at,
    datos_origen, historico_inicial, pagado_antes_inicio, requiere_soporte,
    fecha_inicio_operacion, tipo_establecimiento
  ) values (
    new.plataforma,
    btrim(new.external_id),
    new.operation_at,
    'activo',
    new.cliente_documento,
    new.cliente_nombre,
    new.establishment_name,
    new.normalized_data->>'vendedorNombre',
    new.imei,
    new.referencia,
    new.modelo,
    nullif(new.normalized_data->>'plazo', '')::integer,
    new.monto_credito,
    new.inicial,
    coalesce(v_archivo, 'liquidacion:' || new.liquidation_id::text),
    v_cargado_at,
    coalesce(new.normalized_data, '{}'::jsonb) || jsonb_build_object(
      'clasificacion_kora', 'operacion_nueva',
      'liquidacion_origen_id', new.liquidation_id,
      'operacion_origen_id', new.id,
      'sincronizado_desde_liquidacion', true
    ),
    false,
    false,
    true,
    date '2026-09-02',
    new.tipo_establecimiento
  )
  on conflict (plataforma, codigo_credito) do update
  set fecha_credito = excluded.fecha_credito,
      cliente_documento = excluded.cliente_documento,
      cliente_nombre = coalesce(excluded.cliente_nombre, public.creditos_historicos_plataforma.cliente_nombre),
      establecimiento = excluded.establecimiento,
      vendedor = coalesce(excluded.vendedor, public.creditos_historicos_plataforma.vendedor),
      imei = excluded.imei,
      referencia = excluded.referencia,
      modelo = excluded.modelo,
      plazo_meses = coalesce(excluded.plazo_meses, public.creditos_historicos_plataforma.plazo_meses),
      monto_credito = excluded.monto_credito,
      cuota_inicial = excluded.cuota_inicial,
      archivo_origen = excluded.archivo_origen,
      correo_origen_at = excluded.correo_origen_at,
      datos_origen = public.creditos_historicos_plataforma.datos_origen || excluded.datos_origen,
      tipo_establecimiento = excluded.tipo_establecimiento,
      actualizado_at = now();

  return new;
end;
$$;

revoke all on function public.sincronizar_operacion_liquidacion_con_cartera()
  from public, anon, authenticated;

drop trigger if exists trg_sincronizar_operacion_liquidacion_con_cartera
  on public.liquidation_operations;
create trigger trg_sincronizar_operacion_liquidacion_con_cartera
after insert or update of external_id, operation_at, establishment_name,
  origen_codigo, tipo_establecimiento, cliente_documento, cliente_nombre,
  imei, referencia, modelo, monto_credito, inicial, normalized_data
on public.liquidation_operations
for each row execute function public.sincronizar_operacion_liquidacion_con_cartera();

-- Recupera idempotentemente las operaciones normales ya importadas desde el
-- inicio operativo. No altera ventas ni resuelve incidencias de inventario.
insert into public.creditos_historicos_plataforma (
  plataforma, codigo_credito, fecha_credito, estado, cliente_documento,
  cliente_nombre, establecimiento, vendedor, imei, referencia, modelo,
  plazo_meses, monto_credito, cuota_inicial, archivo_origen, correo_origen_at,
  datos_origen, historico_inicial, pagado_antes_inicio, requiere_soporte,
  fecha_inicio_operacion, tipo_establecimiento
)
select
  o.plataforma,
  btrim(o.external_id),
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
  coalesce(f.original_name, 'liquidacion:' || o.liquidation_id::text),
  f.uploaded_at,
  coalesce(o.normalized_data, '{}'::jsonb) || jsonb_build_object(
    'clasificacion_kora', 'operacion_nueva',
    'liquidacion_origen_id', o.liquidation_id,
    'operacion_origen_id', o.id,
    'sincronizado_desde_liquidacion', true
  ),
  false,
  false,
  true,
  date '2026-09-02',
  o.tipo_establecimiento
from public.liquidation_operations o
left join lateral (
  select i.original_name, i.uploaded_at
  from public.liquidation_imported_files i
  where i.liquidation_id = o.liquidation_id
  order by i.uploaded_at desc, i.id desc
  limit 1
) f on true
where o.plataforma in ('payjoy', 'alo', 'krediya')
  and nullif(btrim(o.external_id), '') is not null
  and o.operation_at >= timestamptz '2026-09-02 00:00:00-05'
on conflict (plataforma, codigo_credito) do update
set fecha_credito = excluded.fecha_credito,
    cliente_documento = excluded.cliente_documento,
    cliente_nombre = coalesce(excluded.cliente_nombre, public.creditos_historicos_plataforma.cliente_nombre),
    establecimiento = excluded.establecimiento,
    vendedor = coalesce(excluded.vendedor, public.creditos_historicos_plataforma.vendedor),
    imei = excluded.imei,
    referencia = excluded.referencia,
    modelo = excluded.modelo,
    plazo_meses = coalesce(excluded.plazo_meses, public.creditos_historicos_plataforma.plazo_meses),
    monto_credito = excluded.monto_credito,
    cuota_inicial = excluded.cuota_inicial,
    archivo_origen = excluded.archivo_origen,
    correo_origen_at = excluded.correo_origen_at,
    datos_origen = public.creditos_historicos_plataforma.datos_origen || excluded.datos_origen,
    tipo_establecimiento = excluded.tipo_establecimiento,
    actualizado_at = now();

