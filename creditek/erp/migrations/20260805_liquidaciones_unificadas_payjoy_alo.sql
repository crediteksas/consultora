-- Motor común PayJoy / ALO. Vigencia aprobada por Óscar: 2026-08-05.
-- Conserva el dominio existente: tipo_establecimiento in('propia','aliado') para políticas.
begin;

do $preflight$
begin
  if to_regclass('public.liquidations') is null
     or to_regclass('public.liquidation_operations') is null
     or to_regclass('public.settlement_policy_versions') is null then
    raise exception 'El Motor de Liquidaciones base no está instalado';
  end if;
end;
$preflight$;

alter table public.liquidation_operations add column if not exists valor_comercial numeric(16,2);
alter table public.liquidation_operations add column if not exists porcentaje_politica numeric(8,6);
alter table public.liquidation_operations add column if not exists policy_version_id uuid references public.settlement_policy_versions(id);
alter table public.liquidation_operations add column if not exists policy_snapshot jsonb;
alter table public.liquidation_operations add column if not exists pago_neto_beneficiario numeric(16,2);
alter table public.liquidation_operations add column if not exists bonos_aplicados numeric(16,2);
alter table public.liquidation_operations add column if not exists utilidad_creditek numeric(16,2);

do $constraints$
declare constraint_name text;
begin
  for constraint_name in
    select c.conname from pg_constraint c
    where c.conrelid='public.settlement_policy_versions'::regclass
      and c.contype='c' and pg_get_constraintdef(c.oid) ilike '%base_field%'
  loop
    execute format('alter table public.settlement_policy_versions drop constraint %I',constraint_name);
  end loop;
  if not exists(select 1 from pg_constraint where conrelid='public.settlement_policy_versions'::regclass and conname='settlement_policy_base_field_check') then
    alter table public.settlement_policy_versions add constraint settlement_policy_base_field_check
      check(base_field in('monto_base','monto_credito','valor_comercial'));
  end if;
end;
$constraints$;

create or replace function public.liquidaciones_bloquear_politica_solapada()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.estado='aprobada' and exists(
    select 1 from public.settlement_policy_versions p
    where p.id<>new.id and p.plataforma=new.plataforma
      and p.tipo_establecimiento=new.tipo_establecimiento and p.estado='aprobada'
      and daterange(p.vigente_desde,coalesce(p.vigente_hasta,'infinity'::date),'[]')
          && daterange(new.vigente_desde,coalesce(new.vigente_hasta,'infinity'::date),'[]')
  ) then raise exception 'politica_solapada'; end if;
  return new;
end; $$;
drop trigger if exists settlement_policy_no_overlap on public.settlement_policy_versions;
create trigger settlement_policy_no_overlap before insert or update on public.settlement_policy_versions
for each row execute function public.liquidaciones_bloquear_politica_solapada();

do $policies$
declare approver uuid;
begin
  select perfil_id into approver from public.aliados_operadores
  where capacidad='aprobador' and activo order by created_at limit 1;
  if approver is null then raise exception 'No existe aprobador verificado para versionar políticas'; end if;

  update public.settlement_policy_versions
  set vigente_hasta=date '2026-08-04'
  where estado='aprobada' and vigente_desde<date '2026-08-05'
    and (vigente_hasta is null or vigente_hasta>=date '2026-08-05')
    and (plataforma,tipo_establecimiento) in (('payjoy','aliado'),('alo','aliado'));

  update public.settlement_policy_versions p set
    porcentaje=seed.porcentaje,base_field='valor_comercial',formula_code='VALOR_COMERCIAL_X_PORCENTAJE_MENOS_INICIAL',
    vigente_hasta=null,estado='aprobada',aprobado_por=approver,aprobado_at=coalesce(p.aprobado_at,now())
  from (values ('payjoy','propia',0.76::numeric),('alo','propia',0.76::numeric),('payjoy','aliado',0.77::numeric),('alo','aliado',0.77::numeric)) seed(plataforma,tipo,porcentaje)
  where p.plataforma=seed.plataforma and p.tipo_establecimiento=seed.tipo and p.vigente_desde=date '2026-08-05';

  insert into public.settlement_policy_versions(version,plataforma,tipo_establecimiento,porcentaje,base_field,formula_code,vigente_desde,estado,creado_por,aprobado_por,aprobado_at)
  select coalesce(max(existing.version),0)+1, seed.plataforma,seed.tipo,seed.porcentaje,'valor_comercial',
    'VALOR_COMERCIAL_X_PORCENTAJE_MENOS_INICIAL',date '2026-08-05','aprobada',approver,approver,now()
  from (values ('payjoy','propia',0.76::numeric),('alo','propia',0.76::numeric),('payjoy','aliado',0.77::numeric),('alo','aliado',0.77::numeric)) seed(plataforma,tipo,porcentaje)
  left join public.settlement_policy_versions existing on existing.plataforma=seed.plataforma and existing.tipo_establecimiento=seed.tipo
  where not exists(select 1 from public.settlement_policy_versions p where p.plataforma=seed.plataforma and p.tipo_establecimiento=seed.tipo and p.vigente_desde=date '2026-08-05')
  group by seed.plataforma,seed.tipo,seed.porcentaje;
