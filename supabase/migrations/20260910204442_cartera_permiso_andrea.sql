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
select p.id, 'read', true
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

comment on table public.credit_portfolio_operators is
  'Permisos funcionales de Cartera independientes del rol general de KORA.';
comment on column public.credit_portfolio_operators.capability is
  'read habilita el módulo conservando el alcance de tienda; manage queda reservado para una autorización posterior.';

commit;
