-- Decisions apply only to this operation; original import and global tariff remain intact.
create or replace function public.krediya_precio_efectivo(p_operation_id uuid)
returns public.krediya_price_rules language plpgsql stable security definer set search_path=public,pg_temp as $$
declare o public.liquidation_operations%rowtype; r public.krediya_price_rules%rowtype; d jsonb;
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
 d:=o.policy_snapshot->'decision_precio';
 if d is not null then
  r.precio_venta:=(d->>'precio_venta')::numeric; r.pagamos:=(d->>'pagamos')::numeric;
  r.referencia:=coalesce(o.referencia,o.modelo); r.referencia_clave:=lower(btrim(coalesce(o.modelo,o.referencia,'')));
 end if;
 return r;
end$$;

create or replace function public.aliados_contexto_precio_krediya(p_operation_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
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
 select sum(valor) into b from public.krediya_bonus_rules where tipo_establecimiento=o.tipo_establecimiento and activo
 and vigente_desde<=(o.operation_at at time zone 'America/Bogota')::date and (vigente_hasta is null or vigente_hasta>=(o.operation_at at time zone 'America/Bogota')::date);
 return jsonb_build_object('operation_id',o.id,'referencia',coalesce(o.referencia,o.modelo),'modelo',o.modelo,'tienda',o.establishment_name,
 'imei',o.imei,'fecha',(o.operation_at at time zone 'America/Bogota')::date,'pvp_guardado',r.precio_venta,'pagamos_guardado',r.pagamos,
 'pvp_recibido',recibido,'pagamos_recibido',pago_recibido,'diferencia_pvp',recibido-r.precio_venta,
 'bonos',b,'inicial',o.inicial,'decision',o.policy_snapshot->'decision_precio','regla_id',r.id);
end$$;

create or replace function public.aliados_resolver_precio_krediya(
 p_operation_id uuid,p_decision text,p_precio_venta numeric default null,p_pagamos numeric default null,p_justificacion text default null)
returns public.liquidation_operations language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.liquidation_operations%rowtype; l public.liquidations%rowtype; c jsonb; d jsonb; precio numeric; pago numeric;
begin
 if auth.uid() is null or not public.tiene_capacidad_aliados('revisor') then raise exception 'No autorizado';end if;
 select * into o from public.liquidation_operations where id=p_operation_id and plataforma='krediya';
 if not found then raise exception 'Operación no encontrada'; end if;
 select * into l from public.liquidations where id=o.liquidation_id for update;
 if l.frozen_at is not null or l.estado in ('aprobada','programada','pagada','conciliada','cerrada','anulada') then raise exception 'La liquidación no admite cambios'; end if;
 select * into o from public.liquidation_operations where id=p_operation_id for update;
 if not o.reconocida then raise exception 'Operación no reconocida o anulada'; end if;
 if p_decision not in ('aceptar_krediya','conservar_guardado','editar_operacion') or p_decision is null then raise exception 'Abre el editor de precios actualizado'; end if;
 if nullif(btrim(coalesce(p_justificacion,'')),'') is null then raise exception 'Indica el motivo de la decisión';end if;
 c:=public.aliados_contexto_precio_krediya(o.id);
 precio:=case p_decision when 'aceptar_krediya' then (c->>'pvp_recibido')::numeric when 'conservar_guardado' then (c->>'pvp_guardado')::numeric else p_precio_venta end;
 pago:=case p_decision when 'conservar_guardado' then (c->>'pagamos_guardado')::numeric else p_pagamos end;
 if precio is null or pago is null or precio<=0 or pago<=0 then raise exception 'Falta PVP o Pagamos válido; no se guardó ningún cambio';end if;
 if pago<coalesce(o.inicial,0) then raise exception 'Pagamos no puede ser menor que la inicial'; end if;
 d:=jsonb_build_object('decision',p_decision,'precio_venta',precio,'pagamos',pago,'motivo',btrim(p_justificacion),'usuario',auth.uid(),'fecha',now(),'comparacion',c-'decision');
 update public.liquidation_operations set policy_snapshot=coalesce(policy_snapshot,'{}'::jsonb)||jsonb_build_object('decision_precio',d)
 where id=o.id returning * into o;
 update public.liquidation_incidents set estado='resuelta',resolution='Decisión de precio para esta operación: '||p_decision||'. '||btrim(p_justificacion),resolved_by=auth.uid(),resolved_at=now()
 where operation_id=o.id and estado='abierta' and tipo in ('krediya_regla_precio_ausente','krediya_precio_venta_diferente','krediya_pagamos_diferente');
 update public.liquidations set estado='importada',reviewed_by=null,reviewed_at=null,updated_at=now() where id=l.id;
 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),'krediya_decision_precio','liquidation_operations',o.id,d);
 return o;
