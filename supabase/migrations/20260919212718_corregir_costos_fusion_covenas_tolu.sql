begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Respaldo administrativo: no exponer inventario, costos internos ni IMEIs
-- completos en audit_log, cuya lectura histórica admite usuarios autenticados.
create table if not exists kora_private.respaldo_costos_fusion_tolu_20260919 (
  registro_id text primary key,
  detalle jsonb not null,
  created_at timestamptz not null default now()
);
alter table kora_private.respaldo_costos_fusion_tolu_20260919 enable row level security;
revoke all on kora_private.respaldo_costos_fusion_tolu_20260919 from public, anon, authenticated, service_role;

-- Corrección autorizada por Óscar: la carga de Coveñas fusionada en Tolú
-- guardó el precio de venta en precio_tienda, que Retail interpreta como costo.
-- Se recupera el costo original inmutable. No se reescribe ningún movimiento,
-- precio comercial, cantidad, IMEI, venta, saldo de cartera ni otra tienda.
lock table public.audit_log, public.movimientos, public.stock_cantidad,
  public.unidades, public.productos, public.venta_items, public.ventas,
  inventario_control.cortes, inventario_control.lineas in share row exclusive mode;

do $repair$
declare
  v_source public.audit_log%rowtype;
  v_reference text;
  v_stock integer;
  v_units integer;
  v_before jsonb;
  v_after jsonb;
