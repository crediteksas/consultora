-- Cálculo independiente de la preparación administrativa. No aprueba ni paga.
create or replace function kora_private.preparar_catalogo_liquidacion(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
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
end $$;
revoke all on function kora_private.preparar_catalogo_liquidacion(uuid) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION kora_private.calcular_liquidacion_sin_datos_pago(p_id uuid)
 RETURNS public.liquidations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v public.liquidations%rowtype;o public.liquidation_operations%rowtype;p public.settlement_policy_versions%rowtype;
 b public.liquidation_beneficiaries%rowtype;a public.beneficiary_bank_accounts%rowtype;c public.liquidation_calculations%rowtype;
 bn public.liquidation_bonuses%rowtype;
 v_count int;v_policy_id uuid;v_comercial numeric;v_base numeric;v_pagamos numeric;v_pago numeric;v_bonus numeric;v_util numeric;v_order uuid;
 v_tot_comercial numeric:=0;v_tot_aliados numeric:=0;v_tot_tiendas numeric:=0;v_tot_bonus numeric:=0;v_tot_util numeric:=0;v_util_tiendas numeric:=0;
 v_count_tiendas integer:=0;v_count_aliados integer:=0;v_future boolean;
begin
 if auth.uid() is null or not public.tiene_capacidad_aliados('revisor') then raise exception 'No autorizado para calcular'; end if;
 select * into v from public.liquidations where id=p_id for update;
 if not found then raise exception 'Liquidación no encontrada'; end if;
 if v.plataforma='krediya' then return krediya_private.calcular_y_enviar_aprobacion(p_id); end if;
 if v.frozen_at is not null then raise exception 'Liquidación aprobada inmutable'; end if;
 if v.estado not in('importada','con_novedades','validada','calculada','revisada') then raise exception 'La liquidación no es editable'; end if;
 perform kora_private.preparar_catalogo_liquidacion(p_id);
 delete from public.payment_items where payment_order_id in(select id from public.payment_orders where liquidation_id=p_id and estado='pendiente');
 delete from public.payment_orders where liquidation_id=p_id and estado='pendiente';
 delete from public.liquidation_calculations where liquidation_id=p_id;
 perform public.aliados_calcular_bonos_ejecutivos(p_id);

 for o in select * from public.liquidation_operations where liquidation_id=p_id order by operation_at,id loop
  if o.operation_at is null then
    insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,o.id,'fecha_operacion_ausente','La operación no tiene fecha para resolver su política') on conflict do nothing;continue;
  end if;
  v_future:=o.operation_at::date>=date '2026-08-05';
  if not o.reconocida or o.tipo_establecimiento='no_reconocido' then
    insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,o.id,'operacion_no_reconocida','La operación o el establecimiento no están reconocidos') on conflict do nothing;continue;
  end if;
  -- La comisión pendiente no impide calcular el principal del aliado.
  -- Se presenta separadamente en Tesorería y no se declara utilidad definitiva.

  if v_future then
    select count(*),min(id::text)::uuid into v_count,v_policy_id from public.settlement_policy_versions
    where plataforma=o.plataforma and tipo_establecimiento=o.tipo_establecimiento and estado='aprobada'
      and vigente_desde<=o.operation_at::date and (vigente_hasta is null or vigente_hasta>=o.operation_at::date);
    if v_count<>1 then
      insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,o.id,case when v_count=0 then 'politica_ausente' else 'politica_ambigua' end,'No existe una política única vigente') on conflict do nothing;continue;
    end if;
    select * into p from public.settlement_policy_versions where id=v_policy_id;
    v_comercial:=coalesce(o.monto_credito,o.monto_base)+o.inicial;
    v_base:=coalesce(o.monto_credito,o.monto_base);
    v_pagamos:=round(v_base*p.porcentaje,2);
    v_pago:=round(v_pagamos-o.inicial,2);
    select coalesce(sum(valor),0) into v_bonus from public.liquidation_bonuses where operation_id=o.id and estado='aprobado';
    v_util:=round(v_base-v_pagamos-v_bonus,2);
    if v_pago<0 or v_util<0 then raise exception 'valor_negativo_imposible'; end if;
    update public.liquidation_operations set valor_comercial=v_comercial,porcentaje_politica=p.porcentaje,
      policy_version_id=p.id,policy_snapshot=to_jsonb(p),pagamos=v_pagamos,pago_neto_beneficiario=v_pago,
      pago_neto_tienda=case when tipo_establecimiento='propia' then v_pago else pago_neto_tienda end,
      bonos_aplicados=v_bonus,utilidad_creditek=v_util,
      utilidad_creditek_tienda=case when tipo_establecimiento='propia' then v_util else utilidad_creditek_tienda end,
      snapshot_tienda_at=case when tipo_establecimiento='propia' then now() else snapshot_tienda_at end where id=o.id;
    insert into public.liquidation_calculations(liquidation_id,operation_id,policy_version_id,policy_snapshot,pagamos,pago_aliado,total_bonos,utilidad_creditek,explanation)
    values(p_id,o.id,p.id,to_jsonb(p),v_pagamos,v_pago,v_bonus,v_util,jsonb_build_object('valor_credito',coalesce(o.monto_credito,o.monto_base),'inicial_plataforma',o.inicial,'valor_comercial',v_comercial,'base_calculo',v_base,'porcentaje',p.porcentaje,'formula',p.formula_code,'accesorios_cantidad',o.accesorios_cantidad,'accesorios_valor',o.accesorios)) returning * into c;
  elsif o.tipo_establecimiento='aliado' then
    select count(*),min(id::text)::uuid into v_count,v_policy_id from public.settlement_policy_versions where plataforma=o.plataforma and tipo_establecimiento='aliado' and estado='aprobada' and vigente_desde<=o.operation_at::date and (vigente_hasta is null or vigente_hasta>=o.operation_at::date);
    if v_count<>1 then insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,o.id,'politica_ausente','No existe una política histórica única vigente') on conflict do nothing;continue;end if;
    select * into p from public.settlement_policy_versions where id=v_policy_id;
    v_comercial:=case p.base_field when 'monto_credito' then o.monto_credito else o.monto_base end;
    v_pagamos:=round(v_comercial*p.porcentaje,2);v_pago:=round(v_pagamos-o.inicial,2);
    select coalesce(sum(valor),0) into v_bonus from public.liquidation_bonuses where operation_id=o.id and estado='aprobado';v_util:=round(v_comercial-v_pagamos-v_bonus,2);
    insert into public.liquidation_calculations(liquidation_id,operation_id,policy_version_id,policy_snapshot,pagamos,pago_aliado,total_bonos,utilidad_creditek,explanation)
    values(p_id,o.id,p.id,to_jsonb(p),v_pagamos,v_pago,v_bonus,v_util,jsonb_build_object('base_field',p.base_field,'base_liquidable',v_comercial,'formula',p.formula_code)) returning * into c;
  else
    if coalesce(o.pagamos,0)<=0 then insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,o.id,'operacion_tienda_sin_pagamos','La operación histórica requiere el Pagamos congelado') on conflict do nothing;continue;end if;
    v_comercial:=case when o.plataforma='payjoy' then coalesce(o.monto_credito,o.monto_base)-o.inicial_kora else o.monto_base end;
    v_pago:=o.pago_neto_tienda;v_bonus:=0;v_util:=o.utilidad_creditek_tienda;
  end if;

  if o.tipo_establecimiento='propia' and o.inicial_kora is null then
    insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion,bloquea_aprobacion) values(p_id,o.id,'imei_no_resuelto','El equipo no está registrado en el inventario de KORA (IMEI no encontrado). No bloquea el pago; debe registrarse pronto en la tienda.',false) on conflict do nothing;
  elsif o.tipo_establecimiento='propia' and o.diferencia_inicial<>0 and o.diferencia_revisada_at is null then
    insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion,bloquea_aprobacion) values(p_id,o.id,'diferencia_inicial_sin_revisar','La inicial registrada en KORA difiere de la reportada por la plataforma - requiere revisión antes de aprobar',true) on conflict do nothing;
  end if;
  if not (v_future and o.tipo_establecimiento='propia') and v_pago>0 then
   select * into b from public.liquidation_beneficiaries where activo and ((o.tipo_establecimiento='aliado' and id=public.aliados_beneficiario_de_comercio(o.origen_codigo)) or (o.tipo_establecimiento<>'aliado' and tipo='otro' and origen_codigo=o.origen_codigo)) limit 1;
   if not found then
     insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion,bloquea_aprobacion) values(p_id,o.id,'beneficiario_sin_identificacion','No existe beneficiario de pago registrado con cuenta bancaria. No bloquea el cálculo; falta registrar la cuenta para poder girar el pago.',false) on conflict do nothing;
   else
     select * into a from public.beneficiary_bank_accounts where beneficiary_id=b.id and activo and validada order by validada_at desc limit 1;
     if not found then
       insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion,bloquea_aprobacion) values(p_id,o.id,'cuenta_bancaria_no_validada','El beneficiario no tiene cuenta bancaria validada. No bloquea el cálculo; falta antes de poder girar el pago.',false) on conflict do nothing;
     else
       insert into public.payment_orders(liquidation_id,beneficiary_id,bank_account_id,valor,idempotency_key) values(p_id,b.id,a.id,v_pago,gen_random_uuid()) on conflict(liquidation_id,beneficiary_id) do update set valor=public.payment_orders.valor+excluded.valor returning id into v_order;
       insert into public.payment_items(payment_order_id,operation_id,concepto,valor) values(v_order,o.id,case when o.tipo_establecimiento='aliado' then 'pago_aliado' else 'pago_tienda' end,v_pago);
     end if;
   end if;
  end if;
  v_tot_comercial:=v_tot_comercial+v_comercial;v_tot_bonus:=v_tot_bonus+v_bonus;v_tot_util:=v_tot_util+v_util;
  if o.tipo_establecimiento='aliado' then v_tot_aliados:=v_tot_aliados+v_pago;v_count_aliados:=v_count_aliados+1;else v_tot_tiendas:=v_tot_tiendas+v_pago;v_util_tiendas:=v_util_tiendas+v_util;v_count_tiendas:=v_count_tiendas+1;end if;
 end loop;

 for bn in select * from public.liquidation_bonuses where liquidation_id=p_id and estado='aprobado' loop
  select * into a from public.beneficiary_bank_accounts where beneficiary_id=bn.beneficiary_id and activo and validada order by validada_at desc limit 1;
  if not found then
    insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion,bloquea_aprobacion) values(p_id,bn.operation_id,'bono_beneficiario_sin_cuenta','El beneficiario del bono no tiene cuenta bancaria validada. No bloquea el cálculo; falta antes de poder girar el pago.',false) on conflict do nothing;
  else
    insert into public.payment_orders(liquidation_id,beneficiary_id,bank_account_id,valor,idempotency_key) values(p_id,bn.beneficiary_id,a.id,bn.valor,gen_random_uuid()) on conflict(liquidation_id,beneficiary_id) do update set valor=public.payment_orders.valor+excluded.valor returning id into v_order;
    insert into public.payment_items(payment_order_id,operation_id,bonus_id,concepto,valor) values(v_order,bn.operation_id,bn.id,'bono_'||bn.tipo_bono,bn.valor);
  end if;
 end loop;
 -- Conservar también los resultados conocidos cuando otra fila necesita corrección.
 -- Los controles de aprobación/pago permanecen separados y no se eluden.
 update public.liquidations set estado=case when (select count(*) from public.liquidation_calculations where liquidation_id=p_id)=(select count(*) from public.liquidation_operations where liquidation_id=p_id) then 'calculada' else 'con_novedades' end,total_operaciones=v_tot_comercial,total_pago_aliados=v_tot_aliados,total_pago_tiendas=v_tot_tiendas,total_bonos=v_tot_bonus,total_utilidad_creditek=v_tot_util,total_utilidad_tiendas=v_util_tiendas,total_pagar=v_tot_aliados+v_tot_tiendas+v_tot_bonus,operaciones_tiendas=v_count_tiendas,operaciones_aliados=v_count_aliados,updated_at=now() where id=p_id returning * into v;
 insert into public.liquidation_domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key) values('liquidation.calculated','liquidation',p_id,jsonb_build_object('liquidation_id',p_id,'platform',v.plataforma),p_id||':calculated') on conflict(idempotency_key) do nothing;
 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),'aliados_liquidacion_calculada','liquidations',p_id,jsonb_build_object('total_pagar',v.total_pagar,'policy_effective_from','2026-08-05'));return v;
