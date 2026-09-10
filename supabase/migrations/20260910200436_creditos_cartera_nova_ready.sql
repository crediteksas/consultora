begin;

do $preflight$
begin
  if to_regclass('public.clientes') is null
     or to_regclass('public.solicitudes') is null
     or to_regclass('public.ventas') is null
     or to_regclass('public.creditos') is null
     or to_regclass('public.liquidation_operations') is null
     or to_regclass('public.payment_orders') is null
     or to_regclass('public.payment_items') is null
     or to_regclass('public.perfiles') is null
     or to_regclass('public.origenes') is null then
    raise exception 'Falta infraestructura requerida para Créditos y Cartera';
  end if;
end;
$preflight$;

create schema if not exists kora_private;
revoke all on schema kora_private from public, anon, authenticated;

create table public.credit_portfolio_settings (
  singleton boolean primary key default true check (singleton),
  nova_enforcement_enabled boolean not null default false,
  nova_enforcement_from date,
  updated_by uuid references public.perfiles(id),
  updated_at timestamptz not null default now(),
  check (not nova_enforcement_enabled or nova_enforcement_from is not null)
);

insert into public.credit_portfolio_settings(singleton, nova_enforcement_enabled)
values (true, false);

create table public.credit_customer_links (
  cliente_id uuid primary key references public.clientes(id) on delete restrict,
  aura_customer_id text unique,
  registration_source text not null check (registration_source in ('sofia','tienda','importacion','historico')),
  origen_codigo text references public.origenes(codigo),
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.nova_authorizations (
  id uuid primary key default gen_random_uuid(),
  external_decision_id text not null unique,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  solicitud_id uuid references public.solicitudes(id) on delete restrict,
  origen_codigo text not null references public.origenes(codigo),
  plataforma text not null,
  requested_amount numeric(16,2) not null check (requested_amount > 0),
  approved_amount numeric(16,2) check (approved_amount >= 0),
  decision text not null check (decision in ('approved','denied','expired','revoked')),
  rule_version text not null,
  reason_codes jsonb not null default '[]'::jsonb check (jsonb_typeof(reason_codes) = 'array'),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  source_payload_hash text check (source_payload_hash is null or source_payload_hash ~ '^[0-9a-f]{64}$'),
  issued_at timestamptz not null,
  expires_at timestamptz,
  received_at timestamptz not null default now(),
  check (expires_at is null or expires_at > issued_at),
  check (decision <> 'approved' or coalesce(approved_amount,0) > 0)
);

create index nova_authorizations_lookup_idx
  on public.nova_authorizations(cliente_id, origen_codigo, plataforma, decision, issued_at desc);

create table public.credit_portfolio_obligations (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique references public.liquidation_operations(id) on delete restrict,
  credito_id uuid references public.creditos(id) on delete restrict,
  cliente_id uuid references public.clientes(id) on delete restrict,
  nova_authorization_id uuid references public.nova_authorizations(id) on delete restrict,
  payment_order_id uuid references public.payment_orders(id) on delete restrict,
  plataforma text not null,
  external_credit_id text not null,
  origen_codigo text references public.origenes(codigo),
  cliente_documento_snapshot text,
  cliente_nombre_snapshot text,
  original_amount numeric(16,2) not null check (original_amount >= 0),
  outstanding_amount numeric(16,2) not null check (outstanding_amount >= 0),
  ally_paid_at timestamptz,
  first_due_date date,
  next_due_date date,
  status text not null default 'active' check (status in ('active','current','late','delinquent','paid','refinanced','loss','cancelled')),
  pre_nova boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(plataforma, external_credit_id)
);

create index credit_portfolio_obligations_queue_idx
  on public.credit_portfolio_obligations(status, next_due_date, updated_at desc);
create index credit_portfolio_obligations_origin_idx
  on public.credit_portfolio_obligations(origen_codigo, created_at desc);

create table public.credit_repayments (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references public.credit_portfolio_obligations(id) on delete restrict,
  platform_payment_id text not null,
  amount numeric(16,2) not null check (amount > 0),
  paid_at timestamptz not null,
  status text not null default 'reported' check (status in ('reported','validated','rejected','reversed')),
  source text not null check (source in ('platform','manual','import')),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  validated_by uuid references public.perfiles(id),
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  unique(obligation_id, platform_payment_id),
  check (status <> 'validated' or (validated_by is not null and validated_at is not null))
);

create index credit_repayments_obligation_idx
  on public.credit_repayments(obligation_id, paid_at desc);

create table public.credit_collection_events (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references public.credit_portfolio_obligations(id) on delete restrict,
  actor_type text not null check (actor_type in ('cobra','humano','sistema')),
  event_type text not null check (event_type in ('contact_attempt','contacted','promise','promise_kept','promise_broken','dispute','note','escalated')),
  channel text check (channel in ('whatsapp','call','sms','email','platform','internal')),
  note text,
  promise_date date,
  promise_amount numeric(16,2) check (promise_amount is null or promise_amount > 0),
  created_by uuid references public.perfiles(id),
  created_at timestamptz not null default now()
);

create index credit_collection_events_obligation_idx
  on public.credit_collection_events(obligation_id, created_at desc);

create or replace function public.creditos_cartera_puede_leer(p_origen_codigo text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.perfiles p
    where p.id = (select auth.uid()) and p.activo
      and (p.rol in ('gerencia','auditoria') or p.tienda_codigo = p_origen_codigo)
  );
$$;
revoke all on function public.creditos_cartera_puede_leer(text) from public, anon;
grant execute on function public.creditos_cartera_puede_leer(text) to authenticated;

alter table public.credit_portfolio_settings enable row level security;
alter table public.credit_customer_links enable row level security;
alter table public.nova_authorizations enable row level security;
alter table public.credit_portfolio_obligations enable row level security;
alter table public.credit_repayments enable row level security;
alter table public.credit_collection_events enable row level security;

create policy credit_portfolio_settings_read on public.credit_portfolio_settings
for select to authenticated using ((select auth.uid()) is not null);
create policy credit_customer_links_read on public.credit_customer_links
for select to authenticated using (public.creditos_cartera_puede_leer(origen_codigo));
create policy nova_authorizations_read on public.nova_authorizations
for select to authenticated using (public.creditos_cartera_puede_leer(origen_codigo));
create policy credit_portfolio_obligations_read on public.credit_portfolio_obligations
for select to authenticated using (public.creditos_cartera_puede_leer(origen_codigo));
create policy credit_repayments_read on public.credit_repayments
for select to authenticated using (exists (
  select 1 from public.credit_portfolio_obligations o
  where o.id = obligation_id and public.creditos_cartera_puede_leer(o.origen_codigo)
));
create policy credit_collection_events_read on public.credit_collection_events
for select to authenticated using (exists (
  select 1 from public.credit_portfolio_obligations o
  where o.id = obligation_id and public.creditos_cartera_puede_leer(o.origen_codigo)
));

grant select on public.credit_portfolio_settings, public.credit_customer_links,
  public.nova_authorizations, public.credit_portfolio_obligations,
  public.credit_repayments, public.credit_collection_events to authenticated;
grant all on public.credit_portfolio_settings, public.credit_customer_links,
  public.nova_authorizations, public.credit_portfolio_obligations,
  public.credit_repayments, public.credit_collection_events to service_role;

create or replace function public.nova_sincronizar_cliente_aura(
  p_aura_customer_id text,
  p_cedula text,
  p_nombre_completo text,
  p_celular text,
  p_email text,
  p_ciudad text,
  p_direccion text,
  p_origen_codigo text,
  p_autorizacion_at timestamptz,
  p_autorizacion_version text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cliente_id uuid;
begin
  if nullif(btrim(p_aura_customer_id),'') is null
     or p_cedula !~ '^[0-9]{5,12}$'
     or p_celular !~ '^3[0-9]{9}$'
     or length(btrim(coalesce(p_nombre_completo,''))) < 3
     or p_autorizacion_at is null
     or nullif(btrim(p_autorizacion_version),'') is null then
    raise exception 'nova_cliente_aura_invalido';
  end if;
  if not exists(select 1 from public.origenes where codigo=p_origen_codigo and activo) then
    raise exception 'nova_origen_no_registrado';
  end if;

  insert into public.clientes(
    cedula,nombre_completo,celular,celular_verificado,email,ciudad,direccion,
    origen_codigo,fuente,autorizacion_datos,autorizacion_comercial,
    autorizacion_timestamp,autorizacion_version,updated_at
  ) values (
    p_cedula,btrim(p_nombre_completo),p_celular,false,nullif(btrim(coalesce(p_email,'')),''),
    nullif(btrim(coalesce(p_ciudad,'')),''),nullif(btrim(coalesce(p_direccion,'')),''),
    p_origen_codigo,'sofia',true,false,p_autorizacion_at,btrim(p_autorizacion_version),now()
  ) on conflict(cedula) do update set
    nombre_completo=excluded.nombre_completo,
    celular=excluded.celular,
    email=coalesce(excluded.email,public.clientes.email),
    ciudad=coalesce(excluded.ciudad,public.clientes.ciudad),
    direccion=coalesce(excluded.direccion,public.clientes.direccion),
    origen_codigo=excluded.origen_codigo,
    autorizacion_datos=true,
    autorizacion_timestamp=excluded.autorizacion_timestamp,
    autorizacion_version=excluded.autorizacion_version,
    updated_at=now()
  returning id into v_cliente_id;

  insert into public.credit_customer_links(cliente_id,aura_customer_id,registration_source,origen_codigo,synced_at,updated_at)
  values(v_cliente_id,btrim(p_aura_customer_id),'sofia',p_origen_codigo,now(),now())
  on conflict(cliente_id) do update set
    aura_customer_id=excluded.aura_customer_id,
    registration_source='sofia', origen_codigo=excluded.origen_codigo,
    synced_at=now(), updated_at=now();

  return jsonb_build_object('ok',true,'cliente_id',v_cliente_id);
end;
$$;
revoke all on function public.nova_sincronizar_cliente_aura(text,text,text,text,text,text,text,text,timestamptz,text) from public, anon, authenticated;
grant execute on function public.nova_sincronizar_cliente_aura(text,text,text,text,text,text,text,text,timestamptz,text) to service_role;

create or replace function public.nova_registrar_decision(
  p_external_decision_id text,
  p_cliente_documento text,
  p_solicitud_id uuid,
  p_origen_codigo text,
  p_plataforma text,
  p_requested_amount numeric,
  p_approved_amount numeric,
  p_decision text,
  p_rule_version text,
  p_reason_codes jsonb,
  p_evidence jsonb,
  p_source_payload_hash text,
  p_issued_at timestamptz,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cliente_id uuid;
  v_id uuid;
begin
  select id into v_cliente_id from public.clientes where cedula=p_cliente_documento;
  if v_cliente_id is null then raise exception 'nova_cliente_no_registrado'; end if;
  if p_solicitud_id is not null and not exists(
    select 1 from public.solicitudes where id=p_solicitud_id and cliente_id=v_cliente_id
  ) then raise exception 'nova_solicitud_no_corresponde_cliente'; end if;

  insert into public.nova_authorizations(
    external_decision_id,cliente_id,solicitud_id,origen_codigo,plataforma,
    requested_amount,approved_amount,decision,rule_version,reason_codes,evidence,
    source_payload_hash,issued_at,expires_at
  ) values (
    btrim(p_external_decision_id),v_cliente_id,p_solicitud_id,p_origen_codigo,lower(btrim(p_plataforma)),
    p_requested_amount,p_approved_amount,p_decision,btrim(p_rule_version),
    coalesce(p_reason_codes,'[]'::jsonb),coalesce(p_evidence,'{}'::jsonb),
    p_source_payload_hash,p_issued_at,p_expires_at
  ) on conflict(external_decision_id) do nothing returning id into v_id;

  if v_id is null then
    select id into v_id from public.nova_authorizations where external_decision_id=p_external_decision_id;
  end if;
  return v_id;
end;
$$;
revoke all on function public.nova_registrar_decision(text,text,uuid,text,text,numeric,numeric,text,text,jsonb,jsonb,text,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.nova_registrar_decision(text,text,uuid,text,text,numeric,numeric,text,text,jsonb,jsonb,text,timestamptz,timestamptz) to service_role;

create or replace function public.creditos_cartera_configurar_nova(p_activar boolean, p_desde date)
returns public.credit_portfolio_settings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v public.credit_portfolio_settings%rowtype;
begin
  if (select auth.uid()) is null or public.rol_actual() <> 'gerencia' then
    raise exception 'Solo gerencia puede configurar la entrada de Nova';
  end if;
  if p_activar and p_desde is null then raise exception 'Define la fecha oficial de entrada de Nova'; end if;
  update public.credit_portfolio_settings
  set nova_enforcement_enabled=p_activar,
      nova_enforcement_from=case when p_activar then p_desde else nova_enforcement_from end,
      updated_by=(select auth.uid()), updated_at=now()
  where singleton returning * into v;
  return v;
end;
$$;
revoke all on function public.creditos_cartera_configurar_nova(boolean,date) from public, anon;
grant execute on function public.creditos_cartera_configurar_nova(boolean,date) to authenticated;

create or replace function kora_private.creditos_cartera_validar_pago_nova()
returns trigger
language plpgsql
security definer
set search_path = public, kora_private, pg_temp
as $$
declare
  v_enabled boolean;
  v_from date;
  v_missing integer;
begin
  if new.estado not in ('programado','pagado','conciliado')
     or new.estado is not distinct from old.estado then return new; end if;

  select nova_enforcement_enabled,nova_enforcement_from into v_enabled,v_from
  from public.credit_portfolio_settings where singleton;
  if not coalesce(v_enabled,false) then return new; end if;

  select count(*) into v_missing
  from (
    select distinct lo.id,lo.plataforma,lo.origen_codigo,lo.operation_at,
      coalesce(lo.monto_credito,lo.monto_base,0) amount,
      coalesce(v.cliente_id,c.id) cliente_id
    from public.payment_items pi
    join public.liquidation_operations lo on lo.id=pi.operation_id
    left join public.creditos cr on cr.id=lo.credito_id
    left join public.ventas v on v.id=cr.venta_id
    left join public.clientes c on c.cedula=lo.cliente_documento
    where pi.payment_order_id=new.id
      and coalesce(lo.operation_at::date,current_date)>=v_from
      and (coalesce(lo.monto_credito,0)>0 or lo.cliente_documento is not null)
  ) op
  where op.cliente_id is null or not exists(
    select 1 from public.nova_authorizations a
    where a.cliente_id=op.cliente_id
      and a.origen_codigo is not distinct from op.origen_codigo
      and lower(a.plataforma)=lower(op.plataforma)
      and a.decision='approved'
      and a.approved_amount>=op.amount
      and a.issued_at<=coalesce(op.operation_at,now())
      and (a.expires_at is null or a.expires_at>=coalesce(op.operation_at,now()))
  );
  if v_missing>0 then
    raise exception 'nova_autorizacion_requerida:% operación(es) sin autorización válida',v_missing;
  end if;
  return new;
end;
$$;
revoke all on function kora_private.creditos_cartera_validar_pago_nova() from public, anon, authenticated;

create trigger payment_orders_require_nova_when_enabled
before update of estado on public.payment_orders
for each row execute function kora_private.creditos_cartera_validar_pago_nova();

create or replace function kora_private.creditos_cartera_crear_al_pagar()
returns trigger
language plpgsql
security definer
set search_path = public, kora_private, pg_temp
as $$
declare
  v_enabled boolean;
  v_from date;
begin
  if new.estado not in ('pagado','conciliado') then return new; end if;
  select nova_enforcement_enabled,nova_enforcement_from into v_enabled,v_from
  from public.credit_portfolio_settings where singleton;

  insert into public.credit_portfolio_obligations(
    operation_id,credito_id,cliente_id,nova_authorization_id,payment_order_id,
    plataforma,external_credit_id,origen_codigo,cliente_documento_snapshot,
    cliente_nombre_snapshot,original_amount,outstanding_amount,ally_paid_at,pre_nova
  )
  select distinct on(lo.id)
    lo.id,lo.credito_id,coalesce(v.cliente_id,c.id),a.id,new.id,
    lower(lo.plataforma),lo.external_id,lo.origen_codigo,lo.cliente_documento,
    lo.cliente_nombre,coalesce(lo.monto_credito,lo.monto_base,0),
    coalesce(lo.monto_credito,lo.monto_base,0),coalesce(new.fecha_pagada,now()),
    not (coalesce(v_enabled,false) and coalesce(lo.operation_at::date,current_date)>=v_from)
  from public.payment_items pi
  join public.liquidation_operations lo on lo.id=pi.operation_id
  left join public.creditos cr on cr.id=lo.credito_id
  left join public.ventas v on v.id=cr.venta_id
  left join public.clientes c on c.cedula=lo.cliente_documento
  left join lateral (
    select na.id from public.nova_authorizations na
    where na.cliente_id=coalesce(v.cliente_id,c.id)
      and na.origen_codigo is not distinct from lo.origen_codigo
      and lower(na.plataforma)=lower(lo.plataforma) and na.decision='approved'
      and na.approved_amount>=coalesce(lo.monto_credito,lo.monto_base,0)
    order by na.issued_at desc limit 1
  ) a on true
  where pi.payment_order_id=new.id
    and (coalesce(lo.monto_credito,0)>0 or lo.cliente_documento is not null)
  order by lo.id
  on conflict(operation_id) do update set
    payment_order_id=excluded.payment_order_id,
    ally_paid_at=coalesce(public.credit_portfolio_obligations.ally_paid_at,excluded.ally_paid_at),
    cliente_id=coalesce(public.credit_portfolio_obligations.cliente_id,excluded.cliente_id),
    nova_authorization_id=coalesce(public.credit_portfolio_obligations.nova_authorization_id,excluded.nova_authorization_id),
    updated_at=now();
  return new;
end;
$$;
revoke all on function kora_private.creditos_cartera_crear_al_pagar() from public, anon, authenticated;

create trigger payment_orders_create_credit_portfolio
after insert or update of estado on public.payment_orders
for each row execute function kora_private.creditos_cartera_crear_al_pagar();

create or replace function kora_private.creditos_cartera_vincular_cliente()
returns trigger
language plpgsql
security definer
set search_path = public, kora_private, pg_temp
as $$
begin
  insert into public.credit_customer_links(cliente_id,registration_source,origen_codigo,created_at,updated_at)
  values(
    new.id,
    case when lower(coalesce(new.fuente,'')) like '%sofia%' then 'sofia'
         when lower(coalesce(new.fuente,'')) in ('registro_interno','formulario') then 'tienda'
         else 'historico' end,
    new.origen_codigo,coalesce(new.created_at,now()),now()
  ) on conflict(cliente_id) do update set
    registration_source=case
      when public.credit_customer_links.registration_source='sofia' then 'sofia'
      else excluded.registration_source end,
    origen_codigo=coalesce(excluded.origen_codigo,public.credit_customer_links.origen_codigo),
    updated_at=now();

  update public.credit_portfolio_obligations o
  set cliente_id=new.id,updated_at=now()
  where o.cliente_id is null and o.cliente_documento_snapshot=new.cedula
    and (o.origen_codigo is null or new.origen_codigo is null or o.origen_codigo=new.origen_codigo);
  return new;
end;
$$;
revoke all on function kora_private.creditos_cartera_vincular_cliente() from public, anon, authenticated;

create trigger clientes_link_credit_portfolio
after insert or update of cedula,origen_codigo,fuente on public.clientes
for each row execute function kora_private.creditos_cartera_vincular_cliente();

insert into public.credit_customer_links(cliente_id,registration_source,origen_codigo,created_at,updated_at)
select c.id,
  case when lower(coalesce(c.fuente,'')) like '%sofia%' then 'sofia'
       when lower(coalesce(c.fuente,'')) in ('registro_interno','formulario') then 'tienda'
       else 'historico' end,
  c.origen_codigo,coalesce(c.created_at,now()),now()
from public.clientes c
on conflict(cliente_id) do nothing;

insert into public.credit_portfolio_obligations(
  operation_id,credito_id,cliente_id,payment_order_id,plataforma,external_credit_id,
  origen_codigo,cliente_documento_snapshot,cliente_nombre_snapshot,original_amount,
  outstanding_amount,ally_paid_at,pre_nova
)
select distinct on(lo.id)
  lo.id,lo.credito_id,coalesce(v.cliente_id,c.id),po.id,lower(lo.plataforma),lo.external_id,
  lo.origen_codigo,lo.cliente_documento,lo.cliente_nombre,
  coalesce(lo.monto_credito,lo.monto_base,0),coalesce(lo.monto_credito,lo.monto_base,0),
  coalesce(po.fecha_pagada,po.updated_at),true
from public.payment_orders po
join public.payment_items pi on pi.payment_order_id=po.id
join public.liquidation_operations lo on lo.id=pi.operation_id
left join public.creditos cr on cr.id=lo.credito_id
left join public.ventas v on v.id=cr.venta_id
left join public.clientes c on c.cedula=lo.cliente_documento
where po.estado in ('pagado','conciliado')
  and (coalesce(lo.monto_credito,0)>0 or lo.cliente_documento is not null)
order by lo.id,po.updated_at desc
on conflict(operation_id) do nothing;

create or replace function public.creditos_cartera_registrar_pago_cliente(
  p_obligation_id uuid,p_platform_payment_id text,p_amount numeric,p_paid_at timestamptz,p_evidence jsonb default '{}'::jsonb
)
returns public.credit_portfolio_obligations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v public.credit_portfolio_obligations%rowtype; v_total numeric;
begin
  if (select auth.uid()) is null or public.rol_actual() not in ('gerencia','auditoria') then
    raise exception 'No autorizado para validar pagos del cliente';
  end if;
  select * into v from public.credit_portfolio_obligations where id=p_obligation_id for update;
  if not found then raise exception 'Crédito no encontrado'; end if;
  insert into public.credit_repayments(obligation_id,platform_payment_id,amount,paid_at,status,source,evidence,validated_by,validated_at)
  values(v.id,btrim(p_platform_payment_id),p_amount,p_paid_at,'validated','manual',coalesce(p_evidence,'{}'::jsonb),(select auth.uid()),now())
  on conflict(obligation_id,platform_payment_id) do nothing;
  select coalesce(sum(amount),0) into v_total from public.credit_repayments
  where obligation_id=v.id and status='validated';
  update public.credit_portfolio_obligations
  set outstanding_amount=greatest(original_amount-v_total,0),
      status=case when v_total>=original_amount then 'paid' when next_due_date<current_date then 'late' else 'current' end,
      updated_at=now()
  where id=v.id returning * into v;
  return v;
end;
$$;
revoke all on function public.creditos_cartera_registrar_pago_cliente(uuid,text,numeric,timestamptz,jsonb) from public, anon;
grant execute on function public.creditos_cartera_registrar_pago_cliente(uuid,text,numeric,timestamptz,jsonb) to authenticated;

create or replace function public.creditos_cartera_registrar_gestion(
  p_obligation_id uuid,p_actor_type text,p_event_type text,p_channel text,p_note text,
  p_promise_date date default null,p_promise_amount numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if (select auth.uid()) is null or public.rol_actual() not in ('gerencia','auditoria') then
    raise exception 'No autorizado para registrar gestión de cartera';
  end if;
  insert into public.credit_collection_events(
    obligation_id,actor_type,event_type,channel,note,promise_date,promise_amount,created_by
  ) values (
    p_obligation_id,p_actor_type,p_event_type,nullif(p_channel,''),nullif(btrim(coalesce(p_note,'')),''),
    p_promise_date,p_promise_amount,(select auth.uid())
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.creditos_cartera_registrar_gestion(uuid,text,text,text,text,date,numeric) from public, anon;
grant execute on function public.creditos_cartera_registrar_gestion(uuid,text,text,text,text,date,numeric) to authenticated;

create view public.creditos_cartera_operaciones
with (security_invoker=true)
as
select
  o.id,o.operation_id,o.credito_id,o.cliente_id,o.plataforma,o.external_credit_id,
  o.origen_codigo,coalesce(origen.nombre,o.origen_codigo) tienda,
  coalesce(c.nombre_completo,o.cliente_nombre_snapshot,'Cliente sin vincular') cliente_nombre,
  coalesce(c.cedula,o.cliente_documento_snapshot) cliente_documento,
  o.original_amount,o.outstanding_amount,o.ally_paid_at,o.first_due_date,o.next_due_date,
  o.status,o.pre_nova,
  case when o.pre_nova then 'pre_nova'
       when na.decision='approved' then 'approved'
       else coalesce(na.decision,'missing') end nova_status,
  na.external_decision_id nova_decision_id,na.rule_version nova_rule_version,
  coalesce((select sum(r.amount) from public.credit_repayments r where r.obligation_id=o.id and r.status='validated'),0) validated_repayments,
  (select max(e.created_at) from public.credit_collection_events e where e.obligation_id=o.id) last_collection_at,
  (select count(*) from public.credit_collection_events e where e.obligation_id=o.id and e.event_type='promise_broken') broken_promises,
  case when o.status='paid' then 'paid'
       when o.status in ('loss','refinanced') then o.status
       when exists(select 1 from public.credit_collection_events e where e.obligation_id=o.id and e.event_type='promise_broken') then 'promise_broken'
       when o.status in ('late','delinquent') then o.status
       else 'current' end credit_outcome
from public.credit_portfolio_obligations o
left join public.clientes c on c.id=o.cliente_id
left join public.origenes origen on origen.codigo=o.origen_codigo
left join public.nova_authorizations na on na.id=o.nova_authorization_id;

revoke all on public.creditos_cartera_operaciones from public, anon;
grant select on public.creditos_cartera_operaciones to authenticated, service_role;

comment on table public.credit_portfolio_obligations is 'Cartera de créditos de clientes. No representa cuentas por pagar a aliados.';
comment on table public.credit_repayments is 'Cuotas o abonos del cliente a su crédito, separados del pago de KORA al aliado.';
comment on table public.credit_collection_events is 'Gestiones humanas o del agente Cobra sobre cartera.';
comment on table public.nova_authorizations is 'Decisiones inmutables recibidas del motor de autorización Nova.';
comment on column public.credit_portfolio_settings.nova_enforcement_enabled is 'Interruptor de entrada oficial. Debe permanecer false hasta el lanzamiento de Nova.';

commit;
