-- Krediya is deliberately isolated from the PayJoy/ALO percentage engine.
alter table public.liquidation_platforms drop constraint if exists liquidation_platforms_id_check;
alter table public.liquidation_platforms add constraint liquidation_platforms_id_check
 check(id in('payjoy','alo','krediya'));
insert into public.liquidation_platforms(id,nombre,activo)
values('krediya','Krediya',true)
on conflict(id) do update set nombre=excluded.nombre,activo=true;

create table if not exists public.krediya_price_rules(
 id uuid primary key default gen_random_uuid(),
 referencia_clave text not null,
 referencia text not null,
 precio_venta numeric(16,2) not null check(precio_venta>0),
 pagamos numeric(16,2) not null check(pagamos>0),
 vigente_desde date not null default current_date,
 vigente_hasta date,
 activo boolean not null default true,
 creado_por uuid references public.perfiles(id) default auth.uid(),
 actualizado_por uuid references public.perfiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(vigente_hasta is null or vigente_hasta>=vigente_desde)
);
create unique index if not exists krediya_price_rules_active_key
 on public.krediya_price_rules(referencia_clave) where activo and vigente_hasta is null;
alter table public.krediya_price_rules enable row level security;
drop policy if exists krediya_price_rules_select on public.krediya_price_rules;
create policy krediya_price_rules_select on public.krediya_price_rules for select to authenticated
 using(public.tiene_capacidad_aliados('revisor'));
drop policy if exists krediya_price_rules_write on public.krediya_price_rules;
create policy krediya_price_rules_write on public.krediya_price_rules for all to authenticated
 using(public.tiene_capacidad_aliados('revisor')) with check(public.tiene_capacidad_aliados('revisor'));

create or replace function public.aliados_resolver_precio_krediya(
 p_operation_id uuid,p_decision text,p_precio_venta numeric default null,p_pagamos numeric default null,p_justificacion text default null
) returns public.liquidation_operations
language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.liquidation_operations%rowtype;k text;v_precio numeric;v_pagamos numeric;
begin
 if not public.tiene_capacidad_aliados('revisor') then raise exception 'No autorizado';end if;
 select * into o from public.liquidation_operations where id=p_operation_id and plataforma='krediya' for update;
 if not found then raise exception 'Operación Krediya no encontrada';end if;
 if p_decision not in('usar_archivo','corregir_configuracion','error_archivo') then raise exception 'Decisión inválida';end if;
 if nullif(btrim(coalesce(p_justificacion,'')),'') is null then raise exception 'La justificación es obligatoria';end if;
 k:=lower(btrim(coalesce(o.modelo,o.referencia,'')));
 if k='' then raise exception 'La operación no tiene referencia o modelo';end if;
 if p_decision='error_archivo' then
  update public.liquidation_incidents set resolution='Archivo reportado con error: '||btrim(p_justificacion),estado='resuelta',resolved_by=auth.uid(),resolved_at=now()
   where operation_id=o.id and estado='abierta' and tipo like 'krediya_%';
  update public.liquidations set estado='con_novedades',updated_at=now() where id=o.liquidation_id;
  return o;
 end if;
 v_precio:=coalesce(p_precio_venta,(o.normalized_data->>'valorComercial')::numeric);
 v_pagamos:=coalesce(p_pagamos,(o.normalized_data->>'pagamosArchivo')::numeric);
 if v_precio<=0 or v_pagamos<=0 then raise exception 'Precio de venta y Pagamos deben ser mayores que cero';end if;
 update public.krediya_price_rules set activo=false,vigente_hasta=current_date-1,actualizado_por=auth.uid(),updated_at=now()
  where referencia_clave=k and activo and vigente_hasta is null;
 insert into public.krediya_price_rules(referencia_clave,referencia,precio_venta,pagamos,creado_por,actualizado_por)
 values(k,coalesce(o.modelo,o.referencia),v_precio,v_pagamos,auth.uid(),auth.uid());
 update public.liquidation_incidents set resolution='Regla Krediya confirmada por Mayte: '||btrim(p_justificacion),estado='resuelta',resolved_by=auth.uid(),resolved_at=now()
  where operation_id=o.id and estado='abierta' and tipo like 'krediya_%';
 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),'krediya_regla_precio_resuelta','liquidation_operations',o.id,jsonb_build_object('decision',p_decision,'precio_venta',v_precio,'pagamos',v_pagamos,'justificacion',p_justificacion));
 return o;
end$$;

create or replace function public.aliados_calcular_liquidacion_krediya(p_id uuid)
returns public.liquidations language plpgsql security definer set search_path=public,pg_temp as $$
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
  select * into r from public.krediya_price_rules where referencia_clave=k and activo and vigente_desde<=o.operation_at::date and (vigente_hasta is null or vigente_hasta>=o.operation_at::date) order by vigente_desde desc limit 1;
  if not found then
   insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,o.id,'krediya_regla_precio_ausente','Mayte debe confirmar Precio de venta y Pagamos para esta referencia') on conflict do nothing;continue;
  end if;
  v_precio:=coalesce((o.normalized_data->>'valorComercial')::numeric,coalesce(o.monto_credito,o.monto_base)+o.inicial);
  v_pagamos:=coalesce((o.normalized_data->>'pagamosArchivo')::numeric,0);
  v_pago:=coalesce((o.normalized_data->>'pagoNetoArchivo')::numeric,0);
  v_bonus:=coalesce((o.normalized_data->>'bonoArchivo')::numeric,0);
  v_util:=coalesce((o.normalized_data->>'utilidadArchivo')::numeric,0);
  if r.precio_venta<>v_precio then insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,o.id,'krediya_precio_venta_diferente','Precio archivo: '||v_precio||'; configurado: '||r.precio_venta||'. Mayte debe decidir.') on conflict do nothing;continue;end if;
  if r.pagamos<>v_pagamos then insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,o.id,'krediya_pagamos_diferente','Pagamos archivo: '||v_pagamos||'; configurado: '||r.pagamos||'. Mayte debe decidir.') on conflict do nothing;continue;end if;
  if abs((v_pagamos-o.inicial)-v_pago)>.01 or abs((v_pago+v_bonus+v_util)-coalesce(o.monto_credito,o.monto_base))>.01 then
   insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,o.id,'krediya_formula_inconsistente','Los valores del archivo no cuadran: Pagamos - abono = comisión y crédito = comisión + bono + utilidad') on conflict do nothing;continue;
  end if;
  update public.liquidation_operations set valor_comercial=v_precio,pagamos=v_pagamos,pago_neto_beneficiario=v_pago,pago_neto_tienda=case when tipo_establecimiento='propia' then v_pago else pago_neto_tienda end,bonos_aplicados=v_bonus,utilidad_creditek=v_util,utilidad_creditek_tienda=case when tipo_establecimiento='propia' then v_util else utilidad_creditek_tienda end,policy_snapshot=jsonb_build_object('motor','krediya_archivo_validado','regla_id',r.id,'precio_venta',r.precio_venta,'pagamos',r.pagamos) where id=o.id;
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
end$$;

revoke all on function public.aliados_resolver_precio_krediya(uuid,text,numeric,numeric,text) from public,anon;
grant execute on function public.aliados_resolver_precio_krediya(uuid,text,numeric,numeric,text) to authenticated;
revoke all on function public.aliados_calcular_liquidacion_krediya(uuid) from public,anon;
grant execute on function public.aliados_calcular_liquidacion_krediya(uuid) to authenticated;