end;
$policies$;

create or replace function public.aliados_calcular_liquidacion(p_id uuid)
returns public.liquidations language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v public.liquidations%rowtype;o public.liquidation_operations%rowtype;p public.settlement_policy_versions%rowtype;
 b public.liquidation_beneficiaries%rowtype;a public.beneficiary_bank_accounts%rowtype;c public.liquidation_calculations%rowtype;
 bn public.liquidation_bonuses%rowtype;
 v_count int;v_policy_id uuid;v_comercial numeric;v_pagamos numeric;v_pago numeric;v_bonus numeric;v_util numeric;v_order uuid;
 v_tot_comercial numeric:=0;v_tot_aliados numeric:=0;v_tot_tiendas numeric:=0;v_tot_bonus numeric:=0;v_tot_util numeric:=0;v_util_tiendas numeric:=0;
 v_count_tiendas integer:=0;v_count_aliados integer:=0;v_future boolean;
begin
 if not public.tiene_capacidad_aliados('revisor') then raise exception 'No autorizado para calcular'; end if;
 select * into v from public.liquidations where id=p_id for update;
 if not found then raise exception 'Liquidación no encontrada'; end if;
 if v.frozen_at is not null then raise exception 'Liquidación aprobada inmutable'; end if;
 if v.estado not in('validada','calculada') then raise exception 'La liquidación debe estar validada'; end if;
 delete from public.payment_items where payment_order_id in(select id from public.payment_orders where liquidation_id=p_id and estado='pendiente');
 delete from public.payment_orders where liquidation_id=p_id and estado='pendiente';
 delete from public.liquidation_calculations where liquidation_id=p_id;

 for o in select * from public.liquidation_operations where liquidation_id=p_id order by operation_at,id loop
  if o.operation_at is null then
    insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,o.id,'fecha_operacion_ausente','La operación no tiene fecha para resolver su política') on conflict do nothing;continue;
  end if;
  v_future:=o.operation_at::date>=date '2026-08-05';
  if not o.reconocida or o.tipo_establecimiento='no_reconocido' then
    insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,o.id,'operacion_no_reconocida','La operación o el establecimiento no están reconocidos') on conflict do nothing;continue;
  end if;
  if o.tipo_establecimiento='aliado' and o.ejecutivo_id is null then
    insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,o.id,'aliado_sin_ejecutivo','El aliado no tiene ejecutivo vigente') on conflict do nothing;continue;
  end if;

  if v_future then
    select count(*),min(id::text)::uuid into v_count,v_policy_id from public.settlement_policy_versions
    where plataforma=o.plataforma and tipo_establecimiento=o.tipo_establecimiento and estado='aprobada'
      and vigente_desde<=o.operation_at::date and (vigente_hasta is null or vigente_hasta>=o.operation_at::date);
    if v_count<>1 then
      insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,o.id,case when v_count=0 then 'politica_ausente' else 'politica_ambigua' end,'No existe una política única vigente') on conflict do nothing;continue;
    end if;
    select * into p from public.settlement_policy_versions where id=v_policy_id;
    v_comercial:=coalesce(o.monto_credito,o.monto_base)+o.inicial;
    v_pagamos:=round(v_comercial*p.porcentaje,2);
    v_pago:=round(v_pagamos-o.inicial,2);
    select coalesce(sum(valor),0) into v_bonus from public.liquidation_bonuses where operation_id=o.id and estado='aprobado';
    v_util:=round(v_comercial-v_pago-v_bonus,2);
    if v_pago<0 or v_util<0 then raise exception 'valor_negativo_imposible'; end if;
    update public.liquidation_operations set valor_comercial=v_comercial,porcentaje_politica=p.porcentaje,
      policy_version_id=p.id,policy_snapshot=to_jsonb(p),pagamos=v_pagamos,pago_neto_beneficiario=v_pago,
      pago_neto_tienda=case when tipo_establecimiento='propia' then v_pago else pago_neto_tienda end,
      bonos_aplicados=v_bonus,utilidad_creditek=v_util,
      utilidad_creditek_tienda=case when tipo_establecimiento='propia' then v_util else utilidad_creditek_tienda end,
      snapshot_tienda_at=case when tipo_establecimiento='propia' then now() else snapshot_tienda_at end where id=o.id;
    insert into public.liquidation_calculations(liquidation_id,operation_id,policy_version_id,policy_snapshot,pagamos,pago_aliado,total_bonos,utilidad_creditek,explanation)
    values(p_id,o.id,p.id,to_jsonb(p),v_pagamos,v_pago,v_bonus,v_util,jsonb_build_object('valor_credito',coalesce(o.monto_credito,o.monto_base),'inicial_plataforma',o.inicial,'valor_comercial',v_comercial,'porcentaje',p.porcentaje,'formula',p.formula_code,'accesorios_cantidad',o.accesorios_cantidad,'accesorios_valor',o.accesorios)) returning * into c;
  elsif o.tipo_establecimiento='aliado' then
    select count(*),min(id::text)::uuid into v_count,v_policy_id from public.settlement_policy_versions where plataforma=o.plataforma and tipo_establecimiento='aliado' and estado='aprobada' and vigente_desde<=o.operation_at::date and (vigente_hasta is null or vigente_hasta>=o.operation_at::date);
    if v_count<>1 then insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,o.id,'politica_ausente','No existe una política histórica única vigente') on conflict do nothing;continue;end if;
    select * into p from public.settlement_policy_versions where id=v_policy_id;
    v_comercial:=case p.base_field when 'monto_credito' then o.monto_credito else o.monto_base end;
    v_pagamos:=round(v_comercial*p.porcentaje,2);v_pago:=round(v_pagamos-o.inicial,2);
    select coalesce(sum(valor),0) into v_bonus from public.liquidation_bonuses where operation_id=o.id and estado='aprobado';v_util:=round(v_comercial-v_pago-v_bonus,2);
    insert into public.liquidation_calculations(liquidation_id,operation_id,policy_version_id,policy_snapshot,pagamos,pago_aliado,total_bonos,utilidad_creditek,explanation)
    values(p_id,o.id,p.id,to_jsonb(p),v_pagamos,v_pago,v_bonus,v_util,jsonb_build_object('base_field',p.base_field,'base_liquidable',v_comercial,'formula',p.formula_code)) returning * into c;
  else
    if coalesce(o.pagamos,0)<=0 then insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,o.id,'operacion_tienda_sin_pagamos','La operación histórica requiere el Pagamos congelado') on conflict do nothing;continue;end if;
    v_comercial:=case when o.plataforma='payjoy' then coalesce(o.monto_credito,o.monto_base)-o.inicial_kora else o.monto_base end;
    v_pago:=o.pago_neto_tienda;v_bonus:=0;v_util:=o.utilidad_creditek_tienda;
  end if;

  if o.tipo_establecimiento='propia' and (o.inicial_kora is null or (o.diferencia_inicial<>0 and o.diferencia_revisada_at is null)) then
    insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,o.id,case when o.inicial_kora is null then 'imei_no_resuelto' else 'diferencia_inicial_sin_revisar' end,'Debe resolverse la inicial KORA antes de aprobar') on conflict do nothing;continue;
  end if;
  select * into b from public.liquidation_beneficiaries where tipo=case when o.tipo_establecimiento='aliado' then 'aliado' else 'otro' end and origen_codigo=o.origen_codigo and activo limit 1;
  if not found then insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,o.id,'beneficiario_sin_identificacion','No existe beneficiario de pago') on conflict do nothing;continue;end if;
  select * into a from public.beneficiary_bank_accounts where beneficiary_id=b.id and activo and validada order by validada_at desc limit 1;
  if not found then insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,o.id,'cuenta_bancaria_no_validada','El beneficiario no tiene cuenta validada') on conflict do nothing;continue;end if;
  insert into public.payment_orders(liquidation_id,beneficiary_id,bank_account_id,valor,idempotency_key) values(p_id,b.id,a.id,v_pago,gen_random_uuid()) on conflict(liquidation_id,beneficiary_id) do update set valor=public.payment_orders.valor+excluded.valor returning id into v_order;
  insert into public.payment_items(payment_order_id,operation_id,concepto,valor) values(v_order,o.id,case when o.tipo_establecimiento='aliado' then 'pago_aliado' else 'pago_tienda' end,v_pago);
  v_tot_comercial:=v_tot_comercial+v_comercial;v_tot_bonus:=v_tot_bonus+v_bonus;v_tot_util:=v_tot_util+v_util;
  if o.tipo_establecimiento='aliado' then v_tot_aliados:=v_tot_aliados+v_pago;v_count_aliados:=v_count_aliados+1;else v_tot_tiendas:=v_tot_tiendas+v_pago;v_util_tiendas:=v_util_tiendas+v_util;v_count_tiendas:=v_count_tiendas+1;end if;
 end loop;

 for bn in select * from public.liquidation_bonuses where liquidation_id=p_id and estado='aprobado' loop
  select * into a from public.beneficiary_bank_accounts where beneficiary_id=bn.beneficiary_id and activo and validada order by validada_at desc limit 1;
  if not found then insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,bn.operation_id,'bono_beneficiario_sin_cuenta','El beneficiario del bono no tiene cuenta validada') on conflict do nothing;continue;end if;
  insert into public.payment_orders(liquidation_id,beneficiary_id,bank_account_id,valor,idempotency_key) values(p_id,bn.beneficiary_id,a.id,bn.valor,gen_random_uuid()) on conflict(liquidation_id,beneficiary_id) do update set valor=public.payment_orders.valor+excluded.valor returning id into v_order;
  insert into public.payment_items(payment_order_id,operation_id,bonus_id,concepto,valor) values(v_order,bn.operation_id,bn.id,'bono_'||bn.tipo_bono,bn.valor);
 end loop;
 if exists(select 1 from public.liquidation_incidents where liquidation_id=p_id and estado='abierta' and bloquea_aprobacion) then update public.liquidations set estado='con_novedades',updated_at=now() where id=p_id returning * into v;return v;end if;
 update public.liquidations set estado='calculada',total_operaciones=v_tot_comercial,total_pago_aliados=v_tot_aliados,total_pago_tiendas=v_tot_tiendas,total_bonos=v_tot_bonus,total_utilidad_creditek=v_tot_util,total_utilidad_tiendas=v_util_tiendas,total_pagar=v_tot_aliados+v_tot_tiendas+v_tot_bonus,operaciones_tiendas=v_count_tiendas,operaciones_aliados=v_count_aliados,updated_at=now() where id=p_id returning * into v;
 insert into public.liquidation_domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key) values('liquidation.calculated','liquidation',p_id,jsonb_build_object('liquidation_id',p_id,'platform',v.plataforma),p_id||':calculated') on conflict(idempotency_key) do nothing;
 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),'aliados_liquidacion_calculada','liquidations',p_id,jsonb_build_object('total_pagar',v.total_pagar,'policy_effective_from','2026-08-05'));return v;
