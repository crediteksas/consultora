-- A returned defective accessory may already have been exchanged by its supplier.
-- Record the exchange separately; do not refund cash or change the sale a second time.
alter table public.venta_devoluciones
  drop constraint venta_devoluciones_estado_producto_check,
  add constraint venta_devoluciones_estado_producto_check
    check (estado_producto in ('defectuoso_en_tienda','reemplazado_por_proveedor')),
  add column cambio_proveedor_fecha date,
  add column cambio_proveedor_motivo text,
  add column cambio_proveedor_por uuid references public.perfiles(id),
  add column cambio_proveedor_salida_id bigint unique references public.movimientos(id),
  add column cambio_proveedor_entrada_id bigint unique references public.movimientos(id),
  add constraint venta_devoluciones_cambio_completo check (
    (estado_producto='defectuoso_en_tienda' and cambio_proveedor_fecha is null
      and cambio_proveedor_motivo is null and cambio_proveedor_por is null
      and cambio_proveedor_salida_id is null and cambio_proveedor_entrada_id is null)
    or (estado_producto='reemplazado_por_proveedor' and estado='aplicada'
      and cambio_proveedor_fecha is not null and cambio_proveedor_fecha>=fecha_devolucion
      and cambio_proveedor_motivo is not null and length(trim(cambio_proveedor_motivo))>=10
      and cambio_proveedor_por is not null and cambio_proveedor_salida_id is not null
      and cambio_proveedor_entrada_id is not null
      and cambio_proveedor_salida_id<>cambio_proveedor_entrada_id)
  );
create index venta_devoluciones_cambio_responsable on public.venta_devoluciones(cambio_proveedor_por);
grant select(cambio_proveedor_fecha,cambio_proveedor_motivo,cambio_proveedor_por,
  cambio_proveedor_salida_id,cambio_proveedor_entrada_id) on public.venta_devoluciones to authenticated;