end; 
$function$
;
revoke all on function kora_private.calcular_liquidacion_sin_datos_pago(uuid) from public,anon;
grant execute on function kora_private.calcular_liquidacion_sin_datos_pago(uuid) to authenticated;
create or replace function public.aliados_calcular_liquidacion(p_id uuid)
returns public.liquidations language sql security invoker set search_path='' as $$
 select kora_private.calcular_liquidacion_sin_datos_pago(p_id);
$$;
revoke all on function public.aliados_calcular_liquidacion(uuid) from public,anon;
grant execute on function public.aliados_calcular_liquidacion(uuid) to authenticated;
CREATE OR REPLACE FUNCTION krediya_private.calcular_y_enviar_aprobacion(p_id uuid)
 RETURNS public.liquidations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare l public.liquidations%rowtype; o public.liquidation_operations%rowtype;
 c jsonb; snap jsonb; br record; bn record; b uuid; bank uuid; po uuid;
 precio numeric; pactado numeric; pago numeric; bonos numeric; bruta numeric; provision numeric; neta numeric; financiero numeric;
begin
 if auth.uid() is null or not public.tiene_capacidad_aliados('revisor') then raise exception 'No autorizado'; end if;
 select * into l from public.liquidations where id=p_id and plataforma='krediya' for update;
 if not found or l.frozen_at is not null or l.estado not in ('importada','validada','con_novedades','calculada','revisada') then
  raise exception 'Liquidación no editable'; end if;
 if exists(select 1 from public.payment_orders where liquidation_id=p_id and estado<>'pendiente') then
  raise exception 'El lote tiene órdenes en gestión; no se recalcula'; end if;
 if not exists(select 1 from public.liquidation_operations where liquidation_id=p_id and reconocida) then raise exception 'No hay operaciones reconocidas'; end if;
 if exists(select 1 from public.liquidation_operations where liquidation_id=p_id and reconocida and nullif(external_id,'') is not null group by external_id having count(*)>1) then
  raise exception 'Hay créditos duplicados en el lote'; end if;
 perform kora_private.preparar_catalogo_liquidacion(p_id);
 -- Una edición concurrente no puede cambiar el tarifario entre preflight y cálculo.
 lock table public.krediya_price_rules,public.krediya_bonus_rules in share mode;
 -- Preflight completo: ante datos faltantes no hay cálculos parciales.
 for o in select * from public.liquidation_operations where liquidation_id=p_id and reconocida order by id for update loop
  c:=public.aliados_contexto_precio_krediya(o.id);
  if o.tipo_establecimiento not in ('propia','aliado') or o.operation_at is null then raise exception 'Falta clasificar o fechar la operación %',o.imei; end if;
  if (c->>'pagamos_guardado')::numeric is null or (c->>'pagamos_guardado')::numeric<=0 then raise exception 'Falta PAGAMOS pactado para % · IMEI %',o.referencia,o.imei; end if;
  if (c->>'pvp_recibido')::numeric is null or (c->>'pvp_recibido')::numeric<=0 then raise exception 'Falta PVP recibido para % · IMEI %',o.referencia,o.imei; end if;
  if o.inicial is null or o.inicial<0 or o.inicial>(c->>'pagamos_guardado')::numeric then raise exception 'Inicial inválida para % · IMEI %',o.referencia,o.imei; end if;
  if o.monto_credito is null or o.monto_credito<=0 then raise exception 'Falta valor financiado para % · IMEI %',o.referencia,o.imei; end if;
  -- El ejecutivo y su beneficiario son preparación de Tesorería.
  -- Su bono no conocido se identifica como pendiente, nunca como costo final cero.
  if (select count(*) from public.krediya_bonus_rules r where r.activo and r.tipo_establecimiento=o.tipo_establecimiento
   and r.vigente_desde<=(o.operation_at at time zone 'America/Bogota')::date and (r.vigente_hasta is null or r.vigente_hasta>=(o.operation_at at time zone 'America/Bogota')::date))<>2
   or (c->>'bonos')::numeric is distinct from 20000::numeric then raise exception 'Configuración operativa incompleta para %',o.referencia; end if;
  if (select count(distinct r.concepto) from public.krediya_bonus_rules r
   join public.liquidation_beneficiaries b on b.id=r.beneficiary_id and b.activo
   where r.activo and r.tipo_establecimiento=o.tipo_establecimiento
   and ((r.concepto='gestion_krediya' and r.valor=5000) or (r.concepto='operacion' and r.valor=15000))
   and r.vigente_desde<=(o.operation_at at time zone 'America/Bogota')::date
   and (r.vigente_hasta is null or r.vigente_hasta>=(o.operation_at at time zone 'America/Bogota')::date))<>2 then
   raise exception 'Revisa beneficiarios y reglas operativas: gestión $5.000 y operación $15.000'; end if;
 end loop;
 -- Exclusivamente alertas antiguas de precios/bonos que el preflight ya comprobó.
 update public.liquidation_incidents i set estado='resuelta',resolved_at=now(),resolved_by=auth.uid(),
 resolution='Calculado con PVP recibido y PAGAMOS pactado. Diferencias trasladadas al informe independiente.'
 where i.liquidation_id=p_id and i.estado='abierta' and i.tipo in
 ('krediya_regla_precio_ausente','krediya_precio_venta_diferente','krediya_pagamos_diferente','krediya_bono_sin_configurar')
 and exists(select 1 from public.liquidation_operations lo_inc where lo_inc.id=i.operation_id and lo_inc.reconocida);
 if exists(select 1 from public.liquidation_incidents where liquidation_id=p_id and estado='abierta' and bloquea_aprobacion) then
  raise exception 'Quedan datos o novedades bloqueantes distintos del PVP. Revisa Novedades'; end if;
 delete from public.payment_items where payment_order_id in(select id from public.payment_orders where liquidation_id=p_id);
 delete from public.payment_orders where liquidation_id=p_id;
 delete from public.liquidation_calculations where liquidation_id=p_id;
 delete from public.liquidation_bonuses where liquidation_id=p_id and tipo_bono in ('krediya_gestion','krediya_operacion');
 perform public.aliados_calcular_bonos_ejecutivos(p_id);
 update public.liquidation_bonuses b set rule_snapshot=coalesce(b.rule_snapshot,'{}'::jsonb)||jsonb_build_object('esquema',e.esquema_comision,'ejecutivo',e.nombre)
 from public.liquidation_beneficiaries lb join public.ejecutivos e on e.id=lb.ejecutivo_id
 where b.liquidation_id=p_id and b.beneficiary_id=lb.id and b.tipo_bono like 'automatico_%';
 -- Mayte universal y Mayte operativo son el mismo bono: sustituir, no sumar dos veces.
 delete from public.liquidation_bonuses b where b.liquidation_id=p_id and b.tipo_bono='automatico_universal'
 and exists(select 1 from public.krediya_bonus_rules r where r.activo and r.concepto='gestion_krediya' and r.beneficiary_id=b.beneficiary_id);
 for o in select * from public.liquidation_operations where liquidation_id=p_id and reconocida order by operation_at,id for update loop
  c:=public.aliados_contexto_precio_krediya(o.id);
  precio:=(c->>'pvp_recibido')::numeric; pactado:=(c->>'pagamos_guardado')::numeric; pago:=round(pactado-o.inicial,2);
  for br in select * from public.krediya_bonus_rules r where r.activo and r.tipo_establecimiento=o.tipo_establecimiento
   and r.vigente_desde<=(o.operation_at at time zone 'America/Bogota')::date and (r.vigente_hasta is null or r.vigente_hasta>=(o.operation_at at time zone 'America/Bogota')::date) loop
   insert into public.liquidation_bonuses(liquidation_id,operation_id,beneficiary_id,tipo_bono,rule_snapshot,valor,motivo,estado,idempotency_key)
   values(p_id,o.id,br.beneficiary_id,case when br.concepto='operacion' then 'krediya_operacion' else 'krediya_gestion' end,
    to_jsonb(br),br.valor,case when br.concepto='operacion' then 'Operación Krediya' else 'Gestión Krediya' end,'aprobado',gen_random_uuid());
  end loop;
  select coalesce(sum(valor),0) into bonos from public.liquidation_bonuses where operation_id=o.id and liquidation_id=p_id and estado='aprobado';
  financiero:=round(o.monto_credito*0.004,2);
  bruta:=round(precio-pactado-bonos-financiero,2); provision:=round(bruta*0.28,2); neta:=bruta-provision;
  snap:=c||jsonb_build_object('motor','krediya_v2','bono_ejecutivo_pendiente',exists(select 1 from public.liquidation_incidents where operation_id=o.id and tipo='aliado_sin_ejecutivo' and estado='abierta'),'pvp_liquidado',precio,'pagamos',pactado,'bonos',bonos,'utilidad_bruta',bruta,
   'gasto_financiero',financiero,'tasa_gasto_financiero',0.004,
   'provision_porcentaje',0.28,'provision',provision,'utilidad_neta',neta,'calculado_por',auth.uid(),'calculado_at',now(),
   'impacto_bruto',precio-(c->>'pvp_guardado')::numeric,
   'impacto_neto',neta-((c->>'pvp_guardado')::numeric-pactado-bonos-financiero-round(((c->>'pvp_guardado')::numeric-pactado-bonos-financiero)*0.28,2)));
  update public.liquidation_operations set valor_comercial=precio,pagamos=pactado,pago_neto_beneficiario=pago,
   pago_neto_tienda=case when tipo_establecimiento='propia' then pago else pago_neto_tienda end,
   bonos_aplicados=bonos,utilidad_creditek=neta,utilidad_creditek_tienda=case when tipo_establecimiento='propia' then neta else utilidad_creditek_tienda end,
   policy_snapshot=coalesce(policy_snapshot,'{}'::jsonb)||jsonb_build_object('krediya_v2',snap) where id=o.id;
  insert into public.liquidation_calculations(liquidation_id,operation_id,policy_snapshot,pagamos,pago_aliado,total_bonos,utilidad_creditek,explanation,calculated_by)
  values(p_id,o.id,snap,pactado,pago,bonos,neta,snap||jsonb_build_object('valor_comercial',precio,'pago_neto',pago),auth.uid());
  if (c->>'pvp_guardado')::numeric is null or precio<>(c->>'pvp_guardado')::numeric then
   insert into public.krediya_diferencias(operation_id,liquidation_id,contexto) values(o.id,p_id,snap)
   on conflict(operation_id) do update set contexto=excluded.contexto,
    estado=case when public.krediya_diferencias.contexto->'pvp_liquidado' is distinct from excluded.contexto->'pvp_liquidado'
      or public.krediya_diferencias.contexto->'pvp_guardado' is distinct from excluded.contexto->'pvp_guardado' then 'pendiente' else public.krediya_diferencias.estado end,updated_at=now();
  else
   update public.krediya_diferencias set contexto=snap,estado='resuelta',updated_at=now() where operation_id=o.id;
  end if;
  if o.tipo_establecimiento='aliado' and pago>0 then
   b:=public.aliados_beneficiario_de_comercio(o.origen_codigo);
   if b is null then
     insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion,bloquea_aprobacion)
     select p_id,o.id,'beneficiario_sin_identificacion','Tesorería: completar titular y cuenta. El principal ya está calculado.',false
     where not exists(select 1 from public.liquidation_incidents where operation_id=o.id and tipo='beneficiario_sin_identificacion' and estado='abierta');
     continue;
   end if;
   select id into bank from public.beneficiary_bank_accounts where beneficiary_id=b and activo and validada order by validada_at desc limit 1;
   insert into public.payment_orders(liquidation_id,beneficiary_id,bank_account_id,valor,idempotency_key)
   values(p_id,b,bank,pago,gen_random_uuid()) on conflict(liquidation_id,beneficiary_id)
   do update set valor=public.payment_orders.valor+excluded.valor returning id into po;
   insert into public.payment_items(payment_order_id,operation_id,concepto,valor) values(po,o.id,'pago_aliado',pago);
  end if;
 end loop;
 for bn in select * from public.liquidation_bonuses where liquidation_id=p_id and estado='aprobado' and valor>0 loop
  select id into bank from public.beneficiary_bank_accounts where beneficiary_id=bn.beneficiary_id and activo and validada order by validada_at desc limit 1;
  insert into public.payment_orders(liquidation_id,beneficiary_id,bank_account_id,valor,idempotency_key)
  values(p_id,bn.beneficiary_id,bank,bn.valor,gen_random_uuid()) on conflict(liquidation_id,beneficiary_id)
  do update set valor=public.payment_orders.valor+excluded.valor returning id into po;
  insert into public.payment_items(payment_order_id,operation_id,bonus_id,concepto,valor) values(po,bn.operation_id,bn.id,'bono',bn.valor);
 end loop;
 update public.liquidations set estado='calculada',
  total_operaciones=(select sum(valor_comercial) from public.liquidation_operations where liquidation_id=p_id and reconocida),
  total_pago_aliados=(select coalesce(sum(pago_neto_beneficiario),0) from public.liquidation_operations where liquidation_id=p_id and reconocida and tipo_establecimiento='aliado'),
  total_pago_tiendas=(select coalesce(sum(pago_neto_tienda),0) from public.liquidation_operations where liquidation_id=p_id and reconocida and tipo_establecimiento='propia'),
  total_bonos=(select coalesce(sum(valor),0) from public.liquidation_bonuses where liquidation_id=p_id and estado='aprobado'),
  total_utilidad_creditek=(select sum(utilidad_creditek) from public.liquidation_operations where liquidation_id=p_id and reconocida),
  total_utilidad_tiendas=(select coalesce(sum(utilidad_creditek_tienda),0) from public.liquidation_operations where liquidation_id=p_id and reconocida and tipo_establecimiento='propia'),
  total_pagar=(select coalesce(sum(pago_neto_beneficiario),0) from public.liquidation_operations where liquidation_id=p_id and reconocida and tipo_establecimiento='aliado')
    +(select coalesce(sum(valor),0) from public.liquidation_bonuses where liquidation_id=p_id and estado='aprobado'),
  operaciones_aliados=(select count(*) from public.liquidation_operations where liquidation_id=p_id and reconocida and tipo_establecimiento='aliado'),
  operaciones_tiendas=(select count(*) from public.liquidation_operations where liquidation_id=p_id and reconocida and tipo_establecimiento='propia'),updated_at=now()
 where id=p_id;
 -- No se presenta un bono desconocido como costo final: conservar cálculo
 -- y resolver su asignación en Tesorería antes de congelar el lote.
 if exists(select 1 from public.liquidation_incidents where liquidation_id=p_id and tipo='aliado_sin_ejecutivo' and estado='abierta') then
   select * into l from public.liquidations where id=p_id;
   return l;
 end if;
 -- El clic explícito «Calcular y enviar a aprobación» deja revisión auditada.
 l:=public.aliados_cambiar_estado(p_id,'revisada','Cálculo Krediya v2 enviado a aprobación. Diferencias de PVP en seguimiento independiente.');
 return l;
