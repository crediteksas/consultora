-- Una aprobación del lote; no registra pagos ni modifica cuentas al instalar.
create function kora_private.pago_con_autorizacion_lote(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.payment_orders p join public.liquidations l on l.id=p.liquidation_id
 join public.aliados_operadores a on a.perfil_id=coalesce(l.approved_by,p.authorized_by)
 join public.perfiles u on u.id=a.perfil_id
 where p.id=p_id and a.activo and a.capacidad='aprobador' and u.activo and u.rol='gerencia'
 and ((l.approved_at is not null and l.frozen_at is not null and l.approved_by is not null
       and l.estado in ('aprobada','programada','pagada','conciliada','cerrada'))
   or (l.estado='programada' and l.approved_at is null and p.estado='programado'
       and p.authorized_by is not null and p.authorized_at is not null)));
$$;
revoke all on function kora_private.pago_con_autorizacion_lote(uuid) from public,anon,authenticated;

create function kora_private.preparar_pago_autorizado_por_lote(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare p public.payment_orders%rowtype;l public.liquidations%rowtype;
begin
 if auth.uid() is null or not coalesce(public.tiene_capacidad_aliados('revisor'),false) then raise exception 'No autorizado'; end if;
 select * into p from public.payment_orders where id=p_id for update;
 if not found then raise exception 'Orden no encontrada'; end if;
 if p.estado not in ('pendiente','programado') or p.historico_inicial then return; end if;
 if not kora_private.pago_con_autorizacion_lote(p_id) then raise exception 'Falta aprobación del lote'; end if;
 if p.valor<=0 or exists(select 1 from unnest(array['bank','account_type','account_number','holder','holder_identification']) k where nullif(btrim(p.bank_snapshot->>k),'') is null) then raise exception 'Completa cuenta y valor en Tesorería'; end if;
 select * into l from public.liquidations where id=p.liquidation_id;
 if p.estado='pendiente' or p.authorized_by is null or p.authorized_at is null then
  if l.approved_at is null or l.approved_by is null then raise exception 'Falta aprobación del lote'; end if;
  update public.payment_orders set estado='programado',
   authorized_by=coalesce(authorized_by,l.approved_by),authorized_at=coalesce(authorized_at,l.approved_at),
   fecha_programada=coalesce(fecha_programada,(now() at time zone 'America/Bogota')::date),updated_at=now() where id=p_id;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
   values(auth.uid(),'autorizacion_heredada_del_lote','payment_orders',p_id::text,
    jsonb_build_object('liquidation_id',l.id,'approved_by',l.approved_by,'approved_at',l.approved_at,'sin_pago',true));
 end if;
end;$$;
revoke all on function kora_private.preparar_pago_autorizado_por_lote(uuid) from public,anon,authenticated;

do $migration$
declare body text;previous text;
begin
 body:=pg_get_functiondef('public.tesoreria_cerrar_pagos_con_soporte(uuid[],text)'::regprocedure);previous:=body;
 body:=replace(body,'  select * into v_first from public.payment_orders where id=p_ids[1];',
 '  for v_id in select id from public.payment_orders where id=any(p_ids) order by id loop
    perform kora_private.preparar_pago_autorizado_por_lote(v_id);
  end loop;
  select * into v_first from public.payment_orders where id=p_ids[1];');
 if body=previous then raise exception 'Cambió preparación de soporte'; end if;previous:=body;
 body:=replace(body,'not exists(select 1 from public.liquidations l where l.id=v.liquidation_id and l.frozen_at is not null and l.approved_at is not null)',
 'not kora_private.pago_con_autorizacion_lote(v.id)');
 if body=previous then raise exception 'Cambió validación de soporte'; end if;
 execute body;
 body:=pg_get_functiondef('public.aliados_exigir_liquidacion_aprobada_para_pago()'::regprocedure);previous:=body;
 body:=replace(body,'if not found
     or v_liquidation.frozen_at is null
     or v_liquidation.approved_at is null then',
 'if not kora_private.pago_con_autorizacion_lote(old.id) then');
 if body=previous then raise exception 'Cambió guarda de lote'; end if;
 execute body;
end;$migration$;
