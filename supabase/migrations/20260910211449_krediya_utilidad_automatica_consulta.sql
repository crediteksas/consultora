-- Consulta matemática: STABLE, sin mutaciones ni aprobación de lotes/pagos.
create function krediya_private.utilidad_consulta(p_operation_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o public.liquidation_operations%rowtype; e public.ejecutivos%rowtype;
 c jsonb; faltan text[]:='{}'; ejecutivo numeric:=0; operativos numeric:=0; extras numeric:=0; manuales numeric:=0;
 precio numeric; pactado numeric; financiero numeric; bonos numeric; bruta numeric; provision numeric;
 vendedor text; nombre text; directa boolean; secuencia bigint; fecha date;
begin
 if auth.uid() is null or not public.tiene_capacidad_aliados('revisor') then raise exception 'No autorizado';end if;
 select * into o from public.liquidation_operations where id=p_operation_id and plataforma='krediya';
 if not found then raise exception 'Operación no encontrada';end if;
 if not o.reconocida then return jsonb_build_object('disponible',false,'motivo','Operación excluida');end if;
 c:=public.aliados_contexto_precio_krediya(o.id);
 fecha:=(o.operation_at at time zone 'America/Bogota')::date;
 precio:=(c->>'pvp_recibido')::numeric; pactado:=(c->>'pagamos_guardado')::numeric;
 if precio is null or precio<=0 then faltan:=array_append(faltan,'PVP recibido');end if;
 if pactado is null or pactado<=0 then faltan:=array_append(faltan,'PAGAMOS');end if;
 if o.inicial is null or o.inicial<0 then faltan:=array_append(faltan,'inicial');end if;
 if o.monto_credito is null or o.monto_credito<=0 then faltan:=array_append(faltan,'valor financiado');end if;
 if fecha is null then faltan:=array_append(faltan,'fecha de venta');end if;
 if o.tipo_establecimiento='aliado' then
  select * into e from public.ejecutivos where id=coalesce(o.ejecutivo_id,(select ejecutivo_id from public.origenes where codigo=o.origen_codigo));
  vendedor:=lower(public.unaccent(coalesce(o.normalized_data->>'vendedorNombre','')));nombre:=lower(public.unaccent(e.nombre));
  directa:=vendedor<>'' and vendedor like '%'||split_part(nombre,' ',1)||'%' and vendedor like '%'||split_part(nombre,' ',2)||'%';
  select count(*)+1 into secuencia from public.liquidation_operations where origen_codigo=o.origen_codigo and tipo_establecimiento='aliado' and reconocida and operation_at<o.operation_at;
  ejecutivo:=case e.esquema_comision->>'tipo'
   when 'tiered_por_aliado' then case when directa then (e.esquema_comision->>'valor_venta_directa')::numeric
    when secuencia<=(e.esquema_comision->>'primeras_n')::int then (e.esquema_comision->>'valor_primeras')::numeric else (e.esquema_comision->>'valor_resto')::numeric end
   when 'fijo' then (e.esquema_comision->>'valor')::numeric
   when 'fijo_mas_override' then (e.esquema_comision->>'valor_propio')::numeric end;
  if ejecutivo is null or ejecutivo<0 or o.origen_codigo is null then faltan:=array_append(faltan,'regla del bono ejecutivo');end if;
  if ejecutivo>0 and not exists(select 1 from public.liquidation_beneficiaries where ejecutivo_id=e.id and tipo='ejecutivo' and activo) then faltan:=array_append(faltan,'beneficiario del bono ejecutivo');end if;
  select coalesce(sum(r.valor),0) into operativos from public.krediya_bonus_rules r where r.activo and r.tipo_establecimiento='aliado' and r.vigente_desde<=fecha and (r.vigente_hasta is null or r.vigente_hasta>=fecha);
  if (select count(*) from public.krediya_bonus_rules r where r.activo and r.tipo_establecimiento='aliado' and r.vigente_desde<=fecha and (r.vigente_hasta is null or r.vigente_hasta>=fecha))<>2 or operativos<>20000 then faltan:=array_append(faltan,'reglas de bonos operativos');end if;
  -- Misma deduplicación del motor: gestión sustituye universal; Krediya no tiene override.
  select coalesce(sum((ex.esquema_comision->>'valor')::numeric),0) into extras from public.ejecutivos ex
   where ex.activo and ex.esquema_comision->>'tipo'='fijo_universal'
   and exists(select 1 from public.liquidation_beneficiaries b where b.ejecutivo_id=ex.id and b.tipo='ejecutivo' and b.activo
    and not exists(select 1 from public.krediya_bonus_rules r where r.activo and r.concepto='gestion_krediya' and r.beneficiary_id=b.id));
 elsif o.tipo_establecimiento is distinct from 'propia' then faltan:=array_append(faltan,'tipo de establecimiento');end if;
 select coalesce(sum(valor),0) into manuales from public.liquidation_bonuses where operation_id=o.id and liquidation_id=o.liquidation_id and estado='aprobado'
  and tipo_bono not in('automatico_ejecutivo','automatico_override','automatico_universal','krediya_gestion','krediya_operacion');
 if cardinality(faltan)>0 then return jsonb_build_object('disponible',false,'motivo','Falta: '||array_to_string(faltan,', '));end if;
 bonos:=ejecutivo+operativos+extras+manuales;financiero:=round(o.monto_credito*0.004,2);
 bruta:=round(precio-pactado-bonos-financiero,2);provision:=round(bruta*0.28,2);
 return jsonb_build_object('disponible',true,'pvp',precio,'pagamos',pactado,'giro',round(pactado-o.inicial,2),'bonos',bonos,
  'gasto_financiero',financiero,'provision',provision,'utilidad_bruta',bruta,'utilidad_neta',bruta-provision);
end $$;
revoke all on function krediya_private.utilidad_consulta(uuid) from public,anon;
grant execute on function krediya_private.utilidad_consulta(uuid) to authenticated;
create or replace function public.aliados_contextos_precios_krediya(p_liquidation_id uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null or not public.tiene_capacidad_aliados('revisor') then raise exception 'No autorizado';end if;
 return coalesce((select jsonb_agg(public.aliados_contexto_precio_krediya(o.id)||jsonb_build_object('automatica',
  case when l.frozen_at is null and l.approved_at is null then krediya_private.utilidad_consulta(o.id) else null end) order by o.operation_at,o.id)
  from public.liquidation_operations o join public.liquidations l on l.id=o.liquidation_id
  where o.liquidation_id=p_liquidation_id and o.plataforma='krediya' and o.reconocida),'[]'::jsonb);
end $$;
revoke all on function public.aliados_contextos_precios_krediya(uuid) from public,anon;
grant execute on function public.aliados_contextos_precios_krediya(uuid) to authenticated;