create function kora_private.registrar_cambio_proveedor_devolucion(
  p_devolucion uuid,p_fecha date,p_motivo text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  d public.venta_devoluciones%rowtype;
  origen public.movimientos%rowtype;
  salida bigint; entrada bigint; stock_final integer;
  costo numeric; costo_tienda numeric;
begin
  if not exists(select 1 from public.perfiles where id=auth.uid() and activo
    and rol in ('gerencia','auditoria')) then raise exception 'Solo Gerencia o Auditoría'; end if;
  if p_devolucion is null or p_fecha is null
    or p_fecha>(now() at time zone 'America/Bogota')::date
    or length(trim(coalesce(p_motivo,'')))<10 then raise exception 'Datos incompletos del cambio de proveedor'; end if;
  select * into d from public.venta_devoluciones where id=p_devolucion for update;
  if not found or d.estado<>'aplicada' then raise exception 'Devolución aplicada no encontrada'; end if;
  if p_fecha<d.fecha_devolucion then raise exception 'El cambio no puede ser anterior a la devolución'; end if;
  if d.estado_producto='reemplazado_por_proveedor' then
    if d.cambio_proveedor_fecha<>p_fecha or d.cambio_proveedor_motivo<>trim(p_motivo) then
      raise exception 'El cambio de proveedor ya está registrado con otros datos';
    end if;
    return jsonb_build_object('ok',true,'id',d.id,'ya_aplicado',true,
      'salida_id',d.cambio_proveedor_salida_id,'entrada_id',d.cambio_proveedor_entrada_id);
  end if;
  if d.estado_producto<>'defectuoso_en_tienda'
    or not exists(select 1 from public.productos where id=d.producto_id and tipo='cantidad') then
    raise exception 'Solo se admite el reemplazo del mismo accesorio defectuoso';
  end if;
  select * into origen from public.movimientos where id=d.movimiento_inventario_id;
  if not found or origen.tipo is distinct from 'ajuste_entrada' or origen.referencia_tipo is distinct from 'devolucion_defectuosa'
    or origen.referencia_id is distinct from d.id::text or origen.producto_id is distinct from d.producto_id
    or origen.tienda_codigo is distinct from d.tienda_codigo or origen.cantidad is distinct from d.cantidad
    or origen.unidad_id is not null then raise exception 'El reingreso defectuoso no coincide'; end if;
  costo:=(d.item_anterior->>'costo_congelado')::numeric;
  costo_tienda:=coalesce((d.item_anterior->>'costo_tienda_congelado')::numeric,costo);
  if costo is null or costo<0 or costo>='Infinity'::numeric
    or costo_tienda is null or costo_tienda<0 or costo_tienda>='Infinity'::numeric then
    raise exception 'Falta el costo trazable del accesorio devuelto';
  end if;
  -- Defective stock is segregated, so this outbound movement does not subtract sellable stock.
  insert into public.movimientos(tipo,tienda_codigo,producto_id,cantidad,costo,precio,
    referencia_tipo,referencia_id,reverso_de,usuario,nota)
  values('ajuste_salida',d.tienda_codigo,d.producto_id,d.cantidad,costo,origen.precio,
    'cambio_proveedor_defectuoso',d.id::text,origen.id,auth.uid(),
    d.referencia||' · Entregado al proveedor para cambio. Fecha real '||p_fecha||'. '||trim(p_motivo))
  returning id into salida;
  insert into public.stock_cantidad(producto_id,tienda_codigo,cantidad,costo_promedio,precio_tienda,updated_at)
  values(d.producto_id,d.tienda_codigo,d.cantidad,costo,costo_tienda,now())
  on conflict(producto_id,tienda_codigo) do update set
    cantidad=public.stock_cantidad.cantidad+excluded.cantidad,
    costo_promedio=case when public.stock_cantidad.cantidad=0 then excluded.costo_promedio
      else (public.stock_cantidad.cantidad*coalesce(public.stock_cantidad.costo_promedio,excluded.costo_promedio)
        +excluded.cantidad*excluded.costo_promedio)/(public.stock_cantidad.cantidad+excluded.cantidad) end,
    precio_tienda=case when public.stock_cantidad.cantidad=0 then excluded.precio_tienda
      else coalesce(public.stock_cantidad.precio_tienda,excluded.precio_tienda) end,
    updated_at=now()
  returning cantidad into stock_final;
  insert into public.movimientos(tipo,tienda_codigo,producto_id,cantidad,costo,precio,
    referencia_tipo,referencia_id,usuario,nota)
  values('ajuste_entrada',d.tienda_codigo,d.producto_id,d.cantidad,costo,origen.precio,
    'cambio_proveedor_reemplazo',d.id::text,auth.uid(),
    d.referencia||' · Reemplazo del proveedor DISPONIBLE PARA VENTA. Sin nueva compra ni pago. Fecha real '||p_fecha||'. '||trim(p_motivo))
  returning id into entrada;
  update public.venta_devoluciones set estado_producto='reemplazado_por_proveedor',
    cambio_proveedor_fecha=p_fecha,cambio_proveedor_motivo=trim(p_motivo),cambio_proveedor_por=auth.uid(),
    cambio_proveedor_salida_id=salida,cambio_proveedor_entrada_id=entrada where id=d.id;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
  values(auth.uid()::text,'CAMBIO_PROVEEDOR_DEVOLUCION','venta_devoluciones',d.id::text,
    jsonb_build_object('referencia',d.referencia,'venta_id',d.venta_id,'tienda',d.tienda_codigo,
      'producto_id',d.producto_id,'cantidad',d.cantidad,'fecha_real',p_fecha,'motivo',trim(p_motivo),
      'estado_anterior',d.estado_producto,'estado_nuevo','reemplazado_por_proveedor',
      'salida_id',salida,'entrada_id',entrada,'stock_disponible',stock_final,
      'sin_nuevo_reembolso',true,'sin_cambio_cartera_ni_banco',true));
  return jsonb_build_object('ok',true,'id',d.id,'ya_aplicado',false,
    'salida_id',salida,'entrada_id',entrada,'stock_disponible',stock_final);
end $$;
revoke all on function kora_private.registrar_cambio_proveedor_devolucion(uuid,date,text) from public,anon;
grant execute on function kora_private.registrar_cambio_proveedor_devolucion(uuid,date,text) to authenticated;
create function public.registrar_cambio_proveedor_devolucion(p_devolucion uuid,p_fecha date,p_motivo text)
returns jsonb language sql security invoker set search_path='' as $$
  select kora_private.registrar_cambio_proveedor_devolucion(p_devolucion,p_fecha,p_motivo);
$$;
revoke all on function public.registrar_cambio_proveedor_devolucion(uuid,date,text) from public,anon;
grant execute on function public.registrar_cambio_proveedor_devolucion(uuid,date,text) to authenticated;
