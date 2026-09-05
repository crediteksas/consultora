-- Flujo acordado por Oscar: PVP recibido determina utilidad; Pagamos pactado
-- y bonos no dependen de esa diferencia. Sin aprobación ni pago automático.
create schema krediya_private;
revoke all on schema krediya_private from public,anon;
grant usage on schema krediya_private to authenticated;
alter table public.krediya_price_rules add column if not exists codigo text;
alter table public.payment_orders alter column bank_account_id drop not null;
alter table public.payment_orders add constraint cuenta_pendiente_solo_krediya
 check(bank_account_id is not null or (platform_snapshot='krediya' and estado in ('pendiente','programado','anulado','rechazado')));
create function krediya_private.exigir_cuenta_al_pagar()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.estado='pagado' and new.platform_snapshot='krediya' and not exists(
  select 1 from public.beneficiary_bank_accounts b where b.id=new.bank_account_id
  and b.beneficiary_id=new.beneficiary_id and b.activo and b.validada) then
  raise exception 'Registra y valida la cuenta bancaria antes de pagar';
 end if;
 return new;
end $$;
create trigger zz_krediya_cuenta_al_pagar before insert or update of estado,bank_account_id on public.payment_orders
 for each row execute function krediya_private.exigir_cuenta_al_pagar();
revoke all on function krediya_private.exigir_cuenta_al_pagar() from public,anon,authenticated;

-- El editor es el único punto de escritura: vigencia y auditoría en servidor.
revoke insert,update,delete on public.krediya_price_rules from authenticated;
create function krediya_private.guardar_tarifa(
 p_id uuid,p_version timestamptz,p_pvp numeric,p_pagamos numeric,p_desde date,p_motivo text)
returns public.krediya_price_rules language plpgsql security definer set search_path='' as $$
declare r public.krediya_price_rules%rowtype; n public.krediya_price_rules%rowtype;
begin
 if auth.uid() is null or not public.tiene_capacidad_aliados('revisor') then raise exception 'No autorizado'; end if;
 if p_pvp is null or p_pagamos is null or p_pvp<=0 or p_pagamos<=0
  or p_pvp>=100000000000000 or p_pagamos>=100000000000000
  or p_desde is null or length(btrim(coalesce(p_motivo,'')))<5 then raise exception 'Completa PVP, Pagamos, vigencia y motivo'; end if;
 select * into r from public.krediya_price_rules where id=p_id for update;
 if not found or not r.activo or r.vigente_hasta is not null or r.updated_at is distinct from p_version then
  raise exception 'La tarifa cambió. Actualiza antes de editar'; end if;
 if p_desde<r.vigente_desde then raise exception 'La nueva vigencia no puede comenzar antes de la tarifa seleccionada'; end if;
 if p_desde=r.vigente_desde then
  update public.krediya_price_rules set activo=false,actualizado_por=auth.uid(),updated_at=clock_timestamp() where id=r.id;
 else
  update public.krediya_price_rules set vigente_hasta=p_desde-1,actualizado_por=auth.uid(),updated_at=clock_timestamp() where id=r.id;
 end if;
 insert into public.krediya_price_rules(referencia_clave,referencia,codigo,precio_venta,pagamos,vigente_desde,creado_por,actualizado_por)
 values(r.referencia_clave,r.referencia,r.codigo,round(p_pvp,2),round(p_pagamos,2),p_desde,auth.uid(),auth.uid()) returning * into n;
 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
 values(auth.uid(),'krediya_tarifa_editada','krediya_price_rules',n.id::text,
 jsonb_build_object('anterior',to_jsonb(r),'nuevo',to_jsonb(n),'motivo',btrim(p_motivo)));
 return n;