begin
  if exists (select 1 from public.audit_log
    where accion = 'costos_fusion_covenas_tolu_corregidos'
      and registro_id = 'fusion-covenas-tolu-ebf0cb38d37759a1') then
    raise notice 'Corrección de costos Coveñas → Tolú ya aplicada; no se repite';
    return;
  end if;

  select * into strict v_source from public.audit_log
  where accion = 'inventario_covenas_fusionado_tolu'
    and registro_id = 'fusion-covenas-tolu-ebf0cb38d37759a1'
    and detalle->>'source_sha256' = 'ebf0cb38d37759a111accd0df180e54a3438f1c4a36aeeec87628c6958542cb1'
    and detalle->>'target_store' = 'CK-01';
  -- Resolver los IDs generados desde la auditoría original, no fijarlos a mano.
  v_reference := v_source.detalle #>> '{import_result,referencia_id}';
  if v_reference is null then raise exception 'Falta la referencia de la carga original'; end if;

  create temporary table correccion_costos_tolu on commit drop as
  select m.id, m.producto_id, m.unidad_id, m.cantidad, m.costo, m.precio,
    to_jsonb(m) movimiento_antes, to_jsonb(p) producto_antes,
    case when m.unidad_id is null then to_jsonb(s) else to_jsonb(u) end inventario_antes
  from public.movimientos m
  join public.productos p on p.id = m.producto_id
  left join public.stock_cantidad s on m.unidad_id is null
    and s.producto_id = m.producto_id and s.tienda_codigo = 'CK-01'
  left join public.unidades u on u.id = m.unidad_id
  where m.referencia_id = v_reference and m.referencia_tipo = 'importacion_excel'
    and m.tipo = 'carga_inicial' and m.tienda_codigo = 'CK-01';

  if (select count(*) from correccion_costos_tolu) <> 114
    or (select count(distinct producto_id) from correccion_costos_tolu) <> 114
    or (select count(*) from correccion_costos_tolu where unidad_id is null) <> 104
    or (select sum(cantidad) from correccion_costos_tolu) <> 1372
    or (select sum(cantidad * costo) from correccion_costos_tolu) <> 13107200
    or (select sum(cantidad * precio) from correccion_costos_tolu) <> 28934000
    or exists (select 1 from correccion_costos_tolu where costo is null or costo <= 0
      or precio is null or inventario_antes is null
      or (movimiento_antes->>'costo_tienda')::numeric is distinct from costo
      or (producto_antes->>'precio_guia')::numeric is distinct from precio) then
    raise exception 'La carga original no coincide con las 114 referencias/costos verificados';
  end if;

  if exists (select 1 from correccion_costos_tolu c join public.movimientos m
    on (c.unidad_id is not null and m.unidad_id = c.unidad_id)
      or (c.unidad_id is null and m.producto_id = c.producto_id and m.tienda_codigo = 'CK-01')
    where m.id <> c.id)
    or exists (select 1 from correccion_costos_tolu c
      join public.venta_items vi on (c.unidad_id is not null and vi.unidad_id = c.unidad_id)
        or (c.unidad_id is null and vi.producto_id = c.producto_id)
      join public.ventas v on v.id = vi.venta_id
      where c.unidad_id is not null or v.tienda_codigo = 'CK-01')
    or exists (select 1 from inventario_control.lineas l
      join inventario_control.cortes ct on ct.id = l.corte_id
      join correccion_costos_tolu c on c.producto_id = l.producto_id
      where ct.tienda_codigo = 'CK-01') then
    raise exception 'Hay movimientos, ventas o cortes dependientes: revisar antes de corregir';
  end if;

  if exists (select 1 from correccion_costos_tolu where
      (inventario_antes->>'producto_id')::uuid is distinct from producto_id
      or (inventario_antes->>'precio_tienda')::numeric is distinct from precio
      or (unidad_id is null and (
        (inventario_antes->>'cantidad')::integer is distinct from cantidad
        or (inventario_antes->>'costo_promedio')::numeric is distinct from costo))
      or (unidad_id is not null and (
        inventario_antes->>'estado' is distinct from 'disponible'
        or inventario_antes->>'tienda_actual' is distinct from 'CK-01'
        or (inventario_antes->>'costo_remision')::numeric is distinct from costo))) then
    raise exception 'El inventario cambió después de la revisión; corrección cancelada';
  end if;

  select jsonb_agg(to_jsonb(c) order by c.id) into v_before from correccion_costos_tolu c;

  update public.stock_cantidad s set precio_tienda = c.costo
  from correccion_costos_tolu c where c.unidad_id is null
    and s.producto_id = c.producto_id and s.tienda_codigo = 'CK-01';
  get diagnostics v_stock = row_count;
  update public.unidades u set precio_tienda = c.costo
  from correccion_costos_tolu c where c.unidad_id = u.id;
  get diagnostics v_units = row_count;
  if v_stock <> 104 or v_units <> 10 then raise exception 'Alcance de corrección inesperado'; end if;

  -- Verificar que el único dato modificado sea precio_tienda en los 114 registros.
  if exists (select 1 from correccion_costos_tolu c
      join public.productos p on p.id = c.producto_id
      join public.movimientos m on m.id = c.id
      left join public.stock_cantidad s on c.unidad_id is null
        and s.producto_id = c.producto_id and s.tienda_codigo = 'CK-01'
      left join public.unidades u on u.id = c.unidad_id
      where to_jsonb(p) is distinct from c.producto_antes
        or to_jsonb(m) is distinct from c.movimiento_antes
        or (case when c.unidad_id is null then to_jsonb(s) else to_jsonb(u) end)
          is distinct from (c.inventario_antes || jsonb_build_object('precio_tienda',c.costo))) then
    raise exception 'Se modificó un dato fuera del costo Retail; se revierte toda la corrección';
  end if;

  select jsonb_agg(jsonb_build_object('producto_id',c.producto_id,'unidad_id',c.unidad_id,
    'inventario',case when c.unidad_id is null then to_jsonb(s) else to_jsonb(u) end) order by c.id)
  into v_after from correccion_costos_tolu c
  left join public.stock_cantidad s on c.unidad_id is null
    and s.producto_id = c.producto_id and s.tienda_codigo = 'CK-01'
  left join public.unidades u on u.id = c.unidad_id;

  insert into kora_private.respaldo_costos_fusion_tolu_20260919(registro_id,detalle)
  values (v_source.registro_id,jsonb_build_object(
    'source_audit_id',v_source.id,'import_reference',v_reference,
    'antes',v_before,'despues',v_after));

  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
  values ('migracion_autorizada_por_oscar','costos_fusion_covenas_tolu_corregidos','inventario',
    v_source.registro_id,jsonb_build_object(
      'motivo','Corrección autorizada: el precio de venta se cargó como costo Retail en la fusión Coveñas → Tolú',
      'source_audit_id',v_source.id,'import_reference',v_reference,
      'source_sha256',v_source.detalle->>'source_sha256','tienda_codigo','CK-01',
      'referencias',114,'unidades',1372,'stock_corregidos',v_stock,'serializados_corregidos',v_units,
      'valoracion_erronea',28934000,'costo_original_corregido',13107200,
      'sin_ventas_dependientes',true,'cantidades_y_precios_venta_conservados',true,
      'respaldo_registro_id',v_source.registro_id));
end;
$repair$;
commit;
