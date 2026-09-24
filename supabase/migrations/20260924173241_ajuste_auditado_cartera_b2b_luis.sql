-- Una propuesta de auditoría no modifica el libro hasta la autorización de Oscar.
create table public.ajustes_auditoria_cartera_b2b (
  id uuid primary key default gen_random_uuid(),
  referencia text not null unique,
  cliente_codigo text not null references public.origenes(codigo),
  nombre_auditado text not null,
  fecha_corte date not null,
  saldo_base numeric(18,2) not null check (saldo_base >= 0),
  saldo_objetivo numeric(18,2) not null check (saldo_objetivo >= 0),
  motivo text not null check (length(trim(motivo)) >= 20),
  estado text not null default 'pendiente' check (estado in ('pendiente','aplicado')),
  autorizado_por uuid references public.perfiles(id),
  autorizado_at timestamptz,
  movimiento_id uuid,
  created_at timestamptz not null default now()
);
alter table public.ajustes_auditoria_cartera_b2b enable row level security;
revoke all on public.ajustes_auditoria_cartera_b2b from public,anon,authenticated;
grant select on public.ajustes_auditoria_cartera_b2b to authenticated;
create policy ajustes_b2b_solo_oscar on public.ajustes_auditoria_cartera_b2b
  for select to authenticated using (
    auth.uid()='6de0ad26-64af-4966-8cd9-d468880af627'::uuid
    and exists(select 1 from public.perfiles p where p.id=auth.uid() and p.activo and p.rol='gerencia')
  );

create function public.proteger_ajuste_auditoria_cartera_b2b()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_codigo text; v_estado text;
begin
  if new.referencia_tipo is distinct from 'ajuste_auditoria_b2b' then return new; end if;
  v_id:=nullif(current_setting('app.ajuste_auditoria_b2b_id',true),'')::uuid;
  if v_id is null or auth.uid() is distinct from '6de0ad26-64af-4966-8cd9-d468880af627'::uuid then
    raise exception 'El ajuste B2B requiere autorización de Oscar en KORA';
  end if;
  select cliente_codigo,estado into v_codigo,v_estado
    from public.ajustes_auditoria_cartera_b2b where id=v_id;
  if v_estado is distinct from 'pendiente' or v_codigo is distinct from new.tienda_codigo
     or new.referencia_id is distinct from v_id::text then
    raise exception 'El movimiento no corresponde a una propuesta B2B pendiente';
  end if;
  return new;
end $$;
revoke all on function public.proteger_ajuste_auditoria_cartera_b2b() from public,anon,authenticated;
create trigger proteger_movimiento_auditoria_b2b before insert on public.movimientos_cartera
  for each row execute function public.proteger_ajuste_auditoria_cartera_b2b();

create function public.autorizar_ajuste_auditoria_cartera_b2b(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.ajustes_auditoria_cartera_b2b%rowtype;
  v_cuenta uuid; v_saldo numeric; v_diferencia numeric; v_movimiento uuid;
begin
  if auth.uid() is distinct from '6de0ad26-64af-4966-8cd9-d468880af627'::uuid
     or not exists(select 1 from public.perfiles p where p.id=auth.uid() and p.activo and p.rol='gerencia') then
    raise exception 'Solo Oscar Pacheco puede autorizar este ajuste B2B';
  end if;
  select * into v from public.ajustes_auditoria_cartera_b2b where id=p_id for update;
  if not found then raise exception 'Propuesta B2B no encontrada'; end if;
  if v.estado='aplicado' then
    return jsonb_build_object('id',v.id,'estado','aplicado','saldo',v.saldo_objetivo,'ya_aplicado',true);
  end if;
  select c.id into v_cuenta from public.cuentas_cartera c
    join public.origenes o on o.codigo=c.tienda_codigo
    where c.tienda_codigo=v.cliente_codigo and c.tipo_cuenta='cliente_b2b'
      and c.activo and o.tipo='cliente_b2b' and o.activo for update of c;
  if v_cuenta is null then raise exception 'La cuenta B2B no está activa'; end if;
  lock table public.movimientos_cartera in share row exclusive mode;
  select coalesce(sum(case when efecto='debito' then monto else -monto end),0)
    into v_saldo from public.movimientos_cartera where cuenta_id=v_cuenta;
  if v_saldo is distinct from v.saldo_base then
    raise exception 'La deuda cambió desde la auditoría: %. Revisa una nueva propuesta',v_saldo;
  end if;
  v_diferencia:=v.saldo_objetivo-v_saldo;
  if v_diferencia=0 then raise exception 'La propuesta no cambia el saldo'; end if;
  perform set_config('app.ajuste_auditoria_b2b_id',v.id::text,true);
  insert into public.movimientos_cartera(cuenta_id,tienda_codigo,efecto,monto,concepto,
    referencia_tipo,referencia_id,fecha_efectiva,metadatos,creado_por)
  values(v_cuenta,v.cliente_codigo,case when v_diferencia>0 then 'debito' else 'credito' end,
    abs(v_diferencia),'Corrección de saldo por auditoría · no es venta ni pago',
    'ajuste_auditoria_b2b',v.id::text,(now() at time zone 'America/Bogota')::date,
    jsonb_build_object('referencia',v.referencia,'nombre_auditado',v.nombre_auditado,
      'saldo_base',v.saldo_base,'saldo_objetivo',v.saldo_objetivo,'motivo',v.motivo,
      'autorizado_por',auth.uid(),'sin_movimiento_bancario',true),auth.uid())
  returning id into v_movimiento;
  update public.ajustes_auditoria_cartera_b2b set estado='aplicado',
    autorizado_por=auth.uid(),autorizado_at=now(),movimiento_id=v_movimiento where id=v.id;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
  values(auth.uid()::text,'ajuste_auditoria_cartera_b2b_autorizado',
    'ajustes_auditoria_cartera_b2b',v.id::text,
    jsonb_build_object('cliente_codigo',v.cliente_codigo,'saldo_antes',v_saldo,
      'saldo_despues',v.saldo_objetivo,'movimiento_id',v_movimiento,
      'sin_venta_ni_movimiento_bancario',true));
  if (select coalesce(sum(case when efecto='debito' then monto else -monto end),0)
        from public.movimientos_cartera where cuenta_id=v_cuenta)<>v.saldo_objetivo then
    raise exception 'La comprobación final no coincide; no se aplicó ningún ajuste';
  end if;
  return jsonb_build_object('id',v.id,'estado','aplicado','saldo',v.saldo_objetivo,'ya_aplicado',false);
end $$;
revoke all on function public.autorizar_ajuste_auditoria_cartera_b2b(uuid) from public,anon;
grant execute on function public.autorizar_ajuste_auditoria_cartera_b2b(uuid) to authenticated;

insert into public.ajustes_auditoria_cartera_b2b(referencia,cliente_codigo,nombre_auditado,
  fecha_corte,saldo_base,saldo_objetivo,motivo)
select 'CK13-LUIS-AUD-20260924','CK-13','Luis Rivera','2026-09-24',7684000,15882540,
  'Conciliación del primer proceso B2B: Gerencia confirmó que la deuda real de Luis Rivera es $15.882.540 el 24/09/2026.'
where exists(select 1 from public.origenes where codigo='CK-13' and tipo='cliente_b2b' and activo)
on conflict(referencia) do nothing;
