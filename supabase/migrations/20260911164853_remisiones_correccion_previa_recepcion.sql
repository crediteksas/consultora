-- Correcciones auditadas antes de recepción. No modifica remisiones existentes.
create schema if not exists remisiones_edicion_private;
revoke all on schema remisiones_edicion_private from public, anon, authenticated;
grant usage on schema remisiones_edicion_private to authenticated;
alter table public.remisiones add column if not exists revision integer not null default 0;
create table remisiones_edicion_private.permisos (
  usuario_id uuid primary key references public.perfiles(id),
  creado_at timestamptz not null default now()
);
alter table remisiones_edicion_private.permisos enable row level security;
create table remisiones_edicion_private.historial (
  id bigint generated always as identity primary key,
  remision_id uuid not null references public.remisiones(id),
  revision integer not null,
  usuario_id uuid not null,
  motivo text not null,
  anterior jsonb not null,
  posterior jsonb not null,
  creado_at timestamptz not null default now(),
  unique(remision_id, revision)
);
alter table remisiones_edicion_private.historial enable row level security;
revoke all on all tables in schema remisiones_edicion_private from public, anon, authenticated;
insert into remisiones_edicion_private.permisos(usuario_id)
select p.id from public.perfiles p join auth.users u on u.id=p.id
where lower(u.email)='gestion@crediteksas.com' and p.activo and p.rol='auditoria';

create function remisiones_edicion_private.permitido() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
 select auth.uid() is not null and exists (
   select 1 from public.perfiles p where p.id=auth.uid() and p.activo
   and (p.rol='gerencia' or (p.rol='auditoria' and exists (
     select 1 from remisiones_edicion_private.permisos g where g.usuario_id=p.id)))
 );
$$;
revoke all on function remisiones_edicion_private.permitido() from public, anon;
grant execute on function remisiones_edicion_private.permitido() to authenticated;
create function public.puede_corregir_remisiones() returns boolean
language sql stable security invoker set search_path = public, pg_temp as $$
 select remisiones_edicion_private.permitido();
$$;
revoke all on function public.puede_corregir_remisiones() from public, anon;
grant execute on function public.puede_corregir_remisiones() to authenticated;

