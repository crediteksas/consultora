-- Oscar: $5.000 gestión Maythe + $15.000 operación Oscar para TODAS las ventas Krediya.
-- Repair the mistakenly narrow start date; amounts/payees and approved batches remain unchanged.
do $repair$
declare desde date; r public.krediya_bonus_rules%rowtype; before_rule jsonb; incident record; n integer:=0;
begin
 select min((o.operation_at at time zone 'America/Bogota')::date) into desde
 from public.liquidation_operations o join public.liquidations l on l.id=o.liquidation_id
 where o.plataforma='krediya' and o.reconocida and l.frozen_at is null
 and l.estado in ('importada','validada','con_novedades','calculada');
 if desde is null then return;end if;
 if (select count(*) from public.krediya_bonus_rules where activo and vigente_hasta is null
 and ((concepto='gestion_krediya' and valor=5000) or (concepto='operacion' and valor=15000))
 and beneficiary_id is not null and tipo_establecimiento in ('propia','aliado'))<>4 then
  raise exception 'La configuración cambió; no se modifica la vigencia automáticamente';
 end if;
 for r in select * from public.krediya_bonus_rules where activo and vigente_hasta is null
 and tipo_establecimiento in ('propia','aliado') and concepto in ('gestion_krediya','operacion') for update loop
  if r.vigente_desde>desde then
   before_rule:=to_jsonb(r);
   update public.krediya_bonus_rules set vigente_desde=desde,updated_at=now() where id=r.id;
   insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
   values(null,'krediya_corregir_vigencia_bonos','krediya_bonus_rules',r.id,
    jsonb_build_object('anterior',before_rule,'vigente_desde',desde,'motivo','Oscar confirmó bonos para todas las ventas Krediya del lote pendiente; sin cambios de montos ni beneficiarios'));
  end if;
 end loop;
 for incident in select i.id,i.liquidation_id from public.liquidation_incidents i
 join public.liquidation_operations o on o.id=i.operation_id
 join public.liquidations l on l.id=i.liquidation_id
 where i.tipo='krediya_bono_sin_configurar' and i.estado='abierta' and o.plataforma='krediya'
 and o.reconocida and l.frozen_at is null and l.estado in ('importada','validada','con_novedades','calculada')
 and (select sum(b.valor) from public.krediya_bonus_rules b where b.activo and b.tipo_establecimiento=o.tipo_establecimiento
 and b.vigente_desde<=(o.operation_at at time zone 'America/Bogota')::date
 and (b.vigente_hasta is null or b.vigente_hasta>=(o.operation_at at time zone 'America/Bogota')::date))=20000
 loop
  update public.liquidation_incidents set estado='resuelta',resolved_at=now(),
  resolution='Vigencia corregida: gestión Maythe $5.000 + operación Oscar $15.000, ya autorizados hasta nueva orden. No requiere reconfirmar.'
  where id=incident.id;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
   values(null,'krediya_bono_alerta_corregida','liquidation_incidents',incident.id,jsonb_build_object('liquidacion',incident.liquidation_id,'motivo','Reglas vigentes comprobadas por $20.000; sin generar pagos'));
  n:=n+1;
 end loop;
end $repair$;
