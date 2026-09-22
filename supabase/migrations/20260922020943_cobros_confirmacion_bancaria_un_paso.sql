-- Confirmación expresa de Gerencia contra banco, no una inferencia del esperado.
-- No cambia liquidaciones, utilidades, órdenes ni saldos contables.
alter table public.cobros_deposits add column fuente_tipo text not null default 'abono_bancario'
 check(fuente_tipo in ('abono_bancario','confirmacion_gerencia'));
alter table public.cobros_deposits add column confirmation_expected_id uuid references public.cobros_expected(id);
alter table public.cobros_deposits alter column fecha drop not null;
alter table public.cobros_deposits alter column banco drop not null;
alter table public.cobros_deposits alter column cuenta_ultimos4 drop not null;
alter table public.cobros_deposits add constraint cobros_deposit_origen_completo check(
 (fuente_tipo='abono_bancario' and fecha is not null and banco is not null and cuenta_ultimos4 is not null and confirmation_expected_id is null)
 or (fuente_tipo='confirmacion_gerencia' and confirmation_expected_id is not null));
create unique index cobros_confirmacion_unica on public.cobros_deposits(confirmation_expected_id) where estado='activo';

create function cobros_private.confirmar_recibido(p_expected_id uuid,p_importe numeric,p_verificado boolean,p_idempotency_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare e public.cobros_expected%rowtype; d public.cobros_deposits%rowtype; usado numeric;
begin
 if not cobros_private.autorizado(true) then raise exception 'Solo Gerencia puede confirmar ingresos'; end if;
 if p_verificado is distinct from true then raise exception 'Confirma que verificaste el dinero recibido en banco'; end if;
 if p_idempotency_key is null then raise exception 'Falta identificador de solicitud'; end if;
 -- Serializa contra registros manuales; evita crear otro ingreso sobre un abono sin aplicar.
 lock table public.cobros_deposits in share row exclusive mode;
 select * into e from public.cobros_expected where id=p_expected_id for update;
 if not found or e.estado<>'activo' then raise exception 'Cobro no disponible'; end if;
 if p_importe is distinct from e.importe then raise exception 'El importe recibido difiere del esperado. Revisa la diferencia sin cambiar el esperado'; end if;
 select * into d from public.cobros_deposits where idempotency_key=p_idempotency_key;
 if found and (d.confirmation_expected_id is distinct from e.id or d.importe is distinct from p_importe or d.created_by<>auth.uid() or d.estado<>'activo') then
  raise exception 'La solicitud ya se utilizó con otros datos o fue anulada';
 end if;
 select coalesce(sum(importe),0) into usado from public.cobros_allocations where expected_id=e.id and estado='activo';
 if usado=e.importe then
  select dep.* into d from public.cobros_deposits dep join public.cobros_allocations a on a.deposit_id=dep.id
   where a.expected_id=e.id and a.estado='activo' and dep.estado='activo' order by a.created_at limit 1;
  return d.id;
 end if;
 if usado<>0 then raise exception 'El corte tiene abonos parciales; revisa el saldo antes de confirmar'; end if;
 if exists(select 1 from public.cobros_deposits dep where dep.plataforma=e.plataforma and dep.estado='activo'
   and dep.importe>(select coalesce(sum(a.importe),0) from public.cobros_allocations a where a.deposit_id=dep.id and a.estado='activo')) then
  raise exception 'Ya hay abonos sin aplicar de esta plataforma. Relaciónalos antes de registrar otra recepción';
 end if;
 insert into public.cobros_deposits(plataforma,fecha,banco,cuenta_ultimos4,referencia,importe,soporte,idempotency_key,created_by,fuente_tipo,confirmation_expected_id)
 values(e.plataforma,null,null,null,'Confirmación del corte '||e.corte,p_importe,
 'Gerencia confirma que verificó este importe recibido contra banco. Fecha bancaria y cuenta no informadas.',
 p_idempotency_key,auth.uid(),'confirmacion_gerencia',e.id) returning * into d;
 perform cobros_private.evento('deposit_confirmado_banco',d.id,to_jsonb(d));
 perform cobros_private.aplicar_abono(d.id,e.id,p_importe,p_idempotency_key);
 return d.id;
end $$;

create function public.cobros_confirmar_recibido(p_expected_id uuid,p_importe numeric,p_verificado boolean,p_idempotency_key uuid)
returns uuid language sql security invoker set search_path='' as $$
 select cobros_private.confirmar_recibido(p_expected_id,p_importe,p_verificado,p_idempotency_key)
$$;

create function cobros_private.confirmar_corte_banco(p_liquidation_id uuid,p_fecha_esperada date,p_importe numeric,p_verificado boolean,p_idempotency_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare l public.liquidations%rowtype; e public.cobros_expected%rowtype; eid uuid;
begin
 if not cobros_private.autorizado(true) then raise exception 'Solo Gerencia puede confirmar ingresos'; end if;
 if p_verificado is distinct from true or p_idempotency_key is null then raise exception 'Confirma la verificación bancaria'; end if;
 lock table public.cobros_deposits in share row exclusive mode;
 select * into l from public.liquidations where id=p_liquidation_id for update;
 if not found or l.estado='anulada' then raise exception 'Liquidación no disponible'; end if;
 select * into e from public.cobros_expected where liquidation_id=l.id and estado='activo';
 if found then
  if e.importe is distinct from p_importe then raise exception 'Ya existe un esperado distinto; revisa la diferencia'; end if;
  eid:=e.id;
 else
  eid:=cobros_private.crear_esperado(l.plataforma,l.fecha_corte,p_fecha_esperada,'Liquidación · '||l.fecha_corte,p_importe,'',l.id,p_idempotency_key);
 end if;
 return cobros_private.confirmar_recibido(eid,p_importe,p_verificado,p_idempotency_key);
end $$;
create function public.cobros_confirmar_corte_banco(p_liquidation_id uuid,p_fecha_esperada date,p_importe numeric,p_verificado boolean,p_idempotency_key uuid)
returns uuid language sql security invoker set search_path='' as $$
 select cobros_private.confirmar_corte_banco(p_liquidation_id,p_fecha_esperada,p_importe,p_verificado,p_idempotency_key)
$$;
revoke all on function cobros_private.confirmar_recibido(uuid,numeric,boolean,uuid),public.cobros_confirmar_recibido(uuid,numeric,boolean,uuid),cobros_private.confirmar_corte_banco(uuid,date,numeric,boolean,uuid),public.cobros_confirmar_corte_banco(uuid,date,numeric,boolean,uuid) from public,anon;
grant execute on function cobros_private.confirmar_recibido(uuid,numeric,boolean,uuid),public.cobros_confirmar_recibido(uuid,numeric,boolean,uuid),cobros_private.confirmar_corte_banco(uuid,date,numeric,boolean,uuid),public.cobros_confirmar_corte_banco(uuid,date,numeric,boolean,uuid) to authenticated;
notify pgrst,'reload schema';