end$$;

create or replace function public.aliados_sincronizar_precios_krediya(p_id uuid)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.liquidation_operations%rowtype; r public.krediya_price_rules%rowtype; c jsonb; n integer:=0; v integer;
begin
 if auth.uid() is null or not public.tiene_capacidad_aliados('revisor') then raise exception 'No autorizado';end if;
 perform 1 from public.liquidations where id=p_id and plataforma='krediya' and frozen_at is null and estado in ('importada','con_novedades','validada','calculada') for update;
 if not found then raise exception 'Liquidación no editable';end if;
 for o in select * from public.liquidation_operations where liquidation_id=p_id and reconocida and plataforma='krediya' loop
  r:=public.krediya_precio_efectivo(o.id); c:=public.aliados_contexto_precio_krediya(o.id);
  if (c->>'bonos')::numeric=20000 then
   update public.liquidation_incidents set estado='resuelta',resolution='Bonos vigentes ya configurados: gestión $5.000 y operación $15.000',resolved_by=auth.uid(),resolved_at=now()
    where operation_id=o.id and estado='abierta' and tipo='krediya_bono_sin_configurar';
   get diagnostics v=row_count; n:=n+v;
  end if;
  if r.precio_venta>0 and r.pagamos>0 and (o.policy_snapshot ? 'decision_precio' or
    (r.precio_venta=(c->>'pvp_recibido')::numeric and ((c->>'pagamos_recibido') is null or r.pagamos=(c->>'pagamos_recibido')::numeric))) then
   update public.liquidation_incidents set estado='resuelta',resolution='Precio vinculado: coincide con tarifa vigente o decisión registrada',resolved_by=auth.uid(),resolved_at=now()
    where operation_id=o.id and estado='abierta' and tipo in ('krediya_regla_precio_ausente','krediya_precio_venta_diferente','krediya_pagamos_diferente');
   get diagnostics v=row_count; n:=n+v;
  end if;
 end loop;
 if n>0 then insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),'krediya_precios_coincidentes','liquidations',p_id,jsonb_build_object('alertas_resueltas',n));end if;
 return n;
end$$;
revoke all on function public.krediya_precio_efectivo(uuid),public.aliados_contexto_precio_krediya(uuid),public.aliados_sincronizar_precios_krediya(uuid),public.aliados_resolver_precio_krediya(uuid,text,numeric,numeric,text) from public,anon;
grant execute on function public.krediya_precio_efectivo(uuid),public.aliados_contexto_precio_krediya(uuid),public.aliados_sincronizar_precios_krediya(uuid),public.aliados_resolver_precio_krediya(uuid,text,numeric,numeric,text) to authenticated;
CREATE OR REPLACE FUNCTION public.aliados_calcular_liquidacion_krediya(p_id uuid)
 RETURNS liquidations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 o public.liquidation_operations%rowtype;
 pr public.krediya_price_rules%rowtype;
 br record;
 v_bono numeric;
 v_result public.liquidations%rowtype;
 v_bruta numeric;
 v_provision numeric;
