-- Regla autorizada por Oscar: Krediya sin override, operación/gestión solo aliados.
-- Solo reemplaza funciones. No recalcula lotes, modifica bonos, órdenes ni pagos existentes.
BEGIN;
CREATE OR REPLACE FUNCTION public.aliados_calcular_bonos_ejecutivos(p_liquidation_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  o record;
  v_ejecutivo record;
  v_extra record;
  v_vendedor_norm text;
  v_ejecutivo_norm text;
  v_venta_directa boolean;
  v_seq integer;
  v_valor numeric;
  v_creados integer := 0;
  v_beneficiary_id uuid;
begin
  if auth.uid() is null or not tiene_capacidad_aliados('revisor') then raise exception 'No autorizado para calcular bonos'; end if;
  if exists(select 1 from liquidations where id=p_liquidation_id and frozen_at is not null) then raise exception 'Liquidación aprobada inmutable'; end if;

  delete from liquidation_bonuses
  where liquidation_id = p_liquidation_id
    and tipo_bono in ('automatico_ejecutivo', 'automatico_override', 'automatico_universal');

  for o in
    select lo.* from liquidation_operations lo
    where lo.liquidation_id = p_liquidation_id
      and lo.tipo_establecimiento = 'aliado'
      and lo.reconocida = true
      and lo.origen_codigo is not null
  loop
    if o.ejecutivo_id is null then
      update liquidation_operations set ejecutivo_id = (select ejecutivo_id from origenes where codigo = o.origen_codigo)
      where id = o.id;
      o.ejecutivo_id := (select ejecutivo_id from origenes where codigo = o.origen_codigo);
    end if;

    if o.ejecutivo_id is not null then
      select * into v_ejecutivo from ejecutivos where id = o.ejecutivo_id;
      if v_ejecutivo.esquema_comision is not null then
        v_vendedor_norm := lower(unaccent(coalesce(o.normalized_data->>'vendedorNombre','')));
        v_ejecutivo_norm := lower(unaccent(v_ejecutivo.nombre));
        v_venta_directa := v_vendedor_norm <> ''
          and v_vendedor_norm like '%'||split_part(v_ejecutivo_norm,' ',1)||'%'
          and v_vendedor_norm like '%'||split_part(v_ejecutivo_norm,' ',2)||'%';

        select count(*)+1 into v_seq
        from liquidation_operations lo2
        where lo2.origen_codigo = o.origen_codigo
          and lo2.tipo_establecimiento = 'aliado'
          and lo2.reconocida = true
          and lo2.operation_at < o.operation_at;

        if v_ejecutivo.esquema_comision->>'tipo' = 'tiered_por_aliado' then
          if v_venta_directa then
            v_valor := (v_ejecutivo.esquema_comision->>'valor_venta_directa')::numeric;
          elsif v_seq <= (v_ejecutivo.esquema_comision->>'primeras_n')::int then
            v_valor := (v_ejecutivo.esquema_comision->>'valor_primeras')::numeric;
          else
            v_valor := (v_ejecutivo.esquema_comision->>'valor_resto')::numeric;
          end if;
        elsif v_ejecutivo.esquema_comision->>'tipo' = 'fijo' then
          v_valor := (v_ejecutivo.esquema_comision->>'valor')::numeric;
        elsif v_ejecutivo.esquema_comision->>'tipo' = 'fijo_mas_override' then
          v_valor := (v_ejecutivo.esquema_comision->>'valor_propio')::numeric;
        else
          v_valor := null;
        end if;

        if v_valor is not null and v_valor > 0 then
          select id into v_beneficiary_id from liquidation_beneficiaries where tipo='ejecutivo' and ejecutivo_id = v_ejecutivo.id and activo limit 1;
          if v_beneficiary_id is not null then
            insert into liquidation_bonuses(liquidation_id, operation_id, beneficiary_id, tipo_bono, valor, motivo, estado, idempotency_key)
            values (p_liquidation_id, o.id, v_beneficiary_id, 'automatico_ejecutivo', v_valor,
              case
                when v_venta_directa then 'Venta directa - ' || v_ejecutivo.nombre
                when v_ejecutivo.esquema_comision->>'tipo' = 'tiered_por_aliado' then 'Venta #' || v_seq || ' del aliado ' || o.origen_codigo
                else 'Comisión fija por crédito'
              end,
              'aprobado', gen_random_uuid());
            v_creados := v_creados + 1;
          end if;
        end if;

        for v_extra in select * from ejecutivos where esquema_comision->>'tipo' = 'fijo_mas_override' and id <> o.ejecutivo_id and activo
          and o.plataforma is distinct from 'krediya'
        loop
          select id into v_beneficiary_id from liquidation_beneficiaries where tipo='ejecutivo' and ejecutivo_id = v_extra.id and activo limit 1;
          if v_beneficiary_id is not null then
            insert into liquidation_bonuses(liquidation_id, operation_id, beneficiary_id, tipo_bono, valor, motivo, estado, idempotency_key)
            values (p_liquidation_id, o.id, v_beneficiary_id, 'automatico_override',
              (v_extra.esquema_comision->>'valor_override_otros_ejecutivos')::numeric,
              'Override sobre venta de ' || v_ejecutivo.nombre, 'aprobado', gen_random_uuid());
            v_creados := v_creados + 1;
          end if;
        end loop;
      end if;
    end if;

    -- comisión universal (Maythe): aplica a TODO crédito de aliado, sin importar el ejecutivo asignado
    for v_extra in select * from ejecutivos where esquema_comision->>'tipo' = 'fijo_universal' and activo
    loop
      select id into v_beneficiary_id from liquidation_beneficiaries where tipo='ejecutivo' and ejecutivo_id = v_extra.id and activo limit 1;
      if v_beneficiary_id is not null then
        insert into liquidation_bonuses(liquidation_id, operation_id, beneficiary_id, tipo_bono, valor, motivo, estado, idempotency_key)
        values (p_liquidation_id, o.id, v_beneficiary_id, 'automatico_universal',
          (v_extra.esquema_comision->>'valor')::numeric,
          'Comisión fija por liquidar crédito de aliado', 'aprobado', gen_random_uuid());
        v_creados := v_creados + 1;
      end if;
    end loop;
  end loop;

  insert into audit_log(usuario,accion,tabla,registro_id,detalle)
  values(auth.uid(),'aliados_bonos_ejecutivos_calculados','liquidations',p_liquidation_id,jsonb_build_object('bonos_creados',v_creados));

  return v_creados;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.aliados_contexto_precio_krediya(p_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare o public.liquidation_operations%rowtype; r public.krediya_price_rules%rowtype; b numeric; recibido numeric; pago_recibido numeric;
begin
 if auth.uid() is null or not public.tiene_capacidad_aliados('revisor') then raise exception 'No autorizado'; end if;
 select * into o from public.liquidation_operations where id=p_operation_id and plataforma='krediya';
 if not found then raise exception 'Operación no encontrada'; end if;
 select * into r from public.krediya_price_rules where referencia_clave in (
 'ref:'||regexp_replace(lower(coalesce(o.referencia,'')),'[^a-z0-9]','','g'),
 lower(btrim(coalesce(o.modelo,o.referencia,''))))
 and activo and vigente_desde<=(o.operation_at at time zone 'America/Bogota')::date
 and (vigente_hasta is null or vigente_hasta>=(o.operation_at at time zone 'America/Bogota')::date)
 order by (referencia_clave like 'ref:%') desc,vigente_desde desc,created_at desc limit 1;
 recibido:=coalesce(nullif(o.policy_snapshot->'krediya_fuente'->>'valorComercial','')::numeric,nullif(o.normalized_data->>'valorComercial','')::numeric,coalesce(o.monto_credito,o.monto_base)+o.inicial);
 pago_recibido:=case when o.policy_snapshot ? 'krediya_fuente' then nullif(o.policy_snapshot->'krediya_fuente'->>'pagamosArchivo','')::numeric when o.normalized_data->>'origenValoresLiquidacion'='tarifario_kora' then null else nullif(o.normalized_data->>'pagamosArchivo','')::numeric end;
 select coalesce(sum(valor),0) into b from public.krediya_bonus_rules where tipo_establecimiento=o.tipo_establecimiento and activo and o.tipo_establecimiento='aliado'
 and vigente_desde<=(o.operation_at at time zone 'America/Bogota')::date and (vigente_hasta is null or vigente_hasta>=(o.operation_at at time zone 'America/Bogota')::date);
 return jsonb_build_object('operation_id',o.id,'referencia',coalesce(o.referencia,o.modelo),'modelo',o.modelo,'tienda',o.establishment_name,
 'imei',o.imei,'fecha',(o.operation_at at time zone 'America/Bogota')::date,'pvp_guardado',r.precio_venta,'pagamos_guardado',coalesce(r.pagamos,nullif(o.policy_snapshot->'pagamos_fuente_manual'->>'pagamos','')::numeric),
 'fuente_pagamos',case when r.id is null then o.policy_snapshot->'pagamos_fuente_manual' else null end,
 'pvp_recibido',recibido,'pagamos_recibido',pago_recibido,'diferencia_pvp',recibido-r.precio_venta,
 'bonos',b,'inicial',o.inicial,'decision',o.policy_snapshot->'decision_precio','regla_id',r.id);
end$function$
;

CREATE OR REPLACE FUNCTION krediya_private.calcular_y_enviar_aprobacion(p_id uuid)
 RETURNS liquidations
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
  if o.tipo_establecimiento='aliado' then
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
  end if;
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
  for br in select * from public.krediya_bonus_rules r where r.activo and r.tipo_establecimiento=o.tipo_establecimiento and o.tipo_establecimiento='aliado'
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

REVOKE ALL ON FUNCTION public.aliados_calcular_bonos_ejecutivos(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aliados_contexto_precio_krediya(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION krediya_private.calcular_y_enviar_aprobacion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aliados_calcular_bonos_ejecutivos(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aliados_contexto_precio_krediya(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION krediya_private.calcular_y_enviar_aprobacion(uuid) TO authenticated;
COMMIT;