end $$;
revoke all on function krediya_private.guardar_tarifa(uuid,timestamptz,numeric,numeric,date,text) from public,anon;
grant execute on function krediya_private.guardar_tarifa(uuid,timestamptz,numeric,numeric,date,text) to authenticated;
create function public.krediya_guardar_tarifa(p_id uuid,p_version timestamptz,p_pvp numeric,p_pagamos numeric,p_desde date,p_motivo text)
returns public.krediya_price_rules language sql security invoker set search_path='' as $$
 select krediya_private.guardar_tarifa(p_id,p_version,p_pvp,p_pagamos,p_desde,p_motivo)
$$;
revoke all on function public.krediya_guardar_tarifa(uuid,timestamptz,numeric,numeric,date,text) from public,anon;
grant execute on function public.krediya_guardar_tarifa(uuid,timestamptz,numeric,numeric,date,text) to authenticated;

-- Seguimiento independiente de las novedades que sí impiden liquidar.
create table public.krediya_diferencias (
 operation_id uuid primary key references public.liquidation_operations(id),
 liquidation_id uuid not null references public.liquidations(id),
 contexto jsonb not null,
 estado text not null default 'pendiente' check(estado in ('pendiente','en_gestion','resuelta')),
 updated_at timestamptz not null default now()
);
create index on public.krediya_diferencias(liquidation_id);
create table public.krediya_diferencias_gestiones (
 id uuid primary key default gen_random_uuid(),
 operation_id uuid not null references public.krediya_diferencias(operation_id),
 estado text not null check(estado in ('en_gestion','resuelta')),
 comentario text not null check(length(btrim(comentario)) between 5 and 4000),
 soporte text,
 autor_id uuid not null references public.perfiles(id),
 autor_nombre text not null,
 created_at timestamptz not null default now(),
 check(estado<>'resuelta' or length(btrim(coalesce(soporte,'')))>0)
);
create index on public.krediya_diferencias_gestiones(operation_id,created_at);
create index on public.krediya_diferencias_gestiones(autor_id);
alter table public.krediya_diferencias enable row level security;
alter table public.krediya_diferencias_gestiones enable row level security;
revoke all on public.krediya_diferencias,public.krediya_diferencias_gestiones from public,anon,authenticated;
grant select on public.krediya_diferencias,public.krediya_diferencias_gestiones to authenticated;
create policy diferencias_lectura on public.krediya_diferencias for select to authenticated
 using((select public.tiene_capacidad_aliados('revisor')));
create policy diferencias_gestiones_lectura on public.krediya_diferencias_gestiones for select to authenticated
 using((select public.tiene_capacidad_aliados('revisor')));

create function krediya_private.gestionar_diferencia(p_operation_id uuid,p_estado text,p_comentario text,p_soporte text default null)
returns void language plpgsql security definer set search_path='' as $$
declare nombre text;
begin
 if auth.uid() is null or not public.tiene_capacidad_aliados('revisor') then raise exception 'No autorizado'; end if;
 perform 1 from public.krediya_diferencias where operation_id=p_operation_id for update;
 if not found then raise exception 'Diferencia no encontrada'; end if;
 select p.nombre into nombre from public.perfiles p where p.id=auth.uid() and p.activo;
 insert into public.krediya_diferencias_gestiones(operation_id,estado,comentario,soporte,autor_id,autor_nombre)
 values(p_operation_id,p_estado,btrim(p_comentario),nullif(btrim(p_soporte),''),auth.uid(),nombre);
 update public.krediya_diferencias set estado=p_estado,updated_at=clock_timestamp() where operation_id=p_operation_id;
 -- No modifica el resultado ni el estado de la liquidación.
end $$;
revoke all on function krediya_private.gestionar_diferencia(uuid,text,text,text) from public,anon;
grant execute on function krediya_private.gestionar_diferencia(uuid,text,text,text) to authenticated;
create function public.krediya_gestionar_diferencia(p_operation_id uuid,p_estado text,p_comentario text,p_soporte text default null)
returns void language sql security invoker set search_path='' as $$select krediya_private.gestionar_diferencia(p_operation_id,p_estado,p_comentario,p_soporte)$$;
revoke all on function public.krediya_gestionar_diferencia(uuid,text,text,text) from public,anon;
grant execute on function public.krediya_gestionar_diferencia(uuid,text,text,text) to authenticated;

