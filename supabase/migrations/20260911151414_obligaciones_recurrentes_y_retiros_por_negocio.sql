-- Control financiero recurrente de KORA.
-- Separa obligaciones gerenciales de Retail, gastos generales por negocio y
-- retiros de utilidad. Ninguna creación o aprobación altera ventas, caja,
-- liquidaciones ni los cálculos históricos existentes.

create extension if not exists pg_cron;

create table public.financial_recurring_templates (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('retail_store','business_general')),
  business_unit text not null check (business_unit in ('retail','b2b','aliados')),
  store_code text references public.origenes(codigo),
  category text not null check (category in ('nomina','arriendo','contador','servicio','otro')),
  concept text not null check (length(btrim(concept)) >= 3),
  beneficiary text not null check (length(btrim(beneficiary)) >= 3),
  beneficiary_document text,
  destination_account text,
  amount_mode text not null default 'fijo' check (amount_mode in ('fijo','variable')),
  default_amount numeric(16,2) check (default_amount is null or default_amount > 0),
  payment_days smallint[] not null,
  start_date date not null default current_date,
  end_date date,
  active boolean not null default true,
  created_by uuid not null references public.perfiles(id) default auth.uid(),
  updated_by uuid not null references public.perfiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(payment_days) between 1 and 2),
  check (payment_days <@ array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31]::smallint[]),
  check (end_date is null or end_date >= start_date),
  check (scope <> 'retail_store' or (business_unit = 'retail' and store_code is not null)),
  check (scope <> 'business_general' or store_code is null),
  check (amount_mode <> 'fijo' or default_amount is not null)
);

create table public.financial_entries (
  id uuid primary key default gen_random_uuid(),
  entry_type text not null check (entry_type in ('gasto','retiro_utilidad')),
  source text not null check (source in ('recurrente','manual')),
  template_id uuid references public.financial_recurring_templates(id),
  scope text not null check (scope in ('retail_store','business_general')),
  business_unit text not null check (business_unit in ('retail','b2b','aliados')),
  store_code text references public.origenes(codigo),
  due_date date not null,
  category text not null,
  concept text not null,
  beneficiary text not null,
  beneficiary_document text,
  destination_account text,
  amount numeric(16,2) check (amount is null or amount > 0),
  source_period_from date,
  source_period_to date,
  status text not null default 'pendiente_aprobacion'
    check (status in ('pendiente_aprobacion','aprobado','rechazado','pagado','anulado')),
  note text,
  approved_by uuid references public.perfiles(id),
  approved_at timestamptz,
  paid_by uuid references public.perfiles(id),
  paid_at timestamptz,
  support_path text,
  created_by uuid references public.perfiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source <> 'recurrente' or template_id is not null),
  check (entry_type <> 'retiro_utilidad' or (scope = 'business_general' and source_period_from is not null and source_period_to is not null)),
  check (entry_type <> 'retiro_utilidad' or source_period_to >= source_period_from),
  check (scope <> 'retail_store' or (business_unit = 'retail' and store_code is not null)),
  check (scope <> 'business_general' or store_code is null),
  check (status <> 'aprobado' or (approved_by is not null and approved_at is not null)),
  check (status <> 'pagado' or (approved_by is not null and approved_at is not null and paid_by is not null and paid_at is not null and support_path is not null))
);

create unique index financial_entries_recurrence_unique
  on public.financial_entries(template_id,due_date)
  where template_id is not null;
create index financial_entries_business_date_idx
  on public.financial_entries(business_unit,due_date desc);
create index financial_entries_pending_idx
  on public.financial_entries(status,due_date)
  where status = 'pendiente_aprobacion';
create index financial_templates_active_idx
  on public.financial_recurring_templates(active,business_unit,store_code)
  where active;

comment on table public.financial_recurring_templates is
  'Configuraciones de Maite y Oscar para generar obligaciones sin ejecutar pagos.';
comment on table public.financial_entries is
  'Libro separado de gastos gerenciales y retiros. Los retiros nunca son gastos operativos.';
comment on column public.financial_entries.scope is
  'retail_store es control gerencial por tienda y no modifica utilidad/caja; business_general pertenece al negocio indicado.';

