begin;

create table public.credit_portfolio_operators (
  perfil_id uuid primary key references public.perfiles(id) on delete restrict,
  capability text not null check (capability in ('read','manage')),
  active boolean not null default true,
  granted_by uuid references public.perfiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.credit_portfolio_operators enable row level security;

create policy credit_portfolio_operators_self_read
on public.credit_portfolio_operators
for select to authenticated
using ((select auth.uid()) = perfil_id and active);

revoke all on public.credit_portfolio_operators from public, anon;
grant select on public.credit_portfolio_operators to authenticated;
grant all on public.credit_portfolio_operators to service_role;

insert into public.credit_portfolio_operators(perfil_id, capability, active)
select p.id, 'manage', true
from public.perfiles p
join auth.users u on u.id = p.id
where lower(u.email) = 'andrea.velez@crediteksas.com'
  and p.activo
on conflict(perfil_id) do update set
  capability = excluded.capability,
  active = true,
  updated_at = now();

create or replace function public.tiene_capacidad_cartera(p_capacidad text default 'read')
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.credit_portfolio_operators operator
    where operator.perfil_id = (select auth.uid())
      and operator.active
      and case p_capacidad
        when 'read' then operator.capability in ('read','manage')
        when 'manage' then operator.capability = 'manage'
        else false
      end
  );
$$;
revoke all on function public.tiene_capacidad_cartera(text) from public, anon;
grant execute on function public.tiene_capacidad_cartera(text) to authenticated;

create or replace function public.creditos_cartera_puede_leer(p_origen_codigo text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.perfiles p
    where p.id = (select auth.uid())
      and p.activo
      and (
        p.rol in ('gerencia','auditoria')
        or p.tienda_codigo = p_origen_codigo
        or exists (
          select 1 from public.credit_portfolio_operators operator
          where operator.perfil_id = p.id
            and operator.active
            and operator.capability in ('read','manage')
        )
      )
  );
$$;
revoke all on function public.creditos_cartera_puede_leer(text) from public, anon;
grant execute on function public.creditos_cartera_puede_leer(text) to authenticated;

create or replace function public.creditos_cartera_puede_gestionar()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.perfiles p
    where p.id = (select auth.uid())
      and p.activo
      and (
        p.rol in ('gerencia','auditoria')
        or exists (
          select 1 from public.credit_portfolio_operators operator
          where operator.perfil_id = p.id
            and operator.active
            and operator.capability = 'manage'
        )
      )
  );
$$;
revoke all on function public.creditos_cartera_puede_gestionar() from public, anon;
grant execute on function public.creditos_cartera_puede_gestionar() to authenticated;

create or replace function public.creditos_cartera_registrar_pago_cliente(
  p_obligation_id uuid,
  p_platform_payment_id text,
  p_amount numeric,
  p_paid_at timestamptz,
  p_evidence jsonb default '{}'::jsonb
)
returns public.credit_portfolio_obligations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v public.credit_portfolio_obligations%rowtype;
  v_total numeric;
begin
  if not public.creditos_cartera_puede_gestionar() then
    raise exception 'No autorizado para validar pagos del cliente';
  end if;
  select * into v
  from public.credit_portfolio_obligations
  where id = p_obligation_id
  for update;
  if not found then raise exception 'Crédito no encontrado'; end if;

  insert into public.credit_repayments(
    obligation_id, platform_payment_id, amount, paid_at, status, source,
    evidence, validated_by, validated_at
  ) values (
    v.id, btrim(p_platform_payment_id), p_amount, p_paid_at, 'validated', 'manual',
    coalesce(p_evidence,'{}'::jsonb), (select auth.uid()), now()
  ) on conflict(obligation_id, platform_payment_id) do nothing;

  select coalesce(sum(amount),0) into v_total
  from public.credit_repayments
  where obligation_id = v.id and status = 'validated';

  update public.credit_portfolio_obligations
  set outstanding_amount = greatest(original_amount-v_total,0),
      status = case
        when v_total >= original_amount then 'paid'
        when next_due_date < current_date then 'late'
        else 'current'
      end,
      updated_at = now()
  where id = v.id
  returning * into v;
  return v;
end;
$$;
revoke all on function public.creditos_cartera_registrar_pago_cliente(uuid,text,numeric,timestamptz,jsonb) from public, anon;
grant execute on function public.creditos_cartera_registrar_pago_cliente(uuid,text,numeric,timestamptz,jsonb) to authenticated;

create or replace function public.creditos_cartera_registrar_gestion(
  p_obligation_id uuid,
  p_actor_type text,
  p_event_type text,
  p_channel text,
  p_note text,
  p_promise_date date default null,
  p_promise_amount numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if not public.creditos_cartera_puede_gestionar() then
    raise exception 'No autorizado para registrar gestión de cartera';
  end if;
  insert into public.credit_collection_events(
    obligation_id, actor_type, event_type, channel, note,
    promise_date, promise_amount, created_by
  ) values (
    p_obligation_id, p_actor_type, p_event_type, nullif(p_channel,''),
    nullif(btrim(coalesce(p_note,'')),''), p_promise_date,
    p_promise_amount, (select auth.uid())
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.creditos_cartera_registrar_gestion(uuid,text,text,text,text,date,numeric) from public, anon;
grant execute on function public.creditos_cartera_registrar_gestion(uuid,text,text,text,text,date,numeric) to authenticated;

comment on table public.credit_portfolio_operators is
  'Permisos funcionales de Cartera independientes del rol general de KORA.';
comment on column public.credit_portfolio_operators.capability is
  'read consulta la cartera completa; manage además registra pagos validados y gestiones.';

commit;
