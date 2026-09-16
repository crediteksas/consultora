-- Correccion de costos vigentes de inventario. Solo Maite y Oscar pueden
-- ejecutarla desde KORA. Las ventas ya registradas conservan su costo
-- congelado; tampoco se alteran cantidades, movimientos ni cierres.

create or replace function public.inventario_ajustar_costo(
  p_tienda_codigo text,
  p_producto_id uuid,
  p_costo_tienda numeric,
  p_costo_interno numeric,
  p_motivo text,
  p_unidad_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perfil public.perfiles%rowtype;
  v_producto public.productos%rowtype;
  v_stock public.stock_cantidad%rowtype;
  v_unidad public.unidades%rowtype;
  v_antes jsonb;
  v_despues jsonb;
  v_tipo text;
  v_registro uuid;
begin
  select * into v_perfil
  from public.perfiles
  where id = (select auth.uid())
    and activo = true
    and id in (
      'd1782db6-bacc-4caf-af6f-ce1b8d1c0391'::uuid, -- Maite Reyes
      '6de0ad26-64af-4966-8cd9-d468880af627'::uuid  -- Oscar Pacheco
    );
  if not found then
    raise exception 'Solo Maite u Oscar pueden modificar costos de inventario';
  end if;

  if p_costo_tienda is null or p_costo_tienda <= 0
     or p_costo_tienda::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'El costo de tienda debe ser mayor que cero';
  end if;
  if p_costo_interno is null or p_costo_interno <= 0
     or p_costo_interno::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'El costo interno debe ser mayor que cero';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 8 then
    raise exception 'Explica el motivo del cambio con mínimo 8 caracteres';
  end if;

  perform 1
  from public.origenes
  where codigo = p_tienda_codigo and activo = true and tipo = 'propia';
  if not found then raise exception 'La tienda Retail no existe o está inactiva'; end if;

  select * into v_producto from public.productos where id = p_producto_id;
  if not found then raise exception 'Producto no encontrado'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_tienda_codigo || ':' || p_producto_id::text, 0));

  if p_unidad_id is null then
    select * into v_stock
    from public.stock_cantidad
    where producto_id = p_producto_id and tienda_codigo = p_tienda_codigo
    for update;
    if not found then raise exception 'No existe inventario por cantidad para esa referencia y tienda'; end if;

    v_antes := to_jsonb(v_stock);
    update public.stock_cantidad as s
    set precio_tienda = p_costo_tienda,
        costo_promedio = p_costo_interno,
        updated_at = clock_timestamp()
    where producto_id = p_producto_id and tienda_codigo = p_tienda_codigo
    returning to_jsonb(s.*) into v_despues;
    v_tipo := 'stock_cantidad';
    v_registro := p_producto_id;
  else
    select * into v_unidad
    from public.unidades
    where id = p_unidad_id
      and producto_id = p_producto_id
      and tienda_actual = p_tienda_codigo
    for update;
    if not found then raise exception 'La unidad no pertenece a esa referencia y tienda'; end if;
    if v_unidad.estado = 'vendido' then raise exception 'No se puede modificar el costo de una unidad vendida'; end if;

    v_antes := to_jsonb(v_unidad);
    update public.unidades as u
    set precio_tienda = p_costo_tienda,
        costo_remision = p_costo_interno
    where id = p_unidad_id
    returning to_jsonb(u.*) into v_despues;
    v_tipo := 'unidad';
    v_registro := p_unidad_id;
  end if;

  insert into public.audit_log(usuario, accion, tabla, registro_id, detalle)
  values (
    v_perfil.id,
    'inventario_costo_ajustado',
    v_tipo,
    v_registro,
    jsonb_build_object(
      'tienda_codigo', p_tienda_codigo,
      'producto_id', p_producto_id,
      'producto', v_producto.nombre,
      'motivo', btrim(p_motivo),
      'antes', v_antes,
      'despues', v_despues,
      'ventas_historicas_modificadas', false,
      'cantidades_modificadas', false
    )
  );

  return jsonb_build_object(
    'tipo', v_tipo,
    'registro_id', v_registro,
    'producto', v_producto.nombre,
    'tienda_codigo', p_tienda_codigo,
    'costo_tienda', p_costo_tienda,
    'costo_interno', p_costo_interno
  );
end;
$$;

revoke all on function public.inventario_ajustar_costo(text,uuid,numeric,numeric,text,uuid)
from public, anon;
grant execute on function public.inventario_ajustar_costo(text,uuid,numeric,numeric,text,uuid)
to authenticated;

-- Solicitud puntual: Movishopping / P. SILICONE ORIGINAL pasa de $6.200 a
-- $6.300. La correccion queda registrada y no toca las ventas anteriores.
do $$
declare
  v_producto constant uuid := 'a26d7168-c70f-4453-92b7-6c7368275918'::uuid;
  v_tienda constant text := 'CK-02';
  v_antes jsonb;
  v_despues jsonb;
begin
  select to_jsonb(s) into v_antes
  from public.stock_cantidad s
  where s.producto_id = v_producto and s.tienda_codigo = v_tienda
  for update;
  if v_antes is null then
    raise exception 'No se encontro P. SILICONE ORIGINAL en Movishopping';
  end if;

  update public.stock_cantidad as s
  set precio_tienda = 6300,
      costo_promedio = 6300,
      updated_at = clock_timestamp()
  where producto_id = v_producto and tienda_codigo = v_tienda
  returning to_jsonb(s.*) into v_despues;

  insert into public.audit_log(usuario, accion, tabla, registro_id, detalle)
  values (
    '6de0ad26-64af-4966-8cd9-d468880af627'::uuid,
    'inventario_costo_ajustado',
    'stock_cantidad',
    v_producto,
    jsonb_build_object(
      'tienda_codigo', v_tienda,
      'producto', 'P. SILICONE ORIGINAL',
      'motivo', 'Correccion solicitada por Oscar: costo vigente a $6.300',
      'antes', v_antes,
      'despues', v_despues,
      'ventas_historicas_modificadas', false,
      'cantidades_modificadas', false,
      'origen', 'migracion_controlada_20260916'
    )
  );
end;
$$;

notify pgrst, 'reload schema';