CREATE OR REPLACE FUNCTION remisiones_edicion_private.reservar(p_remision_id uuid, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_remision_id uuid;
  v_consecutivo bigint;
  v_item jsonb;
  v_producto record;
  v_item_id uuid;
  v_costo_promedio numeric;
  v_precio_tienda_stock numeric;
  v_stock_actual integer;
  v_disponibles integer;
  v_unidad record;
  v_lote record;
  v_total_cantidad integer;
  v_suma_costos numeric;
  v_precio_override numeric;
  v_precio_final numeric;
  v_factura_filtro uuid;
  v_restante integer;
  v_tomar integer;
begin
  if not remisiones_edicion_private.permitido() then raise exception 'No autorizado'; end if;
  select id, consecutivo into v_remision_id, v_consecutivo
  from public.remisiones where id = p_remision_id and estado = 'despachada' and recibida_at is null for update;
  if not found then raise exception 'La remisión ya no permite correcciones'; end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select id, tipo, nombre
    into v_producto
    from public.productos
    where id = (v_item->>'producto_id')::uuid;

    if v_producto.id is null then
      raise exception 'Producto % no encontrado', v_item->>'producto_id';
    end if;

    declare
      v_cantidad integer := (v_item->>'cantidad')::integer;
    begin
      if v_cantidad is null or v_cantidad <= 0 then
        raise exception 'Cantidad invalida para "%": %',
          v_producto.nombre, v_cantidad;
      end if;

      v_precio_override := nullif(v_item->>'precio_override', '')::numeric;
      v_factura_filtro := nullif(
        v_item->>'factura_proveedor_id',
        ''
      )::uuid;

      if v_precio_override is not null and v_precio_override < 0 then
        raise exception 'precio_override invalido para "%": %',
          v_producto.nombre, v_precio_override;
      end if;

      perform pg_advisory_xact_lock(
        hashtextextended(v_producto.id::text, 0)
      );

      if v_producto.tipo = 'serializado' then
        select count(*)
        into v_disponibles
        from public.unidades
        where producto_id = v_producto.id
          and tienda_actual = 'CENTRAL'
          and estado = 'disponible'
          and imei is null
          and (
            v_factura_filtro is null
            or factura_proveedor_id = v_factura_filtro
          );

        if v_disponibles < v_cantidad then
          raise exception
            'Stock insuficiente de "%" en la factura elegida: hay % disponibles y se piden %',
            v_producto.nombre, v_disponibles, v_cantidad;
        end if;

        v_total_cantidad := 0;
        v_suma_costos := 0;

        for v_unidad in
          select id, costo_remision, precio_tienda, factura_proveedor_id
          from public.unidades
          where producto_id = v_producto.id
            and tienda_actual = 'CENTRAL'
            and estado = 'disponible'
            and imei is null
            and (
              v_factura_filtro is null
              or factura_proveedor_id = v_factura_filtro
            )
          order by created_at, id
          limit v_cantidad
          for update skip locked
        loop
          v_precio_final := coalesce(
            v_precio_override,
            v_unidad.precio_tienda,
            0
          );
          if v_precio_final = 0 then
            raise exception 'Unidad % de "%" no tiene precio_tienda definido.',
              v_unidad.id, v_producto.nombre;
          end if;

          insert into public.remision_items (
            remision_id,
            producto_id,
            cantidad,
            precio_remision,
            factura_proveedor_id
          )
          values (
            v_remision_id,
            v_producto.id,
            1,
            v_precio_final,
            v_unidad.factura_proveedor_id
          )
          returning id into v_item_id;

          update public.unidades
          set estado = 'en_traslado',
              remision_item_id = v_item_id
          where id = v_unidad.id;

          insert into public.remision_margenes (
            remision_item_id,
            unidad_id,
            factura_proveedor_id,
            costo_oscar,
            cantidad
          )
          values (
            v_item_id,
            v_unidad.id,
            v_unidad.factura_proveedor_id,
            coalesce(v_unidad.costo_remision, 0),
            1
          );

          v_total_cantidad := v_total_cantidad + 1;
          v_suma_costos := v_suma_costos
            + coalesce(v_unidad.costo_remision, 0);
        end loop;

        if v_total_cantidad < v_cantidad then
          raise exception
            'Concurrencia: no se pudieron reservar % unidades de "%" (se reservaron %)',
            v_cantidad, v_producto.nombre, v_total_cantidad;
        end if;

        insert into public.movimientos (
          tipo,
          tienda_codigo,
          producto_id,
          cantidad,
          costo,
          precio,
          referencia_tipo,
          referencia_id,
          usuario
        )
        values (
          'remision_salida_central',
          'CENTRAL',
          v_producto.id,
          v_cantidad,
          v_suma_costos / nullif(v_total_cantidad, 0),
          v_precio_final,
          'remision',
          v_remision_id::text,
          auth.uid()
        );
      else
        select cantidad, costo_promedio, precio_tienda
        into v_stock_actual, v_costo_promedio, v_precio_tienda_stock
        from public.stock_cantidad
        where producto_id = v_producto.id
          and tienda_codigo = 'CENTRAL'
        for update;

        select coalesce(sum(cantidad), 0)::integer
        into v_disponibles
        from public.stock_cantidad_lotes
        where producto_id = v_producto.id
          and tienda_codigo = 'CENTRAL'
          and cantidad > 0
          and (
            v_factura_filtro is null
            or factura_proveedor_id = v_factura_filtro
          );

        if v_stock_actual is null
           or v_stock_actual < v_cantidad
           or v_disponibles < v_cantidad
        then
          raise exception
            'Stock insuficiente de "%" en la factura elegida: hay % disponibles y se piden %',
            v_producto.nombre,
            least(coalesce(v_stock_actual, 0), v_disponibles),
            v_cantidad;
        end if;

        v_restante := v_cantidad;
        v_total_cantidad := 0;
        v_suma_costos := 0;

        for v_lote in
          select
            l.id,
            l.factura_proveedor_id,
            l.cantidad,
            l.costo_unitario,
            l.precio_tienda
          from public.stock_cantidad_lotes l
          join public.facturas_proveedor fp
            on fp.id = l.factura_proveedor_id
          where l.producto_id = v_producto.id
            and l.tienda_codigo = 'CENTRAL'
            and l.cantidad > 0
            and (
              v_factura_filtro is null
              or l.factura_proveedor_id = v_factura_filtro
            )
          order by fp.fecha, l.created_at, l.id
          for update of l skip locked
        loop
          exit when v_restante <= 0;
          v_tomar := least(v_restante, v_lote.cantidad);
          v_precio_final := coalesce(
            v_precio_override,
            v_lote.precio_tienda,
            0
          );

          if v_precio_final = 0 then
            raise exception
              '"%" no tiene precio_tienda definido en el lote seleccionado.',
              v_producto.nombre;
          end if;

          insert into public.remision_items (
            remision_id,
            producto_id,
            cantidad,
            precio_remision,
            factura_proveedor_id
          )
          values (
            v_remision_id,
            v_producto.id,
            v_tomar,
            v_precio_final,
            v_lote.factura_proveedor_id
          )
          returning id into v_item_id;

          insert into public.remision_margenes (
            remision_item_id,
            unidad_id,
            factura_proveedor_id,
            costo_oscar,
            cantidad
          )
          values (
            v_item_id,
            null,
            v_lote.factura_proveedor_id,
            v_lote.costo_unitario,
            v_tomar
          );

          update public.stock_cantidad_lotes
          set cantidad = cantidad - v_tomar,
              updated_at = now()
          where id = v_lote.id;

          insert into public.movimientos (
            tipo,
            tienda_codigo,
            producto_id,
            cantidad,
            costo,
            precio,
            referencia_tipo,
            referencia_id,
            usuario
          )
          values (
            'remision_salida_central',
            'CENTRAL',
            v_producto.id,
            v_tomar,
            v_lote.costo_unitario,
            v_precio_final,
            'remision',
            v_remision_id::text,
            auth.uid()
          );

          v_restante := v_restante - v_tomar;
          v_total_cantidad := v_total_cantidad + v_tomar;
          v_suma_costos := v_suma_costos
            + (v_tomar * v_lote.costo_unitario);
        end loop;

        if v_restante > 0 then
          raise exception
            'Concurrencia: no se pudieron reservar % unidades de "%" (faltaron %)',
            v_cantidad, v_producto.nombre, v_restante;
        end if;

        update public.stock_cantidad as sc
        set
          cantidad = sc.cantidad - v_cantidad,
          costo_promedio = coalesce(
            (
              select
                sum(l.cantidad * l.costo_unitario)
                / nullif(sum(l.cantidad), 0)
              from public.stock_cantidad_lotes l
              where l.producto_id = v_producto.id
                and l.tienda_codigo = 'CENTRAL'
                and l.cantidad > 0
            ),
            sc.costo_promedio
          ),
          precio_tienda = coalesce(
            (
              select l.precio_tienda
              from public.stock_cantidad_lotes l
              join public.facturas_proveedor fp
                on fp.id = l.factura_proveedor_id
              where l.producto_id = v_producto.id
                and l.tienda_codigo = 'CENTRAL'
                and l.cantidad > 0
              order by fp.fecha, l.created_at, l.id
              limit 1
            ),
            sc.precio_tienda
          ),
          factura_proveedor_id = (
            select l.factura_proveedor_id
            from public.stock_cantidad_lotes l
            join public.facturas_proveedor fp
              on fp.id = l.factura_proveedor_id
            where l.producto_id = v_producto.id
              and l.tienda_codigo = 'CENTRAL'
              and l.cantidad > 0
            order by fp.fecha, l.created_at, l.id
            limit 1
          ),
          updated_at = now()
        where sc.producto_id = v_producto.id
          and sc.tienda_codigo = 'CENTRAL';
      end if;
    end;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'remision_id', v_remision_id,
    'consecutivo', v_consecutivo
  );