end $function$
;

-- La asignación administrativa edita solo el maestro; los lotes congelados nunca.
create function kora_private.asignar_ejecutivo_tesoreria(p_origen text,p_anterior uuid,p_ejecutivo uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.origenes%rowtype;
begin
 if auth.uid() is null or not coalesce(public.tiene_capacidad_aliados('revisor'),false) then raise exception 'No autorizado'; end if;
 select * into o from public.origenes where codigo=p_origen and tipo='aliado' and activo for update;
 if not found then raise exception 'Aliado no disponible'; end if;
 if o.ejecutivo_id is distinct from p_anterior then raise exception 'El ejecutivo cambió; actualiza antes de guardar'; end if;
 if p_ejecutivo is null or not exists(select 1 from public.ejecutivos where id=p_ejecutivo and activo and esquema_comision is not null) then
   raise exception 'Selecciona un ejecutivo activo con regla de comisión'; end if;
 update public.origenes set ejecutivo_id=p_ejecutivo where codigo=p_origen;
 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),'tesoreria_ejecutivo_asignado','origenes',p_origen,
  jsonb_build_object('anterior',p_anterior,'ejecutivo_id',p_ejecutivo,'alcance','maestro; recalcular borradores explícitamente; no modifica históricos'));
 return jsonb_build_object('ok',true);
