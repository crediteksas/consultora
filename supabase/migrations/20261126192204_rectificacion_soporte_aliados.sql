-- Draft: conserva el comprobante original y corrige el libro mediante un reverso.
-- El procedimiento debe ejecutarse únicamente después de una revisión de Gerencia.
create table kora_private.rectificaciones_soporte_aliados (
  id uuid primary key default gen_random_uuid(),
  payment_order_id uuid not null unique references public.payment_orders(id),
  movimiento_original uuid not null unique references public.banco_creditek_movimientos(id),
  movimiento_reverso uuid not null unique references public.banco_creditek_movimientos(id),
  snapshot_orden jsonb not null,
  snapshot_cartera jsonb not null,
  eventos_previos jsonb not null,
  autorizado_por uuid not null references public.perfiles(id),
  motivo text not null check(length(trim(motivo)) >= 20),
  created_at timestamptz not null default now()
);
alter table kora_private.rectificaciones_soporte_aliados enable row level security;
revoke all on kora_private.rectificaciones_soporte_aliados from public,anon,authenticated,service_role;

-- Extender las dos restricciones sin debilitar las reglas preexistentes.
do $migration$
declare n text; original text; nuevo text;
begin
 foreach n in array array['banco_creditek_movimientos_tipo_check','banco_creditek_movimientos_check'] loop
  select pg_get_constraintdef(oid) into original from pg_constraint
   where conrelid='public.banco_creditek_movimientos'::regclass and conname=n and contype='c';
  if original is null or left(original,7)<>'CHECK (' or right(original,1)<>')' then
   raise exception 'Restricción bancaria desconocida: %',n;
  end if;
  nuevo := 'CHECK (('||substr(original,8,length(original)-8)||') OR '||
   case when n='banco_creditek_movimientos_tipo_check' then
    '(tipo = ''reverso_pago_aliado'')'
   else
    '(tipo = ''reverso_pago_aliado'' and solicitud_id is null and fuente_tabla = ''banco_creditek_movimientos'' and fuente_id is not null and monto > 0 and saldo_despues = saldo_antes + monto)'
   end||')';
  execute format('alter table public.banco_creditek_movimientos drop constraint %I',n);
  execute format('alter table public.banco_creditek_movimientos add constraint %I %s',n,nuevo);
 end loop;
end $migration$;

create or replace function kora_private.banco_creditek_pago_trigger()
returns trigger language plpgsql security definer set search_path='' as $function$
declare v_tipo text; v_rectificacion uuid;
begin
 if new.estado in ('pagado','conciliado') and new.fecha_pagada is not null
   and new.authorized_by is not null and new.soporte_path is not null
   and not coalesce(new.historico_inicial,false)
   and (tg_op='INSERT' or old.fecha_pagada is null) then
  if regexp_replace(coalesce(new.bank_snapshot->>'account_number',''),'[^0-9]','','g')='87600004006' then return new; end if;
  v_tipo:=case when new.payment_kind='ejecutivo' then 'pago_ejecutivo' else 'pago_aliado' end;
  select id into v_rectificacion from kora_private.rectificaciones_soporte_aliados where payment_order_id=new.id;
  perform kora_private.banco_creditek_asentar(v_tipo,new.valor,
   case when v_rectificacion is null then 'payment_orders' else 'payment_orders_reintento' end,
   new.id,new.fecha_pagada,coalesce(new.concept,'Orden de pago'),new.soporte_path,
   coalesce(new.paid_by,new.authorized_by));
 end if;
 return new;
end $function$;

-- Uso administrativo restringido, fuera de la API pública. Nunca ejecuta un giro.
create function kora_private.rectificar_soporte_aliado(p_pago uuid,p_movimiento uuid,p_actor uuid,p_motivo text,p_valor numeric,p_soporte text)
returns jsonb language plpgsql security invoker set search_path='' as $function$
declare p public.payment_orders%rowtype; l public.liquidations%rowtype;
 m public.banco_creditek_movimientos%rowtype; c public.banco_creditek_cuentas%rowtype;
 v_cartera jsonb; v_eventos jsonb; v_reverso uuid; v_rectificacion uuid;