alter table public.financial_recurring_templates enable row level security;
alter table public.financial_entries enable row level security;
revoke all on public.financial_recurring_templates, public.financial_entries from public, anon, authenticated;
grant select on public.financial_recurring_templates, public.financial_entries to authenticated;

create or replace function public.es_controlador_financiero()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.perfiles p
    where p.id = (select auth.uid()) and p.activo
      and p.id in (
        'd1782db6-bacc-4caf-af6f-ce1b8d1c0391'::uuid, -- Maite Reyes
        '6de0ad26-64af-4966-8cd9-d468880af627'::uuid  -- Oscar Pacheco
      )
  )
$$;
revoke all on function public.es_controlador_financiero() from public, anon;
grant execute on function public.es_controlador_financiero() to authenticated;

create policy financial_templates_controller_read
on public.financial_recurring_templates for select to authenticated
using ((select public.es_controlador_financiero()));
create policy financial_entries_controller_read
on public.financial_entries for select to authenticated
using ((select public.es_controlador_financiero()));

create schema if not exists kora_private;

create or replace function kora_private.generate_financial_entries(p_until date)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  t public.financial_recurring_templates%rowtype;
  month_start date;
  month_end date;
  due date;
  configured_day smallint;
  inserted_count integer := 0;
begin
  for t in
    select * from public.financial_recurring_templates
    where active and start_date <= p_until and (end_date is null or end_date >= start_date)
  loop
    for month_start in
      select d::date from generate_series(
        date_trunc('month',t.start_date)::date,
        date_trunc('month',least(p_until,coalesce(t.end_date,p_until)))::date,
        interval '1 month'
      ) d
    loop
      month_end := (month_start + interval '1 month - 1 day')::date;
      foreach configured_day in array t.payment_days loop
        due := month_start + (least(configured_day,extract(day from month_end)::smallint)-1)::integer;
        if due between t.start_date and least(p_until,coalesce(t.end_date,p_until)) then
          insert into public.financial_entries(
            entry_type,source,template_id,scope,business_unit,store_code,due_date,
            category,concept,beneficiary,beneficiary_document,destination_account,
            amount,status,created_by
          ) values (
            'gasto','recurrente',t.id,t.scope,t.business_unit,t.store_code,due,
            t.category,t.concept,t.beneficiary,t.beneficiary_document,t.destination_account,
            case when t.amount_mode='fijo' then t.default_amount else null end,
            'pendiente_aprobacion',t.created_by
          ) on conflict (template_id,due_date) where template_id is not null do nothing;
          if found then inserted_count := inserted_count + 1; end if;
        end if;
      end loop;
    end loop;
  end loop;
  return inserted_count;
end
$$;
revoke all on function kora_private.generate_financial_entries(date) from public, anon, authenticated;

