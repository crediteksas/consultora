-- Isolated fictitious stores and products. No production business data.
create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql as $$select '10000000-0000-0000-0000-000000000001'::uuid$$;
create function public.es_central() returns boolean language sql as $$select coalesce(current_setting('test.central',true),'no')='yes'$$;
create table traslados(id uuid primary key,consecutivo bigint,estado text,tienda_origen text,tienda_destino text,aprobado_at timestamptz,aprobado_por uuid);
create table traslado_items(id uuid primary key,traslado_id uuid,producto_id uuid,unidad_id uuid,cantidad int,costo numeric,precio_tienda numeric);
create table unidades(id uuid primary key,tienda_actual text,estado text,precio_tienda numeric);
create table productos(id uuid primary key,tipo text);
create table movimientos(id uuid primary key default gen_random_uuid(),tipo text,tienda_codigo text,producto_id uuid,unidad_id uuid,cantidad int,costo numeric(14,2),precio numeric(14,2),referencia_tipo text,referencia_id text,usuario uuid);
create table origenes(codigo text primary key,nombre text);
create table cuentas_cartera(id uuid primary key default gen_random_uuid(),tipo_cuenta text,tienda_codigo text,nombre text,activo boolean default true,updated_at timestamptz);
create unique index on cuentas_cartera(tienda_codigo,tipo_cuenta) where tienda_codigo is not null;
create table movimientos_cartera(id uuid primary key default gen_random_uuid(),cuenta_id uuid,tienda_codigo text,efecto text,monto numeric check(monto>0),concepto text,referencia_tipo text,referencia_id text,metadatos jsonb,creado_por uuid default auth.uid(),created_at timestamptz default now(),unique(cuenta_id,referencia_tipo,referencia_id,efecto));
create table cuenta_corriente(id uuid primary key default gen_random_uuid(),tienda_codigo text,tipo text,concepto text,monto numeric(14,2) constraint cuenta_corriente_monto_check check(monto>0),referencia_tipo text,referencia_id text,usuario uuid,nota text,created_at timestamptz default now());
create table stock_cantidad(producto_id uuid,tienda_codigo text,cantidad int check(cantidad>=0),costo_promedio numeric(14,2),precio_tienda numeric,updated_at timestamptz,primary key(producto_id,tienda_codigo));
create table costo_promedio_tienda_historial(id uuid primary key default gen_random_uuid(),tienda_codigo text,producto_id uuid,tipo_inventario text,existencias_anteriores int,unidades_entrada int,existencias_nuevas int,costo_anterior numeric,costo_entrada numeric,costo_nuevo numeric,origen_tipo text,origen_id text,usuario_id uuid);
insert into origenes values('ORIGEN-FICTICIO','Origen de prueba'),('DESTINO-FICTICIO','Destino de prueba');
set test.central='yes';