-- Una pérdida real es un resultado, no un error de importación. Se conserva
-- el control anterior para todos los motores distintos de Krediya v2.
alter table public.liquidation_calculations drop constraint liquidation_calculations_check;
alter table public.liquidation_calculations add constraint liquidation_calculations_check
 check(pagamos>=0 and pago_aliado>=0 and total_bonos>=0 and
 (utilidad_creditek>=0 or coalesce(policy_snapshot->>'motor','')='krediya_v2'));
-- V2 conserva las reglas aplicadas en su snapshot; no inventa una política
-- porcentual de PayJoy para satisfacer una FK del motor anterior.
alter table public.liquidation_calculations alter column policy_version_id drop not null;
alter table public.liquidation_calculations add constraint calculo_politica_o_krediya_v2
 check(policy_version_id is not null or coalesce(policy_snapshot->>'motor','')='krediya_v2');

create function krediya_private.calcular_y_enviar_aprobacion(p_id uuid)
returns public.liquidations language plpgsql security definer set search_path='' as $$
declare l public.liquidations%rowtype; o public.liquidation_operations%rowtype;
 c jsonb; snap jsonb; br record; bn record; b uuid; bank uuid; po uuid;
 precio numeric; pactado numeric; pago numeric; bonos numeric; bruta numeric; provision numeric; neta numeric; financiero numeric;
