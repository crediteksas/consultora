-- KORA-2026-000074: la SIMCAR WOM de Kredisinu #2412 se cobró a $5.000,
-- pero quedó registrada a $50.000. Conserva el arqueo histórico y su
-- declaración original; la diferencia se refleja en el arrastre posterior.
begin;
set local lock_timeout = '5s';

do $$
declare
  v_venta public.ventas%rowtype;
  v_item public.venta_items%rowtype;
  v_producto public.productos%rowtype;
  v_corte public.caja_cortes%rowtype;
  v_caja_cerrada public.caja_diaria%rowtype;
  v_actor uuid;
  v_guard_original text;
  v_guard_temporal text;
  v_caja_antes jsonb;
  v_caja_despues jsonb;
  v_antes jsonb;
  v_despues jsonb;
  v_ajuste uuid;
  v_motivo text := 'KORA-2026-000074: SIMCAR WOM venta #2412 cobrada a $5.000 y registrada a $50.000. Arqueo original conservado; efectivo físico del cierre pendiente de corroborar.';
begin
  perform pg_advisory_xact_lock(hashtextextended('caja-arrastre:CK-09', 0));
  select * into v_venta from public.ventas
  where tienda_codigo='CK-09' and fecha=date '2026-10-28' and consecutivo=2412
  for update;
  if not found then raise exception 'No se encontró la venta #2412 de Kredisinu'; end if;

  if exists(select 1 from public.venta_ajustes_administrativos
            where venta_id=v_venta.id and motivo like 'KORA-2026-000074:%') then
    if v_venta.total=5000 and exists(
      select 1 from public.venta_items i join public.productos p on p.id=i.producto_id
      where i.venta_id=v_venta.id and p.codigo='2GE9004' and i.precio_venta=5000
    ) then return; end if;
    raise exception 'La rectificación anterior no coincide; revisar manualmente';
  end if;

  select i.* into v_item from public.venta_items i
    join public.productos p on p.id=i.producto_id
    where i.venta_id=v_venta.id and p.codigo='2GE9004' for update of i;
  select * into v_producto from public.productos where id=v_item.producto_id;
  select * into v_corte from public.caja_cortes
    where tienda_codigo='CK-09' and fecha=date '2026-10-28' for update;
  select * into v_caja_cerrada from public.caja_diaria
    where tienda_codigo='CK-09' and fecha=date '2026-10-28' for update;
  select id into v_actor from public.perfiles
    where nombre='Oscar Pacheco' and rol='gerencia' and activo;

  if v_venta.tipo<>'contado' or v_venta.anulada or v_venta.total<>50000
    or v_venta.cliente_id is not null
    or v_item.id is null or v_item.cantidad<>1 or v_item.unidad_id is not null
    or v_item.precio_venta<>50000 or v_item.costo_congelado<>1000
    or v_item.utilidad<>49000
    or v_producto.id is null or v_producto.nombre<>'SIMCAR WOM'
    or v_producto.precio_guia<>5000
    or (select count(*) from public.venta_items where venta_id=v_venta.id)<>1
    or v_corte.tienda_codigo is null or v_corte.estado<>'validada'
    or v_corte.efectivo_contado<>646650
    or v_corte.diferencia<>0
    or v_caja_cerrada.tienda_codigo is null or v_caja_cerrada.estado<>'cerrada'
    or v_caja_cerrada.efectivo_contado<>646650
    or v_caja_cerrada.efectivo_esperado<>646650
    or v_actor is null
    or exists(select 1 from public.caja_diaria
              where tienda_codigo='CK-09' and fecha>date '2026-10-28' and estado='cerrada')
    or exists(select 1 from public.caja_cortes
              where tienda_codigo='CK-09' and fecha>date '2026-10-28'
                and estado in ('validada','autorizada'))
    or exists(select 1 from public.creditos where venta_id=v_venta.id)
    or exists(select 1 from public.venta_devoluciones where venta_id=v_venta.id)
    or exists(select 1 from public.venta_ajustes_administrativos where venta_id=v_venta.id)
    or (select count(*) from public.movimientos m
        where m.referencia_tipo='venta' and m.referencia_id=v_venta.id::text)<>1
    or (select count(*) from public.movimientos m
        where m.referencia_tipo='venta' and m.referencia_id=v_venta.id::text
          and m.tipo='venta' and m.producto_id=v_item.producto_id
          and m.cantidad=1 and m.precio=50000)<>1 then
    raise exception 'La venta, el arqueo o sus efectos cambiaron; no se rectificó nada';
  end if;

  v_caja_antes:=public.caja_calcular_interno('CK-09',date '2026-10-29');
  v_antes:=jsonb_build_object('venta',to_jsonb(v_venta),'item',to_jsonb(v_item),
    'corte',to_jsonb(v_corte),'caja_cerrada',to_jsonb(v_caja_cerrada));

  -- Excepción solo para esta tienda, fecha y transacción. La guarda original
  -- se reinstala antes de salir; cualquier error revierte todo el bloque.
  v_guard_original:=pg_get_functiondef('public.caja_exigir_apertura(text,date,boolean)'::regprocedure);
  v_guard_temporal:=replace(v_guard_original,
    '  if exists(select 1 from public.caja_cortes',
    '  if current_setting(''app.rectificar_sim_wom_2412'',true)=''1'' '
      ||'and p_tienda=''CK-09'' and p_fecha=date ''2026-10-28'' then return; end if;'
      ||E'\n  if exists(select 1 from public.caja_cortes');
  if v_guard_temporal=v_guard_original then
    raise exception 'Cambió la guarda de caja; se canceló la rectificación';
  end if;
  execute v_guard_temporal;
  perform set_config('app.rectificar_sim_wom_2412','1',true);
  perform set_config('app.ajuste_venta_autorizado','1',true);

  update public.ventas set total=5000,nota=concat_ws(E'\n',nota,v_motivo)
    where id=v_venta.id;
  update public.venta_items set precio_venta=5000 where id=v_item.id;

  perform set_config('app.rectificar_sim_wom_2412','0',true);
  perform set_config('app.ajuste_venta_autorizado','0',true);
  execute v_guard_original;

  select * into v_venta from public.ventas where id=v_venta.id;
  select * into v_item from public.venta_items where id=v_item.id;
  v_caja_despues:=public.caja_calcular_interno('CK-09',date '2026-10-29');
  if v_venta.total<>5000 or v_item.precio_venta<>5000 or v_item.utilidad<>4000
    or (v_caja_despues->>'esperado')::numeric-(v_caja_antes->>'esperado')::numeric<>-45000
    or (v_caja_despues->>'ajuste_arrastre_movimientos')::numeric
       -(v_caja_antes->>'ajuste_arrastre_movimientos')::numeric<>-45000
    or (select to_jsonb(c) from public.caja_cortes c
        where c.tienda_codigo='CK-09' and c.fecha=date '2026-10-28')
       is distinct from to_jsonb(v_corte)
    or (select to_jsonb(c) from public.caja_diaria c
        where c.tienda_codigo='CK-09' and c.fecha=date '2026-10-28')
       is distinct from to_jsonb(v_caja_cerrada) then
    raise exception 'No cuadraron venta, utilidad, arrastre o cierre; se revirtió todo';
  end if;

  v_despues:=jsonb_build_object('venta',to_jsonb(v_venta),'item',to_jsonb(v_item),
    'corte',to_jsonb(v_corte),'caja_cerrada',to_jsonb(v_caja_cerrada));
  insert into public.venta_ajustes_administrativos
    (venta_id,tipo,motivo,valores_anteriores,valores_nuevos,usuario_id)
  values(v_venta.id,'correccion_datos',v_motivo,v_antes,v_despues,v_actor)
  returning id into v_ajuste;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
  values(v_actor::text,'RECTIFICACION_SIM_WOM_2412','ventas',v_venta.id::text,
    jsonb_build_object('incidencia','KORA-2026-000074','ajuste_id',v_ajuste,
      'precio_anterior',50000,'precio_correcto',5000,'diferencia',-45000,
      'caja_posterior_antes',v_caja_antes,'caja_posterior_despues',v_caja_despues,
      'arqueo_2026_10_28','conservado','efectivo_fisico_del_cierre','sin corroborar'));
end $$;
commit;