CREATE OR REPLACE FUNCTION public.aplicar_costo_promedio_tienda(p_tienda_codigo text, p_producto_id uuid, p_cantidad_entrada integer, p_costo_interno_entrada numeric, p_costo_tienda_entrada numeric, p_tipo_inventario text, p_origen_tipo text, p_origen_id text, p_unidad_id uuid DEFAULT NULL::uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_existencias_anteriores integer := 0;
  v_costo_anterior numeric := 0;
  v_costo_interno_anterior numeric := 0;
  v_costo_nuevo numeric;
  v_costo_interno_nuevo numeric;
  v_stock public.stock_cantidad%rowtype;
  v_tipo_producto text;
begin
  select p.tipo into v_tipo_producto
  from public.productos p
  where p.id = p_producto_id;

  if v_tipo_producto is null then
    raise exception 'Producto no encontrado para calcular costo promedio';
  end if;
  if p_tipo_inventario <> 'cantidad' or v_tipo_producto <> 'cantidad' then
    raise exception 'El costo promedio solo aplica a productos no serializados';
  end if;
  if p_cantidad_entrada <= 0
     or p_costo_tienda_entrada is null
     or p_costo_tienda_entrada <= 0
     or p_costo_interno_entrada is null
     or p_costo_interno_entrada < 0 then
    raise exception 'Entrada inválida para calcular costo promedio';
  end if;
  if p_origen_tipo not in ('remision', 'traslado') then
    raise exception 'Origen de inventario inválido';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_tienda_codigo || ':' || p_producto_id::text, 0)
  );

  select * into v_stock
  from public.stock_cantidad
  where tienda_codigo = p_tienda_codigo
    and producto_id = p_producto_id
  for update;

  if found then
    v_existencias_anteriores := v_stock.cantidad;
    v_costo_anterior := coalesce(v_stock.precio_tienda, 0);
    v_costo_interno_anterior := coalesce(v_stock.costo_promedio, 0);
  end if;

  v_costo_nuevo := case
    when v_existencias_anteriores = 0 then p_costo_tienda_entrada
    else ((v_existencias_anteriores * v_costo_anterior)
      + (p_cantidad_entrada * p_costo_tienda_entrada))
      / (v_existencias_anteriores + p_cantidad_entrada)
  end;
  v_costo_interno_nuevo := case
    when v_existencias_anteriores = 0 then p_costo_interno_entrada
    else ((v_existencias_anteriores * v_costo_interno_anterior)
      + (p_cantidad_entrada * p_costo_interno_entrada))
      / (v_existencias_anteriores + p_cantidad_entrada)
  end;

  insert into public.stock_cantidad (
    producto_id, tienda_codigo, cantidad, costo_promedio, precio_tienda
  ) values (
    p_producto_id, p_tienda_codigo, p_cantidad_entrada,
    v_costo_interno_nuevo, v_costo_nuevo
  )
  on conflict (producto_id, tienda_codigo) do update set
    cantidad = public.stock_cantidad.cantidad + p_cantidad_entrada,
    costo_promedio = v_costo_interno_nuevo,
    precio_tienda = v_costo_nuevo,
    updated_at = now();

  insert into public.costo_promedio_tienda_historial (
    tienda_codigo, producto_id, tipo_inventario,
    existencias_anteriores, unidades_entrada, existencias_nuevas,
    costo_anterior, costo_entrada, costo_nuevo,
    origen_tipo, origen_id, usuario_id
  ) values (
    p_tienda_codigo, p_producto_id, 'cantidad',
    v_existencias_anteriores, p_cantidad_entrada,
    v_existencias_anteriores + p_cantidad_entrada,
    v_costo_anterior, p_costo_tienda_entrada, v_costo_nuevo,
    p_origen_tipo, p_origen_id, auth.uid()
  );

  return v_costo_nuevo;