create or replace function public.finanzas_guardar_recurrencia(
  p_id uuid,
  p_scope text,
  p_business_unit text,
  p_store_code text,
  p_category text,
  p_concept text,
  p_beneficiary text,
  p_beneficiary_document text,
  p_destination_account text,
  p_amount_mode text,
  p_default_amount numeric,
  p_payment_days smallint[],
  p_start_date date,
  p_end_date date,
  p_active boolean default true
) returns public.financial_recurring_templates
language plpgsql security definer set search_path = ''
as $$
declare v public.financial_recurring_templates%rowtype;
begin
  if not (select public.es_controlador_financiero()) then raise exception 'Solo Maite u Oscar pueden configurar obligaciones'; end if;
  if p_scope not in ('retail_store','business_general') then raise exception 'Alcance no permitido'; end if;
  if p_business_unit not in ('retail','b2b','aliados') then raise exception 'Negocio no permitido'; end if;
  if p_scope='retail_store' and (p_business_unit<>'retail' or nullif(btrim(coalesce(p_store_code,'')),'') is null) then raise exception 'Selecciona la tienda Retail'; end if;
  if p_scope='business_general' and nullif(btrim(coalesce(p_store_code,'')),'') is not null then raise exception 'Un gasto general no se asigna a una tienda'; end if;
  if p_amount_mode='fijo' and coalesce(p_default_amount,0)<=0 then raise exception 'Ingresa el valor fijo'; end if;
  if cardinality(p_payment_days) not between 1 and 2 then raise exception 'Selecciona uno o dos días de pago'; end if;
  if p_id is null then
    insert into public.financial_recurring_templates(
      scope,business_unit,store_code,category,concept,beneficiary,beneficiary_document,
      destination_account,amount_mode,default_amount,payment_days,start_date,end_date,
      active,created_by,updated_by
    ) values (
      p_scope,p_business_unit,nullif(btrim(coalesce(p_store_code,'')),''),p_category,btrim(p_concept),btrim(p_beneficiary),
      nullif(btrim(coalesce(p_beneficiary_document,'')),''),nullif(btrim(coalesce(p_destination_account,'')),''),
      p_amount_mode,p_default_amount,p_payment_days,p_start_date,p_end_date,p_active,auth.uid(),auth.uid()
    ) returning * into v;
  else
    update public.financial_recurring_templates set
      scope=p_scope,business_unit=p_business_unit,store_code=nullif(btrim(coalesce(p_store_code,'')),''),
      category=p_category,concept=btrim(p_concept),beneficiary=btrim(p_beneficiary),
      beneficiary_document=nullif(btrim(coalesce(p_beneficiary_document,'')),''),
      destination_account=nullif(btrim(coalesce(p_destination_account,'')),''),amount_mode=p_amount_mode,
      default_amount=p_default_amount,payment_days=p_payment_days,start_date=p_start_date,end_date=p_end_date,
      active=p_active,updated_by=auth.uid(),updated_at=now()
    where id=p_id returning * into v;
    if v.id is null then raise exception 'Configuración no encontrada'; end if;
  end if;
  perform kora_private.generate_financial_entries(current_date);
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
  values(auth.uid(),case when p_id is null then 'finanzas_recurrencia_creada' else 'finanzas_recurrencia_actualizada' end,
    'financial_recurring_templates',v.id,jsonb_build_object('scope',v.scope,'business_unit',v.business_unit,'store_code',v.store_code,'category',v.category,'active',v.active));
  return v;
end
$$;

create or replace function public.finanzas_generar_pendientes()
returns integer
language plpgsql security definer set search_path = ''
as $$
begin
  if not (select public.es_controlador_financiero()) then raise exception 'No autorizado'; end if;
  return kora_private.generate_financial_entries(current_date);
end
$$;

create or replace function public.finanzas_registrar_movimiento(
  p_entry_type text,
  p_business_unit text,
  p_due_date date,
  p_category text,
  p_concept text,
  p_beneficiary text,
  p_beneficiary_document text,
  p_destination_account text,
  p_amount numeric,
  p_source_period_from date default null,
  p_source_period_to date default null,
  p_note text default null
) returns public.financial_entries
language plpgsql security definer set search_path = ''
as $$
declare v public.financial_entries%rowtype;
begin
  if not (select public.es_controlador_financiero()) then raise exception 'Solo Maite u Oscar pueden registrar movimientos'; end if;
  if p_entry_type not in ('gasto','retiro_utilidad') then raise exception 'Tipo de movimiento no permitido'; end if;
  if p_business_unit not in ('retail','b2b','aliados') then raise exception 'Negocio no permitido'; end if;
  if coalesce(p_amount,0)<=0 then raise exception 'Ingresa un valor válido'; end if;
  if p_entry_type='retiro_utilidad' and (p_source_period_from is null or p_source_period_to is null or p_source_period_from>p_source_period_to) then raise exception 'Selecciona el período de origen de la utilidad'; end if;
  insert into public.financial_entries(
    entry_type,source,scope,business_unit,due_date,category,concept,beneficiary,
    beneficiary_document,destination_account,amount,source_period_from,source_period_to,
    status,note,created_by
  ) values (
    p_entry_type,'manual','business_general',p_business_unit,p_due_date,p_category,btrim(p_concept),btrim(p_beneficiary),
    nullif(btrim(coalesce(p_beneficiary_document,'')),''),nullif(btrim(coalesce(p_destination_account,'')),''),p_amount,
    p_source_period_from,p_source_period_to,'pendiente_aprobacion',nullif(btrim(coalesce(p_note,'')),''),auth.uid()
  ) returning * into v;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
  values(auth.uid(),'finanzas_movimiento_registrado','financial_entries',v.id,jsonb_build_object('entry_type',v.entry_type,'business_unit',v.business_unit,'amount',v.amount));
  return v;