end;
$function$;

create function remisiones_edicion_private.corregir(p_remision_id uuid, p_revision integer, p_items jsonb, p_motivo text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 r public.remisiones%rowtype;
 old_item record;
 margin_row record;
 incoming jsonb;
 pending jsonb := '[]';
 before_rows jsonb;
 after_rows jsonb;
 product_lock uuid;
 movement_id bigint;
 n integer;
begin
 if not remisiones_edicion_private.permitido() then raise exception 'No tienes permiso para corregir remisiones cerradas'; end if;
 select * into r from public.remisiones where id=p_remision_id for update;
 if not found or r.estado <> 'despachada' or r.recibida_at is not null then
   raise exception 'Solo se puede corregir antes de que la tienda acepte la remisión';
 end if;
 if p_revision is null or p_revision <> r.revision then raise exception 'La remisión cambió. Cierra y vuelve a abrir antes de guardar'; end if;
 if length(trim(coalesce(p_motivo,''))) < 5 then raise exception 'Escribe el motivo de la corrección (mínimo 5 caracteres)'; end if;
 if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then raise exception 'Agrega al menos un producto'; end if;
 for incoming in select value from jsonb_array_elements(p_items) loop
   if not exists(select 1 from public.productos where id=(incoming->>'producto_id')::uuid)
      or coalesce((incoming->>'cantidad')::numeric,0) <= 0
      or (incoming->>'cantidad')::numeric <> trunc((incoming->>'cantidad')::numeric)
      or coalesce((incoming->>'precio_remision')::numeric,0) <= 0
      or (incoming->>'precio_remision')::numeric::text in ('NaN','Infinity','-Infinity') then
     raise exception 'Referencia, cantidad o precio inválido';
   end if;
   if nullif(incoming->>'id','') is not null and not exists(
      select 1 from public.remision_items where id=(incoming->>'id')::uuid and remision_id=r.id) then
     raise exception 'El producto no pertenece a esta remisión';
   end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_items) e where nullif(e->>'id','') is not null group by e->>'id' having count(*)>1) then raise exception 'Líneas repetidas'; end if;
 -- Serializa con el despacho canónico para todos los productos, siempre en el mismo orden.
 for product_lock in
   select producto_id from public.remision_items where remision_id=r.id
   union select (e->>'producto_id')::uuid from jsonb_array_elements(p_items) e
   order by 1
 loop perform pg_advisory_xact_lock(hashtextextended(product_lock::text,0)); end loop;
 select jsonb_agg(to_jsonb(i) order by i.id) into before_rows from public.remision_items i where remision_id=r.id;
 for old_item in select i.*,p.tipo from public.remision_items i join public.productos p on p.id=i.producto_id where remision_id=r.id order by i.id for update of i loop
   select e into incoming from jsonb_array_elements(p_items) e where e->>'id'=old_item.id::text;
   if incoming is not null and (incoming->>'producto_id')::uuid=old_item.producto_id and (incoming->>'cantidad')::integer=old_item.cantidad then
     -- Un cambio de precio conserva unidad, factura de origen y costo B2B.
     update public.remision_items set precio_remision=(incoming->>'precio_remision')::numeric where id=old_item.id;
     continue;
   end if;
   if old_item.tipo='serializado' then
     select count(*) into n from public.unidades where remision_item_id=old_item.id;
     if n <> old_item.cantidad or exists(select 1 from public.unidades where remision_item_id=old_item.id and (estado<>'en_traslado' or imei is not null or tienda_actual<>'CENTRAL')) then
       raise exception 'Las unidades de esta línea no están íntegramente reservadas en bodega; requiere revisión';
     end if;
     insert into public.movimientos(tipo,tienda_codigo,producto_id,unidad_id,cantidad,costo,precio,referencia_tipo,referencia_id,usuario,nota)
       select 'ajuste_entrada','CENTRAL',producto_id,id,1,costo_remision,precio_tienda,'remision_correccion',r.id::text,auth.uid(),p_motivo
       from public.unidades where remision_item_id=old_item.id;
     update public.unidades set estado='disponible',remision_item_id=null where remision_item_id=old_item.id;
   else
     if (select coalesce(sum(cantidad),0) from public.remision_margenes where remision_item_id=old_item.id) <> old_item.cantidad
        or exists(select 1 from public.remision_margenes where remision_item_id=old_item.id and (cantidad<=0 or costo_oscar is null or factura_proveedor_id is null)) then
       raise exception 'Falta trazabilidad del costo o factura de esta línea; no se modificó inventario';
     end if;
     perform 1 from public.stock_cantidad where producto_id=old_item.producto_id and tienda_codigo='CENTRAL' for update;
     if not found then raise exception 'No existe el saldo de bodega de esta referencia'; end if;
     for margin_row in select * from public.remision_margenes where remision_item_id=old_item.id loop
       insert into public.movimientos(tipo,tienda_codigo,producto_id,cantidad,costo,precio,referencia_tipo,referencia_id,usuario,nota)
       values('ajuste_entrada','CENTRAL',old_item.producto_id,margin_row.cantidad,margin_row.costo_oscar,old_item.precio_remision,'remision_correccion',r.id::text,auth.uid(),p_motivo)
       returning id into movement_id;
       insert into public.stock_cantidad_lotes(movimiento_entrada_id,producto_id,tienda_codigo,factura_proveedor_id,cantidad,costo_unitario,precio_tienda)
       values(movement_id,old_item.producto_id,'CENTRAL',margin_row.factura_proveedor_id,margin_row.cantidad,margin_row.costo_oscar,old_item.precio_remision);
     end loop;
     update public.stock_cantidad sc set cantidad=sc.cantidad+old_item.cantidad,
       costo_promedio=(select sum(l.cantidad*l.costo_unitario)/nullif(sum(l.cantidad),0) from public.stock_cantidad_lotes l where l.producto_id=sc.producto_id and l.tienda_codigo='CENTRAL'),
       updated_at=now()
     where sc.producto_id=old_item.producto_id and sc.tienda_codigo='CENTRAL';
   end if;
   delete from public.remision_margenes where remision_item_id=old_item.id;
   delete from public.remision_items where id=old_item.id;
   if incoming is not null then
     pending := pending || jsonb_build_array(jsonb_build_object(
       'producto_id',incoming->>'producto_id','cantidad',incoming->'cantidad','precio_override',incoming->'precio_remision',
       'factura_proveedor_id',case when (incoming->>'producto_id')::uuid=old_item.producto_id then old_item.factura_proveedor_id else null end));
   end if;
 end loop;
 for incoming in select e from jsonb_array_elements(p_items) e where nullif(e->>'id','') is null loop
   pending := pending || jsonb_build_array(jsonb_build_object('producto_id',incoming->>'producto_id','cantidad',incoming->'cantidad','precio_override',incoming->'precio_remision'));
 end loop;
 if jsonb_array_length(pending)>0 then perform remisiones_edicion_private.reservar(r.id,pending); end if;
 update public.remisiones set revision=revision+1 where id=r.id returning revision into n;
 select jsonb_agg(to_jsonb(i) order by i.id) into after_rows from public.remision_items i where remision_id=r.id;
 insert into remisiones_edicion_private.historial(remision_id,revision,usuario_id,motivo,anterior,posterior)
 values(r.id,n,auth.uid(),trim(p_motivo),before_rows,after_rows);
 return jsonb_build_object('ok',true,'remision_id',r.id,'revision',n);
