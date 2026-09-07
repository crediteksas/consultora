-- Selección explícita desde Novedades. No mueve clientes, cuentas ni históricos.
create function kora_private.vincular_operacion_retail(
  p_operation_id uuid, p_origen_anterior text, p_retail text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare op public.liquidation_operations%rowtype; l public.liquidations%rowtype;
  destino public.origenes%rowtype; lote_id uuid; antes jsonb; incidencias_antes jsonb;
begin
  if auth.uid() is null or not coalesce(public.tiene_capacidad_aliados('revisor'),false) then
    raise exception 'No autorizado para vincular Retail';
  end if;
  select liquidation_id into lote_id from public.liquidation_operations where id=p_operation_id;
  select * into l from public.liquidations where id=lote_id for update;
  if not found then raise exception 'Operación no encontrada'; end if;
  if l.frozen_at is not null or l.approved_at is not null or l.approved_by is not null
    or l.estado not in ('importada','validada','con_novedades','calculada','revisada')
    or exists(select 1 from public.liquidation_approvals where liquidation_id=lote_id and etapa='aprobacion' and decision='aprobada')
    or exists(select 1 from public.payment_orders where liquidation_id=lote_id and (estado<>'pendiente' or authorized_at is not null or authorized_by is not null)) then
    raise exception 'El lote ya está aprobado o tiene pagos en gestión. No se cambió la clasificación';
  end if;
  select * into op from public.liquidation_operations where id=p_operation_id for update;
  if op.origen_codigo is distinct from p_origen_anterior then raise exception 'El comercio cambió. Actualiza antes de guardar'; end if;
  if not op.reconocida then raise exception 'La operación está excluida; no se reclasifica desde este pendiente'; end if;
  -- Mismo orden de locks que preparar_catalogo_liquidacion.
  perform pg_advisory_xact_lock(hashtext('liquidaciones_vincular_comercio'));
  select * into destino from public.origenes where codigo=p_retail and activo and tipo='propia' for share;
  if not found then raise exception 'Selecciona una tienda propia activa del catálogo Retail'; end if;
  if exists(select 1 from public.liquidation_bonuses where operation_id=op.id and tipo_bono not in
    ('automatico_ejecutivo','automatico_override','automatico_universal','krediya_gestion','krediya_operacion')) then
    raise exception 'Esta operación tiene bonos manuales. Revisa su tratamiento antes de cambiarla a Retail';
  end if;
  antes:=to_jsonb(op);
  select coalesce(jsonb_agg(to_jsonb(i)),'[]'::jsonb) into incidencias_antes
    from public.liquidation_incidents i where operation_id=op.id and estado='abierta';
  update public.liquidation_operations set origen_codigo=destino.codigo,tipo_establecimiento='propia',ejecutivo_id=null,
    normalized_data=coalesce(normalized_data,'{}')||jsonb_build_object('establecimiento',to_jsonb(destino),'tipoEstablecimiento','propia','ejecutivo',null)
    where id=op.id;
  update public.liquidation_incidents set estado='resuelta',resolution='Vinculada a Retail: '||destino.nombre||' ('||destino.codigo||')',
    resolved_by=auth.uid(),resolved_at=now() where operation_id=op.id and estado='abierta'
    and tipo in ('comercio_no_reconocido','comercio_ambiguo','aliado_sin_ejecutivo','beneficiario_sin_identificacion','cuenta_bancaria_no_validada','bono_beneficiario_sin_cuenta');
  -- Conciliación Retail y cálculo canónicos, atómicos con la reclasificación.
  -- Si cualquier regla falla, se revierte también la vinculación.
  perform public.aliados_resolver_operaciones_propias(lote_id);
  l:=public.aliados_calcular_liquidacion(lote_id);
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(auth.uid(),'liquidacion_operacion_vinculada_retail','liquidation_operations',op.id,
      jsonb_build_object('antes',antes,'incidencias_antes',incidencias_antes,'retail_codigo',destino.codigo,
        'liquidation_id',lote_id,'alcance','operación seleccionada; cálculo del borrador actualizado; maestros e históricos intactos','sin_aprobacion_ni_pago',true));
  return jsonb_build_object('ok',true,'tipo','propia','origen_codigo',destino.codigo,'nombre',destino.nombre,'liquidation_id',lote_id,'estado',l.estado);
end $$;
revoke all on function kora_private.vincular_operacion_retail(uuid,text,text) from public,anon;
grant execute on function kora_private.vincular_operacion_retail(uuid,text,text) to authenticated;
create function public.tesoreria_vincular_operacion_retail(p_operation_id uuid,p_origen_anterior text,p_retail text)
returns jsonb language sql security invoker set search_path='' as $$
  select kora_private.vincular_operacion_retail(p_operation_id,p_origen_anterior,p_retail);
$$;
revoke all on function public.tesoreria_vincular_operacion_retail(uuid,text,text) from public,anon;
grant execute on function public.tesoreria_vincular_operacion_retail(uuid,text,text) to authenticated;