end
$$;

create or replace function public.finanzas_decidir_movimiento(
  p_id uuid,
  p_decision text,
  p_amount numeric default null,
  p_note text default null
) returns public.financial_entries
language plpgsql security definer set search_path = ''
as $$
declare v public.financial_entries%rowtype;
begin
  if (select public.rol_actual()) is distinct from 'gerencia' or not (select public.es_controlador_financiero()) then
    raise exception 'Solo Oscar puede aprobar o rechazar movimientos';
  end if;
  if p_decision not in ('aprobado','rechazado') then raise exception 'Decisión no permitida'; end if;
  select * into v from public.financial_entries where id=p_id for update;
  if v.id is null or v.status<>'pendiente_aprobacion' then raise exception 'Movimiento no encontrado o ya decidido'; end if;
  if p_decision='aprobado' and coalesce(p_amount,v.amount,0)<=0 then raise exception 'Confirma el valor antes de aprobar'; end if;
  update public.financial_entries set
    amount=case when p_decision='aprobado' then coalesce(p_amount,amount) else amount end,
    status=p_decision,approved_by=auth.uid(),approved_at=now(),
    note=coalesce(nullif(btrim(coalesce(p_note,'')),''),note),updated_at=now()
  where id=p_id returning * into v;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
  values(auth.uid(),'finanzas_movimiento_'||p_decision,'financial_entries',v.id,jsonb_build_object('entry_type',v.entry_type,'business_unit',v.business_unit,'amount',v.amount));
  return v;
end
$$;

create or replace function public.finanzas_registrar_pago(p_id uuid,p_support_path text)
returns public.financial_entries
language plpgsql security definer set search_path = ''
as $$
declare v public.financial_entries%rowtype;
begin
  if not (select public.es_controlador_financiero()) then raise exception 'Solo Maite u Oscar pueden registrar el pago'; end if;
  if nullif(btrim(coalesce(p_support_path,'')),'') is null then raise exception 'Adjunta el soporte del pago'; end if;
  update public.financial_entries set status='pagado',paid_by=auth.uid(),paid_at=now(),support_path=btrim(p_support_path),updated_at=now()
  where id=p_id and status='aprobado' returning * into v;
  if v.id is null then raise exception 'El movimiento no está aprobado o ya fue pagado'; end if;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
  values(auth.uid(),'finanzas_pago_registrado','financial_entries',v.id,jsonb_build_object('entry_type',v.entry_type,'business_unit',v.business_unit,'amount',v.amount,'support_path',v.support_path));
  return v;
end
$$;

revoke all on function public.finanzas_guardar_recurrencia(uuid,text,text,text,text,text,text,text,text,text,numeric,smallint[],date,date,boolean),
  public.finanzas_generar_pendientes(),
  public.finanzas_registrar_movimiento(text,text,date,text,text,text,text,text,numeric,date,date,text),
  public.finanzas_decidir_movimiento(uuid,text,numeric,text),
  public.finanzas_registrar_pago(uuid,text)
from public, anon;
grant execute on function public.finanzas_guardar_recurrencia(uuid,text,text,text,text,text,text,text,text,text,numeric,smallint[],date,date,boolean),
  public.finanzas_generar_pendientes(),
  public.finanzas_registrar_movimiento(text,text,date,text,text,text,text,text,numeric,date,date,text),
  public.finanzas_decidir_movimiento(uuid,text,numeric,text),
  public.finanzas_registrar_pago(uuid,text)
to authenticated;

drop policy if exists soportes_finanzas_insert on storage.objects;
create policy soportes_finanzas_insert on storage.objects for insert to authenticated
with check (bucket_id='soportes' and (select public.es_controlador_financiero()) and name ~ '^finanzas/[0-9a-f-]{36}\.(pdf|jpg|jpeg|png)$');
drop policy if exists soportes_finanzas_select on storage.objects;
create policy soportes_finanzas_select on storage.objects for select to authenticated
using (bucket_id='soportes' and (select public.es_controlador_financiero()) and name ~ '^finanzas/');

do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname='kora-financial-recurring-daily';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule(
    'kora-financial-recurring-daily',
    '10 5 * * *',
    'select kora_private.generate_financial_entries((now() at time zone ''America/Bogota'')::date)'
  );
end
$$;