begin
 if not public.tiene_capacidad_aliados('revisor') then
  raise exception 'No autorizado para calcular';
 end if;

 perform 1 from public.liquidations where id=p_id and plataforma='krediya' and frozen_at is null and estado in ('importada','validada','calculada','con_novedades') for update;
 if not found then raise exception 'Liquidación no editable'; end if;
 perform public.aliados_sincronizar_precios_krediya(p_id);

 delete from public.liquidation_bonuses
 where liquidation_id=p_id and tipo_bono in('krediya_gestion','krediya_operacion');

 for o in
  select * from public.liquidation_operations
  where liquidation_id=p_id and plataforma='krediya' and reconocida
  order by operation_at,id
  for update
 loop
  select coalesce(sum(valor),0) into v_bono
  from public.krediya_bonus_rules
  where tipo_establecimiento=o.tipo_establecimiento and activo
   and vigente_desde<=o.operation_at::date
   and (vigente_hasta is null or vigente_hasta>=o.operation_at::date);

  if v_bono<>20000 then
   insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion)
   values(p_id,o.id,'krediya_bono_sin_configurar','Krediya requiere bonos vigentes por $20.000: $5.000 para Mayte y $15.000 por Operación para Oscar Pacheco')
   on conflict do nothing;
   continue;
  end if;

  pr:=public.krediya_precio_efectivo(o.id);
  if pr.precio_venta is null or pr.pagamos is null then
   continue;
  end if;

  if not (coalesce(o.policy_snapshot,'{}'::jsonb) ? 'decision_precio') and (
   pr.precio_venta <> (public.aliados_contexto_precio_krediya(o.id)->>'pvp_recibido')::numeric
   or (pr.pagamos <> (public.aliados_contexto_precio_krediya(o.id)->>'pagamos_recibido')::numeric)
  ) then
   insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion)
   values(p_id,o.id,'krediya_precio_venta_diferente','Hay una diferencia entre el precio guardado y el recibido. Abre el editor para comparar.')
   on conflict do nothing;
   continue;
  end if;
  update public.liquidation_operations set policy_snapshot=coalesce(policy_snapshot,'{}'::jsonb)||
    jsonb_build_object('krediya_fuente',coalesce(policy_snapshot->'krediya_fuente',jsonb_build_object('valorComercial',normalized_data->'valorComercial','pagamosArchivo',normalized_data->'pagamosArchivo')))
   where id=o.id;

  for br in
   select * from public.krediya_bonus_rules
   where tipo_establecimiento=o.tipo_establecimiento and activo
    and vigente_desde<=o.operation_at::date
    and (vigente_hasta is null or vigente_hasta>=o.operation_at::date)
  loop
   insert into public.liquidation_bonuses(
    liquidation_id,operation_id,beneficiary_id,tipo_bono,rule_snapshot,valor,motivo,estado,idempotency_key
   ) values(
    p_id,o.id,br.beneficiary_id,
    case when br.concepto='operacion' then 'krediya_operacion' else 'krediya_gestion' end,
    jsonb_build_object('regla_id',br.id,'concepto',br.concepto,'vigente_desde',br.vigente_desde),
    br.valor,
    case when br.concepto='operacion' then 'Bono Operación Krediya — Oscar Pacheco' else 'Gestión de crédito Krediya — Mayte Reyes' end,
    'aprobado',gen_random_uuid()
   );
  end loop;

  update public.liquidation_operations
  set normalized_data=coalesce(normalized_data,'{}'::jsonb)||jsonb_build_object(
   'pagamosArchivo',pr.pagamos,
   'pagoNetoArchivo',pr.pagamos-coalesce(o.inicial,0),
   'bonoArchivo',v_bono,
   'utilidadArchivo',pr.precio_venta-pr.pagamos-v_bono,
   'origenValoresLiquidacion','tarifario_kora'
  )
  where id=o.id;
 end loop;

 v_result:=public.aliados_calcular_liquidacion_krediya_original_v1(p_id);
 if v_result.estado<>'calculada' then return v_result; end if;

 for o in select * from public.liquidation_operations where liquidation_id=p_id and plataforma='krediya' and reconocida for update loop
  v_bruta:=coalesce(o.utilidad_creditek,0);
  v_provision:=round(v_bruta*0.28,2);
  update public.liquidation_operations
   set utilidad_creditek=round(v_bruta-v_provision,2),
       utilidad_creditek_tienda=case when tipo_establecimiento='propia' then round(v_bruta-v_provision,2) else utilidad_creditek_tienda end,
       policy_snapshot=coalesce(policy_snapshot,'{}'::jsonb)||jsonb_build_object('utilidad_bruta',v_bruta,'provision_porcentaje',0.28,'provision',v_provision,'utilidad_neta',round(v_bruta-v_provision,2))
   where id=o.id;
  update public.liquidation_calculations
   set utilidad_creditek=round(v_bruta-v_provision,2),
       policy_snapshot=coalesce(policy_snapshot,'{}'::jsonb)||jsonb_build_object('utilidad_bruta',v_bruta,'provision_porcentaje',0.28,'provision',v_provision),
       explanation=coalesce(explanation,'{}'::jsonb)||jsonb_build_object('bono_mayte',5000,'bono_operacion_oscar',15000,'utilidad_bruta',v_bruta,'provision',v_provision,'utilidad_neta',round(v_bruta-v_provision,2))
   where liquidation_id=p_id and operation_id=o.id;
 end loop;

 update public.liquidations l set
  total_bonos=(select coalesce(sum(valor),0) from public.liquidation_bonuses where liquidation_id=p_id and estado='aprobado'),
  total_utilidad_creditek=(select coalesce(sum(utilidad_creditek),0) from public.liquidation_operations where liquidation_id=p_id and reconocida),
  total_utilidad_tiendas=(select coalesce(sum(utilidad_creditek),0) from public.liquidation_operations where liquidation_id=p_id and reconocida and tipo_establecimiento='propia'),
  total_pagar=coalesce(total_pago_aliados,0)+(select coalesce(sum(valor),0) from public.liquidation_bonuses where liquidation_id=p_id and estado='aprobado'),
  updated_at=now()
 where l.id=p_id returning * into v_result;

 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
 values(auth.uid(),'krediya_bonos_y_provision_calculados','liquidations',p_id,jsonb_build_object('bono_mayte_por_credito',5000,'bono_operacion_oscar_por_credito',15000,'provision_porcentaje',0.28));
 return v_result;
