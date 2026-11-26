CREATE OR REPLACE FUNCTION kora_private.preparar_catalogo_liquidacion(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare l public.liquidations%rowtype; op public.liquidation_operations%rowtype;
  origin public.origenes%rowtype; n integer; code text; old_data jsonb;
begin
  if auth.uid() is null or not coalesce(public.tiene_capacidad_aliados('revisor'),false) then raise exception 'No autorizado'; end if;
  select * into l from public.liquidations where id=p_id for update;
  if not found or l.frozen_at is not null or l.approved_at is not null or l.approved_by is not null
    or l.estado not in ('importada','validada','con_novedades','calculada','revisada')
    or exists(select 1 from public.liquidation_approvals where liquidation_id=p_id and etapa='aprobacion' and decision='aprobada')
    or exists(select 1 from public.payment_orders where liquidation_id=p_id and (estado<>'pendiente' or authorized_at is not null or authorized_by is not null))
    then raise exception 'El lote ya está aprobado o tiene pagos en gestión; no se recalcula'; end if;
  perform pg_advisory_xact_lock(hashtext('liquidaciones_vincular_comercio'));
  -- Recalcular un borrador revisado requiere una nueva revisión, sin borrar su auditoría.
  update public.liquidations set reviewed_at=null,reviewed_by=null where id=p_id;
  for op in select * from public.liquidation_operations where liquidation_id=p_id and reconocida for update loop
    origin:=null;
    if op.origen_codigo is not null then
      select * into origin from public.origenes where codigo=op.origen_codigo and activo and tipo in ('propia','aliado');
    else
      select count(*),min(o.codigo) into n,code from public.origenes o where o.activo and o.tipo in ('propia','aliado') and exists(
        select 1 from jsonb_array_elements_text(coalesce(o.aliases,'[]')||jsonb_build_array(o.nombre,o.codigo)) a
        where kora_private.clave_comercio(a)=kora_private.clave_comercio(op.establishment_name));
      if n=1 then select * into origin from public.origenes where codigo=code;
      elsif n=0 and length(btrim(coalesce(op.establishment_name,''))) between 3 and 180 then
        -- Un nombre parecido nunca convierte un aliado en Retail.
        -- El catálogo exacto es la fuente de tiendas propias. Sin match, nuevo aliado.
        -- No crear duplicados de comercios inactivos.
        if not exists(select 1 from public.origenes o where exists(
          select 1 from jsonb_array_elements_text(coalesce(o.aliases,'[]')||jsonb_build_array(o.nombre,o.codigo)) a
          where kora_private.clave_comercio(a)=kora_private.clave_comercio(op.establishment_name))) then
          insert into public.origenes(codigo,nombre,tipo,activo,aliases)
          values('ALIADO-'||upper(gen_random_uuid()::text),btrim(op.establishment_name),'aliado',true,jsonb_build_array(op.establishment_name))
          returning * into origin;
        end if;
      end if;
    end if;
    if origin.codigo is not null then
      old_data:=jsonb_build_object('origen_codigo',op.origen_codigo,'tipo',op.tipo_establecimiento,'ejecutivo_id',op.ejecutivo_id);
      update public.liquidation_operations set origen_codigo=origin.codigo,tipo_establecimiento=origin.tipo,
        ejecutivo_id=case when origin.tipo='propia' then null else origin.ejecutivo_id end,
        normalized_data=coalesce(normalized_data,'{}')||jsonb_build_object('establecimiento',to_jsonb(origin),'tipoEstablecimiento',origin.tipo)
        where id=op.id;
      if op.origen_codigo is distinct from origin.codigo or op.tipo_establecimiento is distinct from origin.tipo or op.ejecutivo_id is distinct from origin.ejecutivo_id then
        insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
        values(auth.uid(),'liquidacion_catalogo_preparado','liquidation_operations',op.id,
          jsonb_build_object('antes',old_data,'origen_codigo',origin.codigo,'tipo',origin.tipo,'ejecutivo_id',origin.ejecutivo_id,'sin_pago',true));
      end if;
      update public.liquidation_incidents set estado='resuelta',resolution='Comercio identificado en catálogo: '||origin.nombre,
        resolved_by=auth.uid(),resolved_at=now()
        where operation_id=op.id and estado='abierta' and tipo in ('comercio_no_reconocido','comercio_ambiguo','operacion_no_reconocida');
      if origin.tipo='aliado' and not exists(select 1 from public.ejecutivos e join public.liquidation_beneficiaries b on b.ejecutivo_id=e.id and b.tipo='ejecutivo' and b.activo where e.id=origin.ejecutivo_id and e.activo and e.esquema_comision is not null) then
        insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion,bloquea_aprobacion)
        select p_id,op.id,'aliado_sin_ejecutivo','Tesorería: asignar ejecutivo. Principal calculable; bono del ejecutivo y utilidad final pendientes.',false
        where not exists(select 1 from public.liquidation_incidents where operation_id=op.id and tipo='aliado_sin_ejecutivo' and estado='abierta');
        update public.liquidation_incidents set bloquea_aprobacion=false where operation_id=op.id and tipo='aliado_sin_ejecutivo' and estado='abierta';
      else
        update public.liquidation_incidents set estado='resuelta',resolution='Ejecutivo del catálogo actualizado',resolved_by=auth.uid(),resolved_at=now()
        where operation_id=op.id and tipo='aliado_sin_ejecutivo' and estado='abierta';
      end if;
    end if;
  end loop;
end $function$