end; $$;

create or replace function public.aliados_guardar_pagamos(p_operation_id uuid,p_pagamos numeric)
returns public.liquidation_operations language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.liquidation_operations%rowtype;v_diferencia numeric;v_total_real numeric;v_pago numeric;v_utilidad numeric;
begin
 if not public.tiene_capacidad_aliados('aprobador') then raise exception 'Solo Óscar/aprobador puede modificar Pagamos';end if;
 select * into o from public.liquidation_operations where id=p_operation_id for update;
 if not found or o.tipo_establecimiento<>'propia' then raise exception 'Operación de tienda no encontrada';end if;
 if o.operation_at::date>=date '2026-08-05' then raise exception 'Pagamos se calcula automáticamente por política vigente';end if;
 if p_pagamos is null or p_pagamos<=0 then raise exception 'Pagamos debe ser mayor que cero';end if;
 if exists(select 1 from public.liquidations where id=o.liquidation_id and frozen_at is not null) then raise exception 'Liquidación aprobada inmutable';end if;
 if o.inicial_kora is null or o.costo_equipo is null then raise exception 'Primero resuelva la venta, inicial y costo por IMEI';end if;
 v_diferencia:=case when o.plataforma='payjoy' then o.inicial_kora-o.inicial else o.inicial-o.inicial_kora end;
 v_total_real:=case when o.plataforma='payjoy' then coalesce(o.monto_credito,o.monto_base)-o.inicial_kora else o.monto_base-o.inicial_kora end;
 v_pago:=case when o.plataforma='payjoy' then p_pagamos-o.inicial_kora-v_diferencia else p_pagamos-v_diferencia-o.inicial end;
 v_utilidad:=case when o.plataforma='payjoy' then v_total_real-v_pago else o.monto_base-v_pago end;
 update public.liquidation_operations set pagamos=p_pagamos,diferencia_inicial=v_diferencia,pago_neto_tienda=v_pago,
  utilidad_creditek_tienda=v_utilidad,utilidad_tienda=p_pagamos-o.costo_equipo,snapshot_tienda_at=now() where id=o.id returning * into o;
 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),'aliados_pagamos_actualizado','liquidations',o.liquidation_id,jsonb_build_object('operation_id',o.id,'pagamos',p_pagamos));return o;
end; $$;

insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
select perfil_id,'liquidaciones_politicas_v2_activadas','settlement_policy_versions',null,
  jsonb_build_object('vigente_desde','2026-08-05','payjoy_retail',0.76,'alo_retail',0.76,'payjoy_aliados',0.77,'alo_aliados',0.77)
from public.aliados_operadores where capacidad='aprobador' and activo
  and not exists(select 1 from public.audit_log where accion='liquidaciones_politicas_v2_activadas'
    and detalle->>'vigente_desde'='2026-08-05')
order by created_at limit 1;
-- La auditoría de activación también es idempotente.

commit;