end;
$function$;
create or replace function public.aprobar_traslado_recepcion(p_traslado_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_traslado public.traslados%rowtype;
  v_item public.traslado_items%rowtype;
  v_unidad public.unidades%rowtype;
  v_total numeric := 0;
  v_cuenta_origen uuid;
  v_cuenta_destino uuid;
  v_legacy_origen numeric := 0;
  v_diferencia numeric;
begin
  if not public.es_central() then
    raise exception 'Solo Gerencia o Auditoría puede dar el visto bueno final';
  end if;

  select * into v_traslado
  from public.traslados
  where id = p_traslado_id
  for update;

  if not found then
    raise exception 'Traslado no encontrado';
  end if;
  if v_traslado.estado <> 'recibido_pendiente_aprobacion' then
    raise exception
      'El traslado debe estar recibido y pendiente de visto bueno (estado actual: %)',
      v_traslado.estado;
  end if;
  if exists (
    select 1 from public.traslado_items ti
    where ti.traslado_id = p_traslado_id
      and coalesce(ti.precio_tienda, 0) <= 0
  ) then
    raise exception 'El traslado tiene artículos sin costo de remisión';
  end if;

  for v_item in
    select * from public.traslado_items
    where traslado_id = p_traslado_id
    order by id
  loop
    if v_item.unidad_id is not null then
      select * into v_unidad
      from public.unidades
      where id = v_item.unidad_id
      for update;

      if not found
        or v_unidad.tienda_actual is distinct from v_traslado.tienda_origen
        or v_unidad.estado is distinct from 'en_traslado'
      then
        raise exception 'El IMEI del traslado no conserva su estado y tienda de origen';
      end if;
      if v_unidad.precio_tienda is distinct from v_item.precio_tienda then
        raise exception 'El costo de remisión del IMEI cambió después del despacho';
      end if;

      update public.unidades
      set estado = 'disponible',
          tienda_actual = v_traslado.tienda_destino
      where id = v_item.unidad_id;

      insert into public.movimientos (
        tipo, tienda_codigo, producto_id, unidad_id, cantidad,
        costo, precio, referencia_tipo, referencia_id, usuario
      ) values (
        'traslado_entrada', v_traslado.tienda_destino, v_item.producto_id,
        v_item.unidad_id, 1, v_item.costo, v_item.precio_tienda,
        'traslado', p_traslado_id::text, auth.uid()
      );
    else
      perform public.aplicar_costo_promedio_tienda(
        v_traslado.tienda_destino,
        v_item.producto_id,
        v_item.cantidad,
        v_item.costo,
        v_item.precio_tienda,
        'cantidad',
        'traslado',
        p_traslado_id::text
      );

      insert into public.movimientos (
        tipo, tienda_codigo, producto_id, cantidad,
        costo, precio, referencia_tipo, referencia_id, usuario
      ) values (
        'traslado_entrada', v_traslado.tienda_destino, v_item.producto_id,
        v_item.cantidad, v_item.costo, v_item.precio_tienda,
        'traslado', p_traslado_id::text, auth.uid()
      );
    end if;

    v_total := v_total + (v_item.precio_tienda * v_item.cantidad);
  end loop;

  if v_total <= 0 then
    raise exception 'El traslado no tiene un costo de remisión válido';
  end if;

  insert into public.cuentas_cartera (tipo_cuenta, tienda_codigo, nombre)
  select 'tienda', o.codigo, 'Cuenta tienda · ' || o.nombre
  from public.origenes o
  where o.codigo in (v_traslado.tienda_origen, v_traslado.tienda_destino)
  on conflict (tienda_codigo, tipo_cuenta)
  where tienda_codigo is not null
  do update set activo = true, updated_at = now();

  select id into v_cuenta_origen
  from public.cuentas_cartera
  where tipo_cuenta = 'tienda'
    and tienda_codigo = v_traslado.tienda_origen
    and activo = true
  for update;

  select id into v_cuenta_destino
  from public.cuentas_cartera
  where tipo_cuenta = 'tienda'
    and tienda_codigo = v_traslado.tienda_destino
    and activo = true
  for update;

  if v_cuenta_origen is null or v_cuenta_destino is null then
    raise exception 'No fue posible preparar las cuentas del traslado';
  end if;

  insert into public.movimientos_cartera (
    cuenta_id, tienda_codigo, efecto, monto, concepto,
    referencia_tipo, referencia_id, metadatos
  ) values (
    v_cuenta_origen, v_traslado.tienda_origen, 'credito', v_total,
    'Traslado aprobado', 'traslado', p_traslado_id::text,
    jsonb_build_object(
      'tienda_destino', v_traslado.tienda_destino,
      'consecutivo', v_traslado.consecutivo,
      'aprobado_por', auth.uid()
    )
  ) on conflict (cuenta_id, referencia_tipo, referencia_id, efecto) do nothing;

  insert into public.movimientos_cartera (
    cuenta_id, tienda_codigo, efecto, monto, concepto,
    referencia_tipo, referencia_id, metadatos
  ) values (
    v_cuenta_destino, v_traslado.tienda_destino, 'debito', v_total,
    'Traslado aprobado', 'traslado', p_traslado_id::text,
    jsonb_build_object(
      'tienda_origen', v_traslado.tienda_origen,
      'consecutivo', v_traslado.consecutivo,
      'aprobado_por', auth.uid()
    )
  ) on conflict (cuenta_id, referencia_tipo, referencia_id, efecto) do nothing;

  -- Compatibilidad con el libro oficial de Retail. Para traslados nuevos el
  -- valor previo es cero; el cálculo evita duplicar históricos heredados.
  select coalesce(sum(
    case cc.tipo when 'abono' then cc.monto else -cc.monto end
  ), 0)
  into v_legacy_origen
  from public.cuenta_corriente cc
  where cc.tienda_codigo = v_traslado.tienda_origen
    and cc.referencia_id = p_traslado_id::text
    and cc.referencia_tipo in ('traslado', 'traslado_ajuste_recepcion');

  v_diferencia := v_total - v_legacy_origen;
  if v_diferencia > 0 then
    insert into public.cuenta_corriente (
      tienda_codigo, tipo, concepto, monto,
      referencia_tipo, referencia_id, usuario
    ) values (
      v_traslado.tienda_origen, 'abono',
      'Traslado #' || v_traslado.consecutivo || ' aprobado hacia '
        || v_traslado.tienda_destino,
      v_diferencia,
      case when v_legacy_origen = 0 then 'traslado' else 'traslado_ajuste_recepcion' end,
      p_traslado_id::text,
      auth.uid()
    );
  elsif v_diferencia < 0 then
    insert into public.cuenta_corriente (
      tienda_codigo, tipo, concepto, monto,
      referencia_tipo, referencia_id, usuario
    ) values (
      v_traslado.tienda_origen, 'cargo',
      'Ajuste valor de remisión traslado #' || v_traslado.consecutivo,
      abs(v_diferencia), 'traslado_ajuste_recepcion',
      p_traslado_id::text, auth.uid()
    );
  end if;

  if not exists (
    select 1 from public.cuenta_corriente cc
    where cc.tienda_codigo = v_traslado.tienda_destino
      and cc.tipo = 'cargo'
      and cc.referencia_tipo = 'traslado'
      and cc.referencia_id = p_traslado_id::text
  ) then
    insert into public.cuenta_corriente (
      tienda_codigo, tipo, concepto, monto,
      referencia_tipo, referencia_id, usuario
    ) values (
      v_traslado.tienda_destino, 'cargo',
      'Traslado #' || v_traslado.consecutivo || ' aprobado desde '
        || v_traslado.tienda_origen,
      v_total, 'traslado', p_traslado_id::text, auth.uid()
    );
  end if;

  update public.traslados
  set estado = 'cerrado',
      aprobado_at = now(),
      aprobado_por = auth.uid()
  where id = p_traslado_id;

  return jsonb_build_object(
    'ok', true,
    'consecutivo', v_traslado.consecutivo,
    'total', v_total,
    'efecto_neto', 0,
    'estado', 'cerrado'
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.enrutar_movimiento_cartera_retail()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_tipo_cuenta text;
  v_tienda text;
  v_tipo_movimiento text;
begin
  select c.tipo_cuenta, coalesce(new.tienda_codigo, c.tienda_codigo)
    into v_tipo_cuenta, v_tienda
  from public.cuentas_cartera c
  where c.id = new.cuenta_id;

  if v_tipo_cuenta <> 'tienda' then
    return new;
  end if;

  if v_tienda is null then
    raise exception 'El movimiento Retail no tiene tienda asociada';
  end if;

  v_tipo_movimiento := case new.efecto
    when 'debito' then 'cargo'
    when 'credito' then 'abono'
    else null
  end;

  if v_tipo_movimiento is null then
    raise exception 'Efecto de cartera Retail no reconocido: %', new.efecto;
  end if;

  if not exists (
    select 1
    from public.cuenta_corriente cc
    where cc.tienda_codigo = v_tienda
      and cc.tipo = v_tipo_movimiento
      and cc.referencia_tipo is not distinct from new.referencia_tipo
      and cc.referencia_id is not distinct from new.referencia_id
      and cc.monto = new.monto
  ) then
    insert into public.cuenta_corriente
      (tienda_codigo, tipo, concepto, monto, referencia_tipo, referencia_id, usuario, nota, created_at)
    values
      (v_tienda, v_tipo_movimiento, new.concepto, new.monto,
       new.referencia_tipo, new.referencia_id, new.creado_por,
       'Enrutado automaticamente al libro oficial de cartera Retail',
       coalesce(new.created_at, now()));
  end if;

  -- Impide que vuelva a nacer un segundo saldo Retail.
  return null;
end;
$function$;
revoke all on function public.aprobar_traslado_recepcion(uuid) from public,anon;
grant execute on function public.aprobar_traslado_recepcion(uuid) to authenticated,service_role;
revoke all on function public.enrutar_movimiento_cartera_retail() from public,anon,authenticated;
create trigger trg_enrutar_movimiento_cartera_retail before insert on public.movimientos_cartera for each row execute function public.enrutar_movimiento_cartera_retail();
