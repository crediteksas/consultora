begin;

update public.origenes
set nombre = 'Movil Shoping Corozal',
    aliases = case
      when aliases @> '["Movil Shoping"]'::jsonb then aliases
      else aliases || '["Movil Shoping"]'::jsonb
    end
where codigo = 'CK-02';

create or replace function public.inventario_importar_inicial_excel(
  p_tienda_codigo text,
  p_filas jsonb,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_perfil public.perfiles%rowtype;
  v_fila jsonb;
  v_producto public.productos%rowtype;
  v_referencia uuid := gen_random_uuid();
  v_unidad_id uuid;
  v_codigo text;
  v_nombre text;
  v_categoria text;
  v_tipo text;
  v_imei text;
  v_observacion text;
  v_cantidad integer;
  v_costo numeric;
  v_precio numeric;
  v_total integer := 0;
  v_productos_creados integer := 0;
begin
  select * into v_perfil from public.perfiles
  where id = auth.uid() and activo = true;
  if not found or v_perfil.rol not in ('gerencia', 'auditoria') then
    raise exception 'Solo gerencia o auditoria pueden importar inventario inicial';
  end if;
  if p_tienda_codigo = 'CENTRAL' then
    raise exception 'La importación inicial de Bodega Central no está soportada';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'El motivo es obligatorio y debe tener mínimo 5 caracteres';
  end if;
  if jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'El archivo no contiene filas para importar';
  end if;
  if jsonb_array_length(p_filas) > 5000 then
    raise exception 'El archivo supera el máximo de 5000 filas';
  end if;
  perform 1 from public.origenes
  where codigo = p_tienda_codigo and activo = true and tipo <> 'central';
  if not found then raise exception 'La tienda indicada no existe o está inactiva'; end if;

  if exists (
    select 1
    from jsonb_array_elements(p_filas) a
    join jsonb_array_elements(p_filas) b
      on b->>'producto_codigo' = a->>'producto_codigo'
     and (b->>'producto_nombre' <> a->>'producto_nombre' or b->>'tipo' <> a->>'tipo')
  ) then
    raise exception 'Un código de producto está asignado a nombres o tipos diferentes';
  end if;
  if exists (
    select 1 from (
      select btrim(f->>'imei') imei, count(*) cantidad
      from jsonb_array_elements(p_filas) f
      where btrim(coalesce(f->>'imei', '')) <> ''
      group by btrim(f->>'imei') having count(*) > 1
    ) repetidos
  ) then
    raise exception 'El archivo contiene IMEIs repetidos';
  end if;
  if exists (
    select 1 from public.unidades u
    join jsonb_array_elements(p_filas) f on u.imei = btrim(f->>'imei')
  ) then
    raise exception 'Uno o más IMEIs ya existen en inventario';
  end if;

  for v_fila in select value from jsonb_array_elements(p_filas) loop
    v_codigo := btrim(coalesce(v_fila->>'producto_codigo', ''));
    v_nombre := btrim(coalesce(v_fila->>'producto_nombre', ''));
    v_categoria := replace(upper(btrim(coalesce(v_fila->>'categoria', 'VARIEDADES'))), ' ', '_');
    v_tipo := lower(btrim(coalesce(v_fila->>'tipo', '')));
    v_imei := nullif(btrim(coalesce(v_fila->>'imei', '')), '');
    v_observacion := nullif(btrim(coalesce(v_fila->>'observacion', '')), '');
    begin
      v_cantidad := (v_fila->>'cantidad')::integer;
      v_costo := (v_fila->>'costo')::numeric;
      v_precio := (v_fila->>'precio')::numeric;
    exception when others then
      raise exception 'Cantidad, costo o precio inválido para el producto %', coalesce(nullif(v_nombre, ''), v_codigo);
    end;
    if v_codigo = '' or v_nombre = '' then raise exception 'Todas las filas requieren código y nombre de producto'; end if;
    if v_tipo not in ('serializado', 'cantidad') then raise exception 'Tipo de producto inválido para %', v_nombre; end if;
    if v_cantidad <= 0 or v_costo < 0 or v_precio <= 0 then raise exception 'Cantidad, costo o precio inválido para %', v_nombre; end if;
    if v_tipo = 'serializado' and (v_imei is null or v_cantidad <> 1 or length(v_imei) < 6) then
      raise exception 'El producto serializado % requiere un IMEI y cantidad 1', v_nombre;
    end if;
    if v_tipo = 'cantidad' and v_imei is not null then raise exception 'El producto no serializado % no acepta IMEI', v_nombre; end if;

    select * into v_producto from public.productos where codigo = v_codigo;
    if found then
      if v_producto.nombre <> v_nombre or v_producto.tipo <> v_tipo then
        raise exception 'El código % ya pertenece a %', v_codigo, v_producto.nombre;
      end if;
    else
      insert into public.productos (codigo, nombre, categoria, tipo, precio_guia, activo)
      values (v_codigo, v_nombre, v_categoria, v_tipo, v_precio, true)
      returning * into v_producto;
      v_productos_creados := v_productos_creados + 1;
    end if;

    perform pg_advisory_xact_lock(hashtextextended(p_tienda_codigo || ':' || v_producto.id::text, 0));
    if v_tipo = 'serializado' then
      insert into public.unidades (producto_id, imei, estado, tienda_actual, costo_remision, precio_tienda)
      values (v_producto.id, v_imei, 'disponible', p_tienda_codigo, v_costo, v_precio)
      returning id into v_unidad_id;
      insert into public.movimientos (tipo, tienda_codigo, producto_id, unidad_id, cantidad, costo, precio, referencia_tipo, referencia_id, usuario, nota)
      values ('carga_inicial', p_tienda_codigo, v_producto.id, v_unidad_id, 1, v_costo, v_precio, 'importacion_excel', v_referencia::text, auth.uid(), concat_ws(' · ', btrim(p_motivo), v_observacion));
    else
      insert into public.stock_cantidad (producto_id, tienda_codigo, cantidad, costo_promedio, precio_tienda)
      values (v_producto.id, p_tienda_codigo, v_cantidad, v_costo, v_precio)
      on conflict (producto_id, tienda_codigo) do update set
        costo_promedio = ((public.stock_cantidad.cantidad * public.stock_cantidad.costo_promedio) + (v_cantidad * v_costo)) / (public.stock_cantidad.cantidad + v_cantidad),
        precio_tienda = ((public.stock_cantidad.cantidad * coalesce(public.stock_cantidad.precio_tienda, 0)) + (v_cantidad * v_precio)) / (public.stock_cantidad.cantidad + v_cantidad),
        cantidad = public.stock_cantidad.cantidad + v_cantidad,
        updated_at = now();
      insert into public.movimientos (tipo, tienda_codigo, producto_id, cantidad, costo, precio, referencia_tipo, referencia_id, usuario, nota)
      values ('carga_inicial', p_tienda_codigo, v_producto.id, v_cantidad, v_costo, v_precio, 'importacion_excel', v_referencia::text, auth.uid(), concat_ws(' · ', btrim(p_motivo), v_observacion));
    end if;
    v_total := v_total + v_cantidad;
  end loop;

  return jsonb_build_object('ok', true, 'referencia_id', v_referencia, 'filas', jsonb_array_length(p_filas), 'cantidad', v_total, 'productos_creados', v_productos_creados);
end;
$$;

revoke all on function public.inventario_importar_inicial_excel(text, jsonb, text) from public, anon;
grant execute on function public.inventario_importar_inicial_excel(text, jsonb, text) to authenticated;

commit;