begin
 if length(trim(coalesce(p_motivo,'')))<20 then raise exception 'Indica el motivo de la rectificación'; end if;
 if not exists(select 1 from public.perfiles where id=p_actor and activo and rol='gerencia') then raise exception 'Se requiere confirmación de Gerencia'; end if;
 select * into p from public.payment_orders where id=p_pago for update;
 if not found then raise exception 'Orden inexistente'; end if;
 if exists(select 1 from kora_private.rectificaciones_soporte_aliados where payment_order_id=p_pago) then raise exception 'Esta orden ya fue rectificada'; end if;
 select * into l from public.liquidations where id=p.liquidation_id for update;
 if p.valor is distinct from p_valor or p.soporte_path is distinct from p_soporte or p.estado<>'conciliado' or p.payment_kind<>'aliado' or p.authorized_by is null or p.authorized_at is null or p.fecha_pagada is null or nullif(p.soporte_path,'') is null or l.frozen_at is null then
  raise exception 'La orden ya cambió o no corresponde al pago conciliado esperado'; end if;
 select * into m from public.banco_creditek_movimientos where id=p_movimiento for update;
 if not found or m.tipo<>'pago_aliado' or m.fuente_tabla<>'payment_orders' or m.fuente_id<>p.id or m.monto<>p.valor or m.soporte_path<>p.soporte_path then
  raise exception 'El movimiento bancario no corresponde exactamente a la orden'; end if;
 select * into c from public.banco_creditek_cuentas where id=m.cuenta_id for update;
 if not found or c.saldo_actual is null or m.ocurrido_at is null or m.ocurrido_at<=coalesce(c.fecha_corte_at,c.fecha_corte::timestamptz) then raise exception 'Saldo o corte bancario requiere revisión'; end if;
 if exists(select 1 from public.banco_creditek_movimientos where fuente_tabla='banco_creditek_movimientos' and fuente_id=m.id) then raise exception 'El movimiento ya tiene reverso'; end if;
 if exists(select 1 from public.treasury_movements where payment_order_id=p.id) then raise exception 'La orden tiene otro asiento de Tesorería; requiere revisión'; end if;
 perform 1 from public.credit_portfolio_obligations where payment_order_id=p.id for update;
 if exists(select 1 from public.credit_portfolio_obligations o where o.payment_order_id=p.id and
  (o.outstanding_amount is distinct from o.original_amount or exists(select 1 from public.credit_repayments r where r.obligation_id=o.id) or exists(select 1 from public.credit_collection_events e where e.obligation_id=o.id))) then
  raise exception 'La cartera tiene movimientos posteriores; requiere revisión'; end if;
 -- Evita que el emisor publique un evento entre la comprobación y el archivo.
 perform 1 from public.liquidation_domain_events where aggregate_id=p.id and event_type in ('treasury.ally_payment_completed','payment.completed') for update;
 if exists(select 1 from public.liquidation_domain_events where aggregate_id=p.id and event_type in ('treasury.ally_payment_completed','payment.completed') and published_at is not null) then
  raise exception 'El pago fue comunicado a otro proceso; requiere revisión'; end if;
 select coalesce(jsonb_agg(to_jsonb(o)),'[]') into v_cartera from public.credit_portfolio_obligations o where o.payment_order_id=p.id;
 select coalesce(jsonb_agg(to_jsonb(e)),'[]') into v_eventos from public.liquidation_domain_events e where e.aggregate_id=p.id and e.event_type in ('treasury.ally_payment_completed','payment.completed');
 insert into public.banco_creditek_movimientos(cuenta_id,tipo,monto,saldo_antes,saldo_despues,fecha,referencia,soporte_path,registrado_por,fuente_tabla,fuente_id,ocurrido_at)
 values(c.id,'reverso_pago_aliado',m.monto,c.saldo_actual,c.saldo_actual+m.monto,(now() at time zone 'America/Bogota')::date,
  'Rectificación de soporte equivocado · orden '||p.id::text,p.soporte_path,p_actor,'banco_creditek_movimientos',m.id,now()) returning id into v_reverso;
 update public.banco_creditek_cuentas set saldo_actual=c.saldo_actual+m.monto where id=c.id;
 insert into kora_private.rectificaciones_soporte_aliados(payment_order_id,movimiento_original,movimiento_reverso,snapshot_orden,snapshot_cartera,eventos_previos,autorizado_por,motivo)
 values(p.id,m.id,v_reverso,to_jsonb(p),v_cartera,v_eventos,p_actor,p_motivo) returning id into v_rectificacion;
 delete from public.liquidation_domain_events where aggregate_id=p.id and event_type in ('treasury.ally_payment_completed','payment.completed') and published_at is null;
 update public.credit_portfolio_obligations set ally_paid_at=null,updated_at=now() where payment_order_id=p.id;
 update public.payment_orders set estado='programado',fecha_pagada=null,paid_by=null,soporte_path=null,updated_at=now() where id=p.id;
 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(null,'rectificacion_soporte_pago_aliado','payment_orders',p.id::text,
  jsonb_build_object('rectificacion',v_rectificacion,'movimiento_original',m.id,'movimiento_reverso',v_reverso,'soporte_original',p.soporte_path,'autorizado_por',p_actor,'motivo',p_motivo,'sin_transferencia',true));
 return jsonb_build_object('ok',true,'payment_id',p.id,'rectificacion_id',v_rectificacion,'reverso_id',v_reverso,'saldo_anterior',c.saldo_actual,'saldo_nuevo',c.saldo_actual+m.monto);
end $function$;
revoke all on function kora_private.rectificar_soporte_aliado(uuid,uuid,uuid,text,numeric,text) from public,anon,authenticated,service_role;