end;
$$;
revoke all on all functions in schema remisiones_edicion_private from public,anon,authenticated;
grant execute on function remisiones_edicion_private.permitido() to authenticated;
grant execute on function remisiones_edicion_private.corregir(uuid,integer,jsonb,text) to authenticated;
create function public.corregir_remision_despachada(p_remision_id uuid,p_revision integer,p_items jsonb,p_motivo text)
returns jsonb language sql security invoker set search_path=public,pg_temp as $$
 select remisiones_edicion_private.corregir(p_remision_id,p_revision,p_items,p_motivo);
$$;
revoke all on function public.corregir_remision_despachada(uuid,integer,jsonb,text) from public,anon;
grant execute on function public.corregir_remision_despachada(uuid,integer,jsonb,text) to authenticated;
CREATE OR REPLACE FUNCTION remisiones_edicion_private.recibir(p_remision_id uuid, p_items jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_remision record;
  v_item record;
  v_payload jsonb;
  v_imei text;
  v_imei_norm text;
  v_cantidad_recibida int;
  v_total numeric := 0;
  v_count_imeis int;
  v_esperadas int;
  v_faltantes int;
  v_dup_id uuid;
  v_unidad_id uuid;
  v_rol text;
BEGIN
  v_rol := rol_actual();
  IF v_rol IS NULL THEN
    RAISE EXCEPTION 'Tu usuario no tiene un perfil asignado. Contacta al administrador.';
  END IF;

  SELECT * INTO v_remision FROM remisiones WHERE id = p_remision_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Remision % no encontrada', p_remision_id;
  END IF;
  IF v_remision.estado <> 'despachada' THEN
    RAISE EXCEPTION 'La remision debe estar en estado despachada (estado actual: %)', v_remision.estado;
  END IF;

  IF NOT (es_central() OR tienda_actual() = v_remision.tienda_codigo) THEN
    RAISE EXCEPTION 'No autorizado: esta remision no pertenece a tu tienda';
  END IF;

  -- Las aplicaciones anteriores siguen funcionando para remisiones nunca corregidas.
  -- Después de una corrección, deben enviar la revisión que realmente mostraron.
  IF v_remision.revision > 0 THEN
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items)=0 THEN
      RAISE EXCEPTION 'La remisión fue corregida. Actualiza y revisa sus productos antes de aceptar';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) e WHERE (e->>'revision')::integer IS DISTINCT FROM v_remision.revision)
      OR (SELECT count(*) FROM jsonb_array_elements(p_items)) <> (SELECT count(*) FROM remision_items WHERE remision_id=p_remision_id)
      OR EXISTS (SELECT 1 FROM remision_items i WHERE i.remision_id=p_remision_id AND
        (SELECT count(*) FROM jsonb_array_elements(p_items) e WHERE e->>'remision_item_id'=i.id::text) <> 1)
    THEN RAISE EXCEPTION 'La remisión fue corregida. Actualiza y revisa precios, cantidades y referencias antes de aceptar';
    END IF;
  END IF;

  FOR v_item IN
    SELECT ri.id, ri.producto_id, ri.cantidad, ri.precio_remision, ri.factura_proveedor_id, p.tipo, p.nombre
    FROM remision_items ri
    JOIN productos p ON p.id = ri.producto_id
    WHERE ri.remision_id = p_remision_id
  LOOP
    SELECT elem INTO v_payload
    FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) elem
    WHERE (elem->>'remision_item_id')::uuid = v_item.id
    LIMIT 1;

    IF v_item.tipo = 'serializado' THEN
      v_count_imeis := CASE WHEN v_payload IS NULL THEN 0
                            ELSE COALESCE(jsonb_array_length(v_payload->'imeis'), 0) END;
      v_esperadas := v_item.cantidad;

      IF v_count_imeis > v_esperadas THEN
        RAISE EXCEPTION 'Se enviaron % IMEIs para "%" pero solo se esperaban %',
          v_count_imeis, v_item.nombre, v_esperadas;
      END IF;

      FOR v_imei IN SELECT jsonb_array_elements_text(v_payload->'imeis') LOOP
        v_imei_norm := trim(v_imei);
        IF v_imei_norm IS NULL OR v_imei_norm = '' THEN
          RAISE EXCEPTION 'IMEI vacio en la lista de "%"', v_item.nombre;
        END IF;

        SELECT id INTO v_dup_id FROM unidades WHERE imei = v_imei_norm LIMIT 1;
        IF v_dup_id IS NOT NULL THEN
          RAISE EXCEPTION 'El IMEI "%" ya esta registrado en el sistema.', v_imei_norm;
        END IF;

        SELECT id INTO v_unidad_id
        FROM unidades
        WHERE remision_item_id = v_item.id
          AND estado = 'en_traslado'
          AND imei IS NULL
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED;

        IF v_unidad_id IS NULL THEN
          RAISE EXCEPTION 'No hay mas unidades reservadas para "%" en esta remision.', v_item.nombre;
        END IF;

        UPDATE unidades
        SET imei = v_imei_norm,
            estado = 'disponible',
            precio_tienda = v_item.precio_remision,
            tienda_actual = v_remision.tienda_codigo
        WHERE id = v_unidad_id;
      END LOOP;

      INSERT INTO movimientos (tipo, tienda_codigo, producto_id, cantidad, costo, precio, referencia_tipo, referencia_id, usuario)
      VALUES ('remision_entrada', v_remision.tienda_codigo, v_item.producto_id, v_count_imeis,
              v_item.precio_remision, v_item.precio_remision, 'remision', v_remision.id::text, auth.uid());

      v_faltantes := v_esperadas - v_count_imeis;
      IF v_faltantes > 0 THEN
        INSERT INTO ajustes_inventario (tienda_codigo, producto_id, diferencia, motivo, estado, solicitado_por)
        VALUES (v_remision.tienda_codigo, v_item.producto_id, -v_faltantes,
          'Faltantes al recibir remision #' || v_remision.consecutivo || ' (serializado ' || v_item.nombre || '): se despacharon ' || v_esperadas || ' y llegaron ' || v_count_imeis,
          'pendiente', auth.uid());
      END IF;

      v_total := v_total + (v_item.precio_remision * v_count_imeis);

    ELSE
      -- Bloque cantidad: AHORA incluye precio_tienda y factura_proveedor_id
      v_cantidad_recibida := COALESCE((v_payload->>'cantidad_recibida')::int, v_item.cantidad);
      IF v_cantidad_recibida < 0 THEN
        RAISE EXCEPTION 'Cantidad recibida invalida para "%"', v_item.nombre;
      END IF;

      IF v_cantidad_recibida > 0 THEN
        PERFORM public.aplicar_costo_promedio_tienda(
          v_remision.tienda_codigo, v_item.producto_id, v_cantidad_recibida,
          v_item.precio_remision, v_item.precio_remision,
          'cantidad', 'remision', v_remision.id::text
        );
      END IF;

      UPDATE public.stock_cantidad
      SET factura_proveedor_id = v_item.factura_proveedor_id
      WHERE producto_id = v_item.producto_id
        AND tienda_codigo = v_remision.tienda_codigo;

      INSERT INTO movimientos (tipo, tienda_codigo, producto_id, cantidad, costo, precio, referencia_tipo, referencia_id, usuario)
      VALUES ('remision_entrada', v_remision.tienda_codigo, v_item.producto_id, v_cantidad_recibida, v_item.precio_remision, v_item.precio_remision, 'remision', v_remision.id::text, auth.uid());

      IF v_cantidad_recibida <> v_item.cantidad THEN
        INSERT INTO ajustes_inventario (tienda_codigo, producto_id, diferencia, motivo, estado, solicitado_por)
        VALUES (v_remision.tienda_codigo, v_item.producto_id, v_cantidad_recibida - v_item.cantidad,
          'Diferencia detectada al recibir remision #' || v_remision.consecutivo || ': se despacharon ' || v_item.cantidad || ' y llegaron ' || v_cantidad_recibida,
          'pendiente', auth.uid());
      END IF;

      v_total := v_total + (v_item.precio_remision * v_cantidad_recibida);
    END IF;
  END LOOP;

  IF v_total > 0 THEN
    INSERT INTO cuenta_corriente (tienda_codigo, tipo, concepto, monto, referencia_tipo, referencia_id, usuario)
    VALUES (v_remision.tienda_codigo, 'cargo', 'Remision #' || v_remision.consecutivo, v_total, 'remision', v_remision.id::text, auth.uid());
  END IF;

  UPDATE remisiones SET estado = 'recibida', recibida_at = now() WHERE id = p_remision_id;

  RETURN jsonb_build_object('ok', true, 'total', v_total, 'consecutivo', v_remision.consecutivo);