end$function$
;

CREATE OR REPLACE FUNCTION public.aliados_calcular_liquidacion_krediya_archivo_manual(p_id uuid)
 RETURNS liquidations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v public.liquidations%rowtype;o public.liquidation_operations%rowtype;r public.krediya_price_rules%rowtype;
 b public.liquidation_beneficiaries%rowtype;a public.beneficiary_bank_accounts%rowtype;v_order uuid;
 k text;v_precio numeric;v_pagamos numeric;v_pago numeric;v_bonus numeric;v_util numeric;
 total_comercial numeric:=0;total_aliados numeric:=0;total_retail numeric:=0;total_bonus numeric:=0;total_util numeric:=0;util_retail numeric:=0;n_aliados int:=0;n_retail int:=0;
begin
 if not public.tiene_capacidad_aliados('revisor') then raise exception 'No autorizado para calcular';end if;
 select * into v from public.liquidations where id=p_id and plataforma='krediya' for update;
 if not found then raise exception 'Liquidación Krediya no encontrada';end if;
 if v.frozen_at is not null then raise exception 'Liquidación aprobada inmutable';end if;
 if v.estado not in('validada','calculada','con_novedades') then raise exception 'La liquidación debe estar validada';end if;
 delete from public.payment_items where payment_order_id in(select id from public.payment_orders where liquidation_id=p_id and estado='pendiente');
 delete from public.payment_orders where liquidation_id=p_id and estado='pendiente';
 delete from public.liquidation_calculations where liquidation_id=p_id;
 for o in select * from public.liquidation_operations where liquidation_id=p_id order by operation_at,id loop
  if not o.reconocida or o.tipo_establecimiento='no_reconocido' then continue;end if;
  k:=lower(btrim(coalesce(o.modelo,o.referencia,'')));
  r:=public.krediya_precio_efectivo(o.id);
  if r.precio_venta is null or r.pagamos is null then
   insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,o.id,'krediya_regla_precio_ausente','Mayte debe confirmar Precio de venta y Pagamos para esta referencia') on conflict do nothing;continue;
  end if;
  v_precio:=case when o.policy_snapshot ? 'decision_precio' then r.precio_venta else coalesce((o.normalized_data->>'valorComercial')::numeric,coalesce(o.monto_credito,o.monto_base)+o.inicial) end;
  v_pagamos:=coalesce((o.normalized_data->>'pagamosArchivo')::numeric,0);
  v_pago:=coalesce((o.normalized_data->>'pagoNetoArchivo')::numeric,0);
  v_bonus:=coalesce((o.normalized_data->>'bonoArchivo')::numeric,0);
  v_util:=coalesce((o.normalized_data->>'utilidadArchivo')::numeric,0);
  if r.precio_venta<>v_precio then insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,o.id,'krediya_precio_venta_diferente','Precio archivo: '||v_precio||'; configurado: '||r.precio_venta||'. Mayte debe decidir.') on conflict do nothing;continue;end if;
  if r.pagamos<>v_pagamos then insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,o.id,'krediya_pagamos_diferente','Pagamos archivo: '||v_pagamos||'; configurado: '||r.pagamos||'. Mayte debe decidir.') on conflict do nothing;continue;end if;
  if abs((v_pagamos-o.inicial)-v_pago)>.01 or abs((v_pago+v_bonus+v_util)-(v_precio-coalesce(o.inicial,0)))>.01 then
   insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,o.id,'krediya_formula_inconsistente','Los valores del archivo no cuadran: Pagamos - abono = comisión y crédito = comisión + bono + utilidad') on conflict do nothing;continue;
  end if;
  update public.liquidation_operations set valor_comercial=v_precio,pagamos=v_pagamos,pago_neto_beneficiario=v_pago,pago_neto_tienda=case when tipo_establecimiento='propia' then v_pago else pago_neto_tienda end,bonos_aplicados=v_bonus,utilidad_creditek=v_util,utilidad_creditek_tienda=case when tipo_establecimiento='propia' then v_util else utilidad_creditek_tienda end,policy_snapshot=coalesce(policy_snapshot,'{}'::jsonb)||jsonb_build_object('motor','krediya_archivo_validado','regla_id',r.id,'precio_venta',r.precio_venta,'pagamos',r.pagamos) where id=o.id;
  insert into public.liquidation_calculations(liquidation_id,operation_id,policy_snapshot,pagamos,pago_aliado,total_bonos,utilidad_creditek,explanation) values(p_id,o.id,jsonb_build_object('motor','krediya_archivo_validado','regla_id',r.id),v_pagamos,v_pago,v_bonus,v_util,jsonb_build_object('precio_venta',v_precio,'pagamos',v_pagamos,'abono',o.inicial,'pago_neto',v_pago));
  if o.tipo_establecimiento='aliado' then
   if o.ejecutivo_id is null then insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,o.id,'aliado_sin_ejecutivo','El aliado no tiene ejecutivo vigente') on conflict do nothing;continue;end if;
   select * into b from public.liquidation_beneficiaries where tipo='aliado' and origen_codigo=o.origen_codigo and activo limit 1;
   if not found then insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion,bloquea_aprobacion) values(p_id,o.id,'beneficiario_sin_identificacion','Falta beneficiario bancario para pagar al aliado',false) on conflict do nothing;
   else
    select * into a from public.beneficiary_bank_accounts where beneficiary_id=b.id and activo and validada order by validada_at desc limit 1;
    if not found then insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion,bloquea_aprobacion) values(p_id,o.id,'cuenta_bancaria_no_validada','Falta cuenta bancaria validada para pagar al aliado',false) on conflict do nothing;
    else insert into public.payment_orders(liquidation_id,beneficiary_id,bank_account_id,valor,idempotency_key) values(p_id,b.id,a.id,v_pago,gen_random_uuid()) on conflict(liquidation_id,beneficiary_id) do update set valor=public.payment_orders.valor+excluded.valor returning id into v_order;insert into public.payment_items(payment_order_id,operation_id,concepto,valor) values(v_order,o.id,'pago_aliado',v_pago);end if;
   end if;
   total_aliados:=total_aliados+v_pago;n_aliados:=n_aliados+1;
  else total_retail:=total_retail+v_pago;util_retail:=util_retail+v_util;n_retail:=n_retail+1;end if;
  total_comercial:=total_comercial+v_precio;total_bonus:=total_bonus+v_bonus;total_util:=total_util+v_util;
 end loop;
 if exists(select 1 from public.liquidation_incidents where liquidation_id=p_id and estado='abierta' and bloquea_aprobacion) then update public.liquidations set estado='con_novedades',updated_at=now() where id=p_id returning * into v;return v;end if;
 update public.liquidations set estado='calculada',total_operaciones=total_comercial,total_pago_aliados=total_aliados,total_pago_tiendas=total_retail,total_bonos=total_bonus,total_utilidad_creditek=total_util,total_utilidad_tiendas=util_retail,total_pagar=total_aliados+total_bonus,operaciones_tiendas=n_retail,operaciones_aliados=n_aliados,updated_at=now() where id=p_id returning * into v;
 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),'krediya_liquidacion_calculada','liquidations',p_id,jsonb_build_object('aliados',n_aliados,'retail',n_retail,'total_pagar',v.total_pagar));return v;
