CREATE OR REPLACE FUNCTION kora_private.congelar_costo_movimiento_tienda()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 new.costo_tienda := null;
 if new.tienda_codigo = 'CENTRAL' then return new; end if;
 if new.tipo='venta' then
  select sum(vi.costo_tienda_congelado*vi.cantidad)/nullif(sum(vi.cantidad),0)
  into new.costo_tienda from public.venta_items vi
  where vi.venta_id::text=new.referencia_id and vi.producto_id=new.producto_id
  and vi.unidad_id is not distinct from new.unidad_id and vi.estado_costo_tienda='trazable';
 elsif new.tipo in ('carga_inicial','remision_entrada','traslado_entrada','traslado_salida') then
  new.costo_tienda := new.precio;
 elsif new.reverso_de is not null then
  select m.costo_tienda into new.costo_tienda from public.movimientos m where m.id=new.reverso_de;
 end if;
 if new.costo_tienda is null and new.tipo in ('ajuste','reverso') then
  if new.unidad_id is not null then
   select precio_tienda into new.costo_tienda from public.unidades where id=new.unidad_id;
  else
   select precio_tienda into new.costo_tienda from public.stock_cantidad where producto_id=new.producto_id and tienda_codigo=new.tienda_codigo;
  end if;
 end if;
 return new;
end $function$

CREATE OR REPLACE FUNCTION public.bloquear_mutacion_movimientos()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RAISE EXCEPTION 'La tabla movimientos es inmutable: los errores se corrigen con un movimiento de reverso, nunca editando o borrando.';
END $function$

CREATE OR REPLACE FUNCTION inventario_control.capturar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
 v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
 r record;
begin
 if tg_table_name = 'stock_cantidad' then
   for r in select tienda,producto,sum(q)::integer delta from (
     select v_old->>'tienda_codigo' tienda,(v_old->>'producto_id')::uuid producto,-coalesce((v_old->>'cantidad')::integer,0) q
     union all select v_new->>'tienda_codigo',(v_new->>'producto_id')::uuid,coalesce((v_new->>'cantidad')::integer,0)
   ) s where tienda is not null group by tienda,producto having sum(q)<>0 loop
     insert into inventario_control.eventos(tienda_codigo,producto_id,delta,actor,ajuste)
       values(r.tienda,r.producto,r.delta,auth.uid(),coalesce(current_setting('kora.conteo_ajuste',true),'')='si');
   end loop;
 else
   for r in select tienda,producto,imei,sum(q)::integer delta from (
     select v_old->>'tienda_actual' tienda,(v_old->>'producto_id')::uuid producto,v_old->>'imei' imei,
       case when v_old->>'estado'='disponible' then -1 else 0 end q
     union all select v_new->>'tienda_actual',(v_new->>'producto_id')::uuid,v_new->>'imei',
       case when v_new->>'estado'='disponible' then 1 else 0 end
   ) s where tienda is not null group by tienda,producto,imei having sum(q)<>0 loop
     insert into inventario_control.eventos(tienda_codigo,producto_id,imei,delta,actor,ajuste)
       values(r.tienda,r.producto,coalesce(r.imei,''),r.delta,auth.uid(),coalesce(current_setting('kora.conteo_ajuste',true),'')='si');
   end loop;
 end if;
 return coalesce(new,old);
end $function$

CREATE OR REPLACE FUNCTION public.proteger_registro_venta_confirmada()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if current_setting('app.ajuste_venta_autorizado', true) = '1' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'UPDATE'
     and tg_table_name = 'ventas'
     and old.total = 0
     and not coalesce(old.anulada, false)
     and new.id = old.id
     and new.tienda_codigo = old.tienda_codigo
     and new.vendedor is not distinct from old.vendedor
     and new.tipo = old.tipo
     and new.cliente_id is not distinct from old.cliente_id
     and new.fecha = old.fecha
     and new.nota is not distinct from old.nota
     and not coalesce(new.anulada, false) then
    return new;
  end if;

  raise exception 'Registro de venta inmutable. Usa Corregir o anular venta para conservar la trazabilidad.';
end;
$function$

CREATE OR REPLACE FUNCTION public.aplicar_utilidad_tienda_costo_remision()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_tienda_codigo text;
  v_costo_remision numeric;
begin
  if new.precio_venta is null or new.precio_venta < 0
     or new.cantidad is null or new.cantidad <= 0 then
    raise exception 'Precio de venta y cantidad deben ser válidos';
  end if;

  if tg_op = 'UPDATE' then
    v_costo_remision := coalesce(
      old.costo_remision_congelado,
      old.costo_congelado
    );
  elsif new.unidad_id is not null then
    select u.costo_remision
    into v_costo_remision
    from public.unidades u
    where u.id = new.unidad_id
    for share;
  else
    select v.tienda_codigo
    into v_tienda_codigo
    from public.ventas v
    where v.id = new.venta_id;

    select sc.costo_promedio
    into v_costo_remision
    from public.stock_cantidad sc
    where sc.producto_id = new.producto_id
      and sc.tienda_codigo = v_tienda_codigo
    for share;
  end if;

  if v_costo_remision is null or v_costo_remision < 0 then
    raise exception 'La línea no tiene costo real trazable';
  end if;

  new.costo_remision_congelado := v_costo_remision;
  new.costo_congelado := v_costo_remision;
  new.utilidad := (new.precio_venta - v_costo_remision) * new.cantidad;
  return new;
end;
$function$