end $$;
revoke all on function kora_private.asignar_ejecutivo_tesoreria(text,uuid,uuid) from public,anon;
grant execute on function kora_private.asignar_ejecutivo_tesoreria(text,uuid,uuid) to authenticated;
create function public.tesoreria_asignar_ejecutivo(p_origen text,p_anterior uuid,p_ejecutivo uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select kora_private.asignar_ejecutivo_tesoreria(p_origen,p_anterior,p_ejecutivo);
$$;
revoke all on function public.tesoreria_asignar_ejecutivo(text,uuid,uuid) from public,anon;
grant execute on function public.tesoreria_asignar_ejecutivo(text,uuid,uuid) to authenticated;

create function kora_private.pendientes_tesoreria_liquidacion(p_lote uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not coalesce(public.tiene_capacidad_aliados('revisor'),false) then raise exception 'No autorizado'; end if;
 return coalesce((select jsonb_agg(to_jsonb(x) order by x.corte,x.comercio) from (
   select op.id,op.liquidation_id,op.origen_codigo,op.establishment_name as comercio,
     l.plataforma,l.fecha_corte as corte,l.estado,op.referencia,
     coalesce(op.porcentaje_politica,p.porcentaje) as porcentaje,
     c.pago_aliado as neto,op.ejecutivo_id as ejecutivo_calculo,o.ejecutivo_id as ejecutivo_actual,
     (o.codigo is null) as falta_comercio,
     (o.ejecutivo_id is null or not exists(select 1 from public.ejecutivos e join public.liquidation_beneficiaries eb on eb.ejecutivo_id=e.id and eb.tipo='ejecutivo' and eb.activo where e.id=o.ejecutivo_id and e.activo and e.esquema_comision is not null)) as falta_ejecutivo,
     (b.id is null or nullif(btrim(b.identificacion),'') is null) as falta_titular,
     (not exists(select 1 from public.beneficiary_bank_accounts a where a.beneficiary_id=b.id and a.activo and a.validada)) as falta_cuenta,
     (op.ejecutivo_id is distinct from o.ejecutivo_id or c.id is null or (c.pago_aliado>0 and not exists(
       select 1 from public.payment_items pi join public.payment_orders po on po.id=pi.payment_order_id
       where pi.operation_id=op.id and po.liquidation_id=l.id and pi.bonus_id is null and po.estado not in ('anulado','rechazado')))) as requiere_recalcular
   from public.liquidation_operations op join public.liquidations l on l.id=op.liquidation_id
   left join public.origenes o on o.codigo=op.origen_codigo and o.activo
   left join public.liquidation_calculations c on c.operation_id=op.id
   left join public.liquidation_beneficiaries b on b.id=public.aliados_beneficiario_de_comercio(op.origen_codigo)
   left join lateral (select min(sp.porcentaje) as porcentaje from public.settlement_policy_versions sp
     where sp.plataforma=op.plataforma and sp.tipo_establecimiento='aliado' and sp.estado='aprobada'
       and sp.vigente_desde<=(op.operation_at at time zone 'America/Bogota')::date
       and (sp.vigente_hasta is null or sp.vigente_hasta>=(op.operation_at at time zone 'America/Bogota')::date) having count(*)=1) p on true
   where l.frozen_at is null and l.estado in ('importada','validada','con_novedades','calculada','revisada')
     and (p_lote is null or l.id=p_lote) and op.reconocida and op.tipo_establecimiento<>'propia'
 ) x where x.falta_comercio or x.falta_ejecutivo or x.falta_titular or x.falta_cuenta or x.requiere_recalcular),'[]'::jsonb);
end $$;
revoke all on function kora_private.pendientes_tesoreria_liquidacion(uuid) from public,anon;
grant execute on function kora_private.pendientes_tesoreria_liquidacion(uuid) to authenticated;
create function public.tesoreria_pendientes_liquidacion(p_lote uuid default null)
returns jsonb language sql security invoker set search_path='' as $$
 select kora_private.pendientes_tesoreria_liquidacion(p_lote);
$$;
revoke all on function public.tesoreria_pendientes_liquidacion(uuid) from public,anon;
grant execute on function public.tesoreria_pendientes_liquidacion(uuid) to authenticated;

-- No congelar costos incompletos como utilidad final. Esto NO bloquea calcular.
create function kora_private.proteger_bonos_pendientes() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.estado='aprobada' and old.estado is distinct from 'aprobada' and exists(
   select 1 from public.liquidation_operations op left join public.origenes o on o.codigo=op.origen_codigo
   where op.liquidation_id=new.id and op.reconocida and op.tipo_establecimiento='aliado'
   and (op.ejecutivo_id is null or op.ejecutivo_id is distinct from o.ejecutivo_id or not exists(select 1 from public.ejecutivos e join public.liquidation_beneficiaries b on b.ejecutivo_id=e.id and b.tipo='ejecutivo' and b.activo where e.id=op.ejecutivo_id and e.activo and e.esquema_comision is not null))
 ) then raise exception 'Principal calculado. Completa el ejecutivo en Tesorería y actualiza el cálculo para incluir su bono antes de aprobar'; end if;
 return new;
end $$;
revoke all on function kora_private.proteger_bonos_pendientes() from public,anon,authenticated;
create trigger proteger_bonos_pendientes before update of estado on public.liquidations
for each row execute function kora_private.proteger_bonos_pendientes();
CREATE OR REPLACE FUNCTION kora_private.cambiar_estado_liquidacion(p_id uuid, p_estado text, p_comentario text DEFAULT NULL::text)
 RETURNS public.liquidations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v public.liquidations%rowtype;
  v_anterior text;
  v_event text;
  v_pago_bancario_esperado numeric;
  v_pago_bancario_detalle numeric;
begin
  if auth.uid() is null then raise exception 'No autorizado'; end if;
  select * into v from public.liquidations where id=p_id for update;
  if not found then raise exception 'Liquidación no encontrada'; end if;
  v_anterior=v.estado;

  if p_estado='validada' then
    if not public.tiene_capacidad_aliados('revisor') then raise exception 'Solo Maite/revisor puede validar'; end if;
    -- Compatibilidad con pantallas abiertas: Validar realiza el cálculo, no
    -- deja al usuario en un ciclo de validación por datos administrativos.
    return public.aliados_calcular_liquidacion(p_id);
  elsif p_estado='revisada' then
    if not public.tiene_capacidad_aliados('revisor') then raise exception 'Solo Maite/revisor puede revisar'; end if;
    if v.estado<>'calculada' then raise exception 'Transición inválida'; end if;
    update public.liquidations set estado='revisada',reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=p_id returning * into v;
    insert into public.liquidation_approvals(liquidation_id,etapa,decision,comentario) values(p_id,'revision','aprobada',p_comentario) on conflict do nothing;
    v_event='liquidation.reviewed';
  elsif p_estado='con_novedades' then
    if not public.tiene_capacidad_aliados('aprobador') then raise exception 'Solo Óscar/aprobador puede devolver la liquidación'; end if;
    if v.estado not in('calculada','revisada') then raise exception 'Transición inválida'; end if;
    if nullif(btrim(p_comentario),'') is null then raise exception 'El motivo es obligatorio'; end if;
    update public.liquidations set estado='con_novedades',reviewed_at=null,reviewed_by=null,updated_at=now() where id=p_id returning * into v;
    insert into public.liquidation_approvals(liquidation_id,etapa,decision,comentario) values(p_id,'revision','correccion',p_comentario) on conflict do nothing;
    v_event='liquidation.has_incidents';
  elsif p_estado='aprobada' then
    if not public.tiene_capacidad_aliados('aprobador') then raise exception 'Solo Óscar/aprobador puede aprobar'; end if;
    if v.estado<>'revisada' then raise exception 'Transición inválida'; end if;
    if exists(select 1 from public.liquidation_incidents where liquidation_id=p_id and bloquea_aprobacion and estado='abierta') then raise exception 'Existen novedades que bloquean la aprobación'; end if;
    if exists(select 1 from public.liquidation_operations where liquidation_id=p_id and tipo_establecimiento='propia' and (v.plataforma<>'krediya' or reconocida) and coalesce(pagamos,0)<=0) then raise exception 'operacion_tienda_sin_pagamos'; end if;
    if exists(select 1 from public.liquidation_operations where liquidation_id=p_id and tipo_establecimiento='propia' and (v.plataforma<>'krediya' or reconocida) and diferencia_inicial<>0 and diferencia_revisada_at is null) then raise exception 'diferencia_inicial_sin_revisar'; end if;
    if v.plataforma<>'krediya' and exists(select 1 from public.payment_orders po left join public.beneficiary_bank_accounts ba on ba.id=po.bank_account_id where po.liquidation_id=p_id and (ba.id is null or not ba.validada)) then raise exception 'Beneficiario sin cuenta bancaria validada'; end if;

    -- Solo aliados y bonificaciones generan órdenes bancarias. El valor de las
    -- tiendas propias se aplica por compensación a su cartera y no debe exigirse
    -- nuevamente dentro del detalle de transferencias.
    v_pago_bancario_esperado := coalesce(v.total_pago_aliados,0) + coalesce(v.total_bonos,0);
    select coalesce(sum(valor),0) into v_pago_bancario_detalle
      from public.payment_orders
      where liquidation_id=p_id and estado not in('rechazado','anulado');
    if v_pago_bancario_esperado <> v_pago_bancario_detalle then
      raise exception 'Órdenes bancarias (%) diferentes al pago esperado de aliados y bonos (%)', v_pago_bancario_detalle, v_pago_bancario_esperado;
    end if;

    update public.liquidations set estado='aprobada',approved_by=auth.uid(),approved_at=now(),frozen_at=now(),updated_at=now() where id=p_id returning * into v;
    insert into public.liquidation_approvals(liquidation_id,etapa,decision,comentario) values(p_id,'aprobacion','aprobada',p_comentario) on conflict do nothing;
    v_event='liquidation.approved';
  else
    raise exception 'Transición no habilitada por este RPC';
  end if;

  insert into public.liquidation_domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
    values(v_event,'liquidation',p_id,jsonb_build_object('liquidation_id',p_id),p_id||':'||p_estado)
    on conflict(idempotency_key) do nothing;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(auth.uid(),'aliados_liquidacion_'||p_estado,'liquidations',p_id,jsonb_build_object('anterior',v_anterior,'nuevo',p_estado,'comentario',p_comentario));
  return v;
end;
$function$
;
revoke all on function kora_private.cambiar_estado_liquidacion(uuid,text,text) from public,anon;
grant execute on function kora_private.cambiar_estado_liquidacion(uuid,text,text) to authenticated;
create or replace function public.aliados_cambiar_estado(p_id uuid,p_estado text,p_comentario text default null)
returns public.liquidations language sql security invoker set search_path='' as $$
 select kora_private.cambiar_estado_liquidacion(p_id,p_estado,p_comentario);
$$;
revoke all on function public.aliados_cambiar_estado(uuid,text,text) from public,anon;
grant execute on function public.aliados_cambiar_estado(uuid,text,text) to authenticated;