end$function$
;

CREATE OR REPLACE FUNCTION public.aliados_calcular_liquidacion_krediya_original_v1(p_id uuid)
 RETURNS liquidations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 o public.liquidation_operations%rowtype;
 r public.krediya_price_rules%rowtype;
 br public.krediya_bonus_rules%rowtype;
 v_pagamos numeric;
 v_pago numeric;
 v_bono numeric;
 v_utilidad numeric;
 v_data jsonb;
 v_key text;
begin
 if not public.tiene_capacidad_aliados('revisor') then
  raise exception 'No autorizado para calcular';
 end if;

 for o in
  select * from public.liquidation_operations
  where liquidation_id=p_id and plataforma='krediya'
  order by operation_at,id
  for update
 loop
  v_data:=coalesce(o.normalized_data,'{}'::jsonb);
  if v_data ? 'pagamosArchivo' and nullif(v_data->>'pagamosArchivo','') is not null then
   continue;
  end if;

  v_key:=lower(btrim(coalesce(o.modelo,o.referencia,'')));
  r:=public.krediya_precio_efectivo(o.id);
  if r.precio_venta is null or r.pagamos is null then
   continue;
  end if;

  select * into br from public.krediya_bonus_rules
   where tipo_establecimiento=o.tipo_establecimiento and activo
    and vigente_desde<=o.operation_at::date
    and (vigente_hasta is null or vigente_hasta>=o.operation_at::date)
   order by vigente_desde desc limit 1;
  if not found then
   insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion)
   values(p_id,o.id,'krediya_bono_sin_configurar','Falta configurar el bono Krediya vigente para este tipo de establecimiento')
   on conflict do nothing;
   continue;
  end if;

  v_pagamos:=r.pagamos;
  v_pago:=v_pagamos-coalesce(o.inicial,0);
  v_bono:=br.valor;
  v_utilidad:=coalesce(o.monto_credito,o.monto_base)-v_pago-v_bono;
  if v_pago<0 or v_utilidad<0 then
   insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion)
   values(p_id,o.id,'krediya_formula_inconsistente','El tarifario genera un pago o una utilidad negativa; requiere revisión administrativa')
   on conflict do nothing;
   continue;
  end if;

  update public.liquidation_operations
   set normalized_data=v_data||jsonb_build_object(
    'pagamosArchivo',v_pagamos,
    'pagoNetoArchivo',v_pago,
    'bonoArchivo',v_bono,
    'utilidadArchivo',v_utilidad,
    'origenValoresLiquidacion','tarifario_kora',
    'reglaPrecioId',r.id,
    'reglaBonoId',br.id
   )
   where id=o.id;
 end loop;

 return public.aliados_calcular_liquidacion_krediya_archivo_manual(p_id);
end$function$
;
