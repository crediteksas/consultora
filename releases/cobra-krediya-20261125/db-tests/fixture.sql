-- Entirely fictional reduced dependency model. Not a production catalog or ACL snapshot.
do $$begin create role anon nologin; exception when duplicate_object then null; end$$;
do $$begin create role authenticated nologin; exception when duplicate_object then null; end$$;
do $$begin create role service_role nologin; exception when duplicate_object then null; end$$;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema public,auth to authenticated,anon,service_role;
grant execute on function auth.uid() to authenticated,anon,service_role;
create table public.perfiles(id uuid primary key,rol text,activo boolean,manage boolean default false,source_access boolean default false);
create function public.rol_actual() returns text language sql stable as $$select rol from public.perfiles where id=auth.uid() and activo$$;
create function public.tiene_capacidad_cartera(text) returns boolean language sql stable as $$select coalesce((select manage from public.perfiles where id=auth.uid() and activo),false) and $1='manage'$$;
create function public.tiene_capacidad_aliados(text) returns boolean language sql stable as $$select coalesce((select source_access from public.perfiles where id=auth.uid() and activo),false) and $1='revisor'$$;
grant select on public.perfiles to authenticated;
insert into public.perfiles values
 ('11111111-1111-4111-8111-111111111111','gerencia',true,false,true),
 ('22222222-2222-4222-8222-222222222222','auditoria',true,false,true),
 ('33333333-3333-4333-8333-333333333333','admin_tienda',true,false,false),
 ('44444444-4444-4444-8444-444444444444','admin_tienda',true,true,true),
 ('55555555-5555-4555-8555-555555555555','gerencia',false,false,true),
 ('66666666-6666-4666-8666-666666666666','admin_tienda',true,true,false);
create table public.liquidations(id uuid primary key,approved_at timestamptz,approved_by uuid,frozen_at timestamptz);
grant select on public.liquidations to authenticated;
insert into public.liquidations values('cccccccc-cccc-4ccc-8ccc-ccccccccccc1','2026-11-01 00:00:00+00','11111111-1111-4111-8111-111111111111','2026-11-01 00:00:00+00');
create table public.liquidation_operations(id uuid primary key,liquidation_id uuid default 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1' references public.liquidations,plataforma text,reconocida boolean default true,external_id text,cliente_documento text,cliente_nombre text,establishment_name text,origen_codigo text,operation_at timestamptz,normalized_data jsonb,monto_credito numeric(16,2));
create index fictional_contract_lookup on public.liquidation_operations(lower(btrim(external_id))) where plataforma='krediya';
alter table public.liquidation_operations enable row level security;
grant select on public.liquidation_operations to authenticated;
create policy fictional_source_access on public.liquidation_operations for select to authenticated using(exists(select 1 from public.perfiles where id=auth.uid() and activo and source_access));
insert into public.liquidation_operations(id,plataforma,external_id,cliente_documento,cliente_nombre,establishment_name,origen_codigo,operation_at,normalized_data,monto_credito) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','krediya','fiction001','111001','Ana Ejemplo','Tienda Ficticia A','FX-01','2026-10-01 13:00Z','{"fecha":"2026-10-01T13:00:00Z"}',400000),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','krediya','fiction002','111002','Luis Ejemplo','Tienda Ficticia B','FX-02','2026-10-01 13:00Z','{"fecha":"2026-10-01T13:00:00Z"}',400000);
create table public.credit_portfolio_obligations(id uuid primary key,operation_id uuid unique references public.liquidation_operations,outstanding_amount numeric);
alter table public.credit_portfolio_obligations enable row level security;
grant select on public.credit_portfolio_obligations to authenticated;
create policy fictional_obligation_access on public.credit_portfolio_obligations for select to authenticated using(public.rol_actual() in ('gerencia','auditoria'));
insert into public.credit_portfolio_obligations values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',350000);
create table public.credit_repayments(id uuid primary key,amount numeric);
create table public.credit_collection_events(id uuid primary key default gen_random_uuid(),obligation_id uuid not null references public.credit_portfolio_obligations,actor_type text not null,event_type text not null,channel text,note text,promise_date date,promise_amount numeric,created_by uuid references public.perfiles,created_at timestamptz not null default now());
alter table public.credit_collection_events enable row level security;
grant select on public.credit_collection_events to authenticated;
create policy fictional_legacy_event_read on public.credit_collection_events for select to authenticated using(public.rol_actual() in ('gerencia','auditoria'));
create function public.fictional_legacy_collection(p_obligation uuid) returns void language plpgsql security definer set search_path='' as $$begin
 if public.rol_actual() not in ('gerencia','auditoria') then raise exception 'fictional_denied'; end if;
 insert into public.credit_collection_events(obligation_id,actor_type,event_type,channel,note,created_by) values(p_obligation,'humano','note','internal','Fictional legacy event',auth.uid());
end$$;
revoke all on function public.fictional_legacy_collection(uuid) from public;
grant execute on function public.fictional_legacy_collection(uuid) to authenticated;
-- Simulate permissive defaults so the candidate must explicitly close new objects.
alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