begin
 if auth.uid() is null or not public.tiene_capacidad_aliados('revisor') then raise exception 'No autorizado'; end if;
 select * into l from public.liquidations where id=p_id and plataforma='krediya' for update;
 if not found or l.frozen_at is not null or l.estado not in ('importada','validada','con_novedades','calculada') then
  raise exception 'Liquidación no editable'; end if;
 if exists(select 1 from public.payment_orders where liquidation_id=p_id and estado<>'pendiente') then
  raise exception 'El lote tiene órdenes en gestión; no se recalcula'; end if;
 if not exists(select 1 from public.liquidation_operations where liquidation_id=p_id and reconocida) then raise exception 'No hay operaciones reconocidas'; end if;
 if exists(select 1 from public.liquidation_operations where liquidation_id=p_id and reconocida and nullif(external_id,'') is not null group by external_id having count(*)>1) then
  raise exception 'Hay créditos duplicados en el lote'; end if;
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
  if o.tipo_establecimiento='aliado' and o.ejecutivo_id is null then raise exception 'Falta ejecutivo para %',o.establishment_name; end if;
  if o.tipo_establecimiento='aliado' and not exists(select 1 from public.ejecutivos e join public.liquidation_beneficiaries b
    on b.ejecutivo_id=e.id and b.tipo='ejecutivo' and b.activo where e.id=o.ejecutivo_id and e.activo and e.esquema_comision is not null) then
   raise exception 'Falta regla o beneficiario del ejecutivo para %',o.establishment_name; end if;
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
  snap:=c||jsonb_build_object('motor','krediya_v2','pvp_liquidado',precio,'pagamos',pactado,'bonos',bonos,'utilidad_bruta',bruta,
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
   select id into b from public.liquidation_beneficiaries where tipo='aliado' and origen_codigo=o.origen_codigo and activo order by created_at desc limit 1;
   if b is null then raise exception 'Falta identificar al beneficiario de %',o.establishment_name; end if;
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
  total_pagar=(select coalesce(sum(valor),0) from public.payment_orders where liquidation_id=p_id),
  operaciones_aliados=(select count(*) from public.liquidation_operations where liquidation_id=p_id and reconocida and tipo_establecimiento='aliado'),
  operaciones_tiendas=(select count(*) from public.liquidation_operations where liquidation_id=p_id and reconocida and tipo_establecimiento='propia'),updated_at=now()
 where id=p_id;
 -- El clic explícito «Calcular y enviar a aprobación» deja revisión auditada.
 l:=public.aliados_cambiar_estado(p_id,'revisada','Cálculo Krediya v2 enviado a aprobación. Diferencias de PVP en seguimiento independiente.');
 return l;
end $$;
revoke all on function krediya_private.calcular_y_enviar_aprobacion(uuid) from public,anon;
grant execute on function krediya_private.calcular_y_enviar_aprobacion(uuid) to authenticated;
create function public.krediya_calcular_y_enviar_aprobacion(p_id uuid)
returns public.liquidations language sql security invoker set search_path='' as $$select krediya_private.calcular_y_enviar_aprobacion(p_id)$$;
revoke all on function public.krediya_calcular_y_enviar_aprobacion(uuid) from public,anon;
grant execute on function public.krediya_calcular_y_enviar_aprobacion(uuid) to authenticated;
create or replace function public.aliados_cambiar_estado(p_id uuid, p_estado text, p_comentario text default null)
returns public.liquidations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v public.liquidations%rowtype;
  v_anterior text;
  v_event text;
  v_pago_bancario_esperado numeric;
  v_pago_bancario_detalle numeric;
begin
  select * into v from public.liquidations where id=p_id for update;
  if not found then raise exception 'Liquidación no encontrada'; end if;
  v_anterior=v.estado;

  if p_estado='validada' then
    if not public.tiene_capacidad_aliados('revisor') then raise exception 'Solo Maite/revisor puede validar'; end if;
    if v.estado not in('importada','con_novedades') then raise exception 'Transición inválida'; end if;
    if exists(select 1 from public.liquidation_incidents where liquidation_id=p_id and bloquea_aprobacion and estado='abierta') then raise exception 'Resuelva las novedades antes de validar'; end if;
    update public.liquidations set estado='validada',updated_at=now() where id=p_id returning * into v;
    v_event='liquidation.validated';
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
$$;

revoke all on function public.aliados_cambiar_estado(uuid,text,text) from public, anon;
grant execute on function public.aliados_cambiar_estado(uuid,text,text) to authenticated;
-- El arranque histórico no puede marcar como pagado un cálculo nuevo de Krediya.
-- Se preserva su comportamiento para las importaciones históricas de otros motores.
do $$
declare d text; n text;
begin
 d:=pg_get_functiondef('public.clasificar_pago_historico_por_corte()'::regprocedure);
 n:=replace(d,'if new.cutoff_snapshot < date ''2026-09-01'' then',
 'if new.cutoff_snapshot < date ''2026-09-01'' and not exists (
   select 1 from public.liquidation_calculations c where c.liquidation_id=new.liquidation_id
   and c.policy_snapshot->>''motor''=''krediya_v2'') then');
 if n=d then raise exception 'Cambió el clasificador histórico; revisar antes de migrar'; end if;
 execute n;
end $$;

-- Tesorería usa los importes congelados de Krediya, nunca el porcentaje de PayJoy.
do $$
declare d text; n text;
begin
 d:=pg_get_functiondef('public.tesoreria_generar_destinos_liquidacion(uuid)'::regprocedure);
 n:=replace(d,'where liquidation_id=l.id and operation_at::date>=date ''2026-08-05'' order by id',
  'where liquidation_id=l.id and operation_at::date>=date ''2026-08-05'' and (l.plataforma<>''krediya'' or reconocida) order by id');
 n:=replace(n,'o.porcentaje_politica is null','(o.porcentaje_politica is null and coalesce(o.policy_snapshot->''krediya_v2''->>''motor'','''')<>''krediya_v2'')');
 n:=replace(n,'right_value:=round(op_base*o.porcentaje_politica,2);',
  'if l.plataforma=''krediya'' and o.policy_snapshot->''krediya_v2''->>''motor''=''krediya_v2'' then
    right_value:=(o.policy_snapshot->''krediya_v2''->>''pagamos'')::numeric;
   else right_value:=round(op_base*o.porcentaje_politica,2); end if;');
 n:=replace(n,'commission_value:=round(op_base-right_value-op_bonus,2);',
  'if l.plataforma=''krediya'' and o.policy_snapshot->''krediya_v2''->>''motor''=''krediya_v2'' then
    commission_value:=(o.policy_snapshot->''krediya_v2''->>''utilidad_bruta'')::numeric;
   else commission_value:=round(op_base-right_value-op_bonus,2); end if;');
 n:=replace(n,'o.valor_comercial,o.inicial,o.porcentaje_politica,comp_value',
  'o.valor_comercial,o.inicial,coalesce(o.porcentaje_politica,right_value/nullif(op_base,0)),comp_value');
 n:=replace(n,'case when l.plataforma=''alo'' then ''ALO Credit'' else ''PayJoy'' end',
  'case when l.plataforma=''alo'' then ''ALO Credit'' when l.plataforma=''krediya'' then ''Krediya'' else ''PayJoy'' end');
 if n=d or position('right_value:=(o.policy_snapshot' in n)=0 or position('commission_value:=(o.policy_snapshot' in n)=0 then
  raise exception 'Cambió el generador de Tesorería; revisar antes de migrar'; end if;
 execute n;
end $$;
-- Aplicar DESPUÉS del bloque que adapta tesoreria_generar_destinos_liquidacion
-- a los snapshots Krediya v2. No recalcula ni toca lotes existentes.
--
-- Saldo monetario operativo: PVP recibido - PAGAMOS, ANTES de bonos y gastos.
-- Los bonos se descuentan una sola vez al registrar su pago por el RPC vigente.
-- El gasto financiero real se registra por Tesorería con su soporte; la
-- provisión pertenece al resultado calculado, no es una transferencia bancaria.
-- Si una pérdida consume un saldo inexistente se conserva el control actual de
-- saldo insuficiente. No se inventa financiación ni se permiten saldos negativos.
do $krediya_saldo_monetario$
declare
  definition text;
  patched text;
  target record;
begin
  definition := pg_get_functiondef('public.tesoreria_generar_destinos_liquidacion(uuid)'::regprocedure);
  patched := definition;
  for target in select * from (values
    (
      $old$commission_value:=(o.policy_snapshot->'krediya_v2'->>'utilidad_bruta')::numeric;$old$,
      $new$commission_value:=round(
      (o.policy_snapshot->'krediya_v2'->>'pvp_liquidado')::numeric
      - (o.policy_snapshot->'krediya_v2'->>'pagamos')::numeric, 2);$new$
    ),
    (
      $old$if commission_value>0 then$old$,
      $new$if commission_value>0 or (
      l.plataforma='krediya'
      and o.policy_snapshot->'krediya_v2'->>'motor'='krediya_v2'
      and commission_value<0
    ) then$new$
    ),
    (
      $old$balance_data:=public.tesoreria_aplicar_saldo('tercerizacion','credit',commission_value,'commission-operation:'||o.id);$old$,
      $new$if commission_value<0 then
      select balance into account_before from public.treasury_unit_balances
        where unit='tercerizacion' for update;
      if account_before is null or account_before<abs(commission_value) then
        raise exception 'Saldo insuficiente para cubrir el margen negativo de Krediya. Disponible: %, pérdida: %',
          coalesce(account_before,0), abs(commission_value);
      end if;
    end if;
    balance_data:=public.tesoreria_aplicar_saldo(
      'tercerizacion', case when commission_value>0 then 'credit' else 'debit' end,
      abs(commission_value), 'commission-operation:'||o.id);$new$
    ),
    (
      $old$values('tercerizacion','credit',case when o.tipo_establecimiento='propia' then 'comision_retail' else 'comision_aliado' end,$old$,
      $new$values('tercerizacion',case when commission_value>0 then 'credit' else 'debit' end,
      case when o.tipo_establecimiento='propia' then 'comision_retail' else 'comision_aliado' end,$new$
    ),
    (
      $old$'Comisión de Tercerización — '||case when o.tipo_establecimiento='propia' then 'Retail' else 'Aliados' end$old$,
      $new$(case
        when l.plataforma='krediya' and o.policy_snapshot->'krediya_v2'->>'motor'='krediya_v2'
        then case when commission_value<0
          then 'Pérdida de margen Krediya antes de bonos y gastos — '
          else 'Margen Krediya antes de bonos y gastos — ' end
        else 'Comisión de Tercerización — '
      end)||case when o.tipo_establecimiento='propia' then 'Retail' else 'Aliados' end$new$
    ),
    (
      $old$commission_value,coalesce(l.fecha_corte,current_date),l.id,(balance_data->>'before')::numeric,$old$,
      $new$abs(commission_value),coalesce(l.fecha_corte,current_date),l.id,(balance_data->>'before')::numeric,$new$
    ),
    (
      $old$and (l.plataforma<>'krediya' or reconocida) order by id loop$old$,
      $new$and (l.plataforma<>'krediya' or reconocida)
    order by case when l.plataforma='krediya'
      and policy_snapshot->'krediya_v2'->>'motor'='krediya_v2'
      and (policy_snapshot->'krediya_v2'->>'pvp_liquidado')::numeric
        < (policy_snapshot->'krediya_v2'->>'pagamos')::numeric
      then 1 else 0 end, id loop$new$
    )
  ) as replacements(before_text, after_text)
  loop
    if position(target.before_text in patched)=0 then
      raise exception 'Cambió Tesorería; revisar fragmento Krediya antes de aplicar: %', target.before_text;
    end if;
    patched := replace(patched, target.before_text, target.after_text);
  end loop;
  if patched=definition then
    raise exception 'No se pudo preparar la separación de saldo y utilidad Krediya';
  end if;
  execute patched;
end $krediya_saldo_monetario$;


-- Todos los clientes Krediya llegan al mismo motor; los accesos antiguos no
-- pueden volver a generar confirmaciones por fila o cálculo por porcentaje.
create or replace function public.aliados_calcular_liquidacion_krediya(p_id uuid)
returns public.liquidations language sql security invoker set search_path='' as $$
 select krediya_private.calcular_y_enviar_aprobacion(p_id)
$$;
create or replace function public.aliados_calcular_liquidacion_krediya_original_v1(p_id uuid)
returns public.liquidations language sql security invoker set search_path='' as $$
 select krediya_private.calcular_y_enviar_aprobacion(p_id)
$$;
create or replace function public.aliados_calcular_liquidacion_krediya_archivo_manual(p_id uuid)
returns public.liquidations language sql security invoker set search_path='' as $$
 select krediya_private.calcular_y_enviar_aprobacion(p_id)
$$;
revoke all on function public.aliados_calcular_liquidacion_krediya(uuid),
 public.aliados_calcular_liquidacion_krediya_original_v1(uuid),
 public.aliados_calcular_liquidacion_krediya_archivo_manual(uuid) from public,anon;
grant execute on function public.aliados_calcular_liquidacion_krediya(uuid),
 public.aliados_calcular_liquidacion_krediya_original_v1(uuid),
 public.aliados_calcular_liquidacion_krediya_archivo_manual(uuid) to authenticated;
do $$
declare d text; n text;
begin
 d:=pg_get_functiondef('public.aliados_calcular_liquidacion(uuid)'::regprocedure);
 n:=replace(d,'if not found then raise exception ''Liquidación no encontrada''; end if;',
 'if not found then raise exception ''Liquidación no encontrada''; end if;
 if v.plataforma=''krediya'' then return krediya_private.calcular_y_enviar_aprobacion(p_id); end if;');
 if n=d then raise exception 'Cambió el motor general; revisar el acceso Krediya antes de migrar'; end if;
 execute n;
end $$;
notify pgrst,'reload schema';