END;
$function$;

revoke all on function remisiones_edicion_private.recibir(uuid,jsonb) from public,anon;
grant execute on function remisiones_edicion_private.recibir(uuid,jsonb) to authenticated;
create or replace function public.confirmar_recepcion_remision(p_remision_id uuid,p_items jsonb default null)
returns jsonb language sql security invoker set search_path=public,pg_temp as $$
 select remisiones_edicion_private.recibir(p_remision_id,p_items);
$$;
revoke all on function public.confirmar_recepcion_remision(uuid,jsonb) from public,anon;
grant execute on function public.confirmar_recepcion_remision(uuid,jsonb) to authenticated;

-- No se permite saltar la RPC auditada mediante UPDATE/DELETE directo de la API.
create function remisiones_edicion_private.proteger_linea() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare parent_id uuid; parent_state text;
begin
 if current_user = 'postgres' then return coalesce(new,old); end if;
 if tg_table_name='remision_items' then parent_id:=coalesce(new.remision_id,old.remision_id);
 else select remision_id into parent_id from public.remision_items where id=coalesce(new.remision_item_id,old.remision_item_id);
 end if;
 select estado into parent_state from public.remisiones where id=parent_id for update;
 if parent_state is distinct from 'borrador' then raise exception 'Usa Corregir remisión antes de recepción; las recibidas no son editables'; end if;
 -- También protege el origen si se intenta reasignar una línea.
 if tg_op='UPDATE' and tg_table_name='remision_items' and old.remision_id<>new.remision_id then
   select estado into parent_state from public.remisiones where id=old.remision_id for update;
   if parent_state is distinct from 'borrador' then raise exception 'No se puede trasladar una línea despachada'; end if;
 end if;
 if tg_op='UPDATE' and tg_table_name='remision_margenes' and old.remision_item_id<>new.remision_item_id then
   select r.estado into parent_state from public.remisiones r join public.remision_items i on i.remision_id=r.id where i.id=old.remision_item_id for update of r;
   if parent_state is distinct from 'borrador' then raise exception 'No se puede trasladar el margen de una línea despachada'; end if;
 end if;
 return coalesce(new,old);
end;
$$;
revoke all on function remisiones_edicion_private.proteger_linea() from public,anon,authenticated;
create trigger proteger_remision_item before insert or update or delete on public.remision_items
 for each row execute function remisiones_edicion_private.proteger_linea();
create trigger proteger_remision_margen before insert or update or delete on public.remision_margenes
 for each row execute function remisiones_edicion_private.proteger_linea();

create function remisiones_edicion_private.proteger_cabecera() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if current_user='postgres' then return coalesce(new,old); end if;
 if tg_op='DELETE' and old.estado<>'borrador' then raise exception 'No se puede eliminar una remisión despachada'; end if;
 if tg_op='UPDATE' and (old.estado<>'borrador' or new.revision<>old.revision or new.estado not in ('borrador','despachada','anulada')) then
   raise exception 'Usa la acción de corrección o recepción; no se puede reabrir una remisión';
 end if;
 return coalesce(new,old);
end;
$$;
revoke all on function remisiones_edicion_private.proteger_cabecera() from public,anon,authenticated;
create trigger proteger_remision_cabecera before update or delete on public.remisiones
 for each row execute function remisiones_edicion_private.proteger_cabecera();
