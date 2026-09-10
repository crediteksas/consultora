-- Snapshot informativo al finalizar la importación. No recalcula, autoriza ni paga.
create table public.krediya_import_reports (
 liquidation_id uuid primary key references public.liquidations(id) on delete cascade,
 created_at timestamptz not null default now(),
 contexts jsonb not null default '[]'::jsonb,
 operation_count integer not null default 0,
 recipients text[] not null default array['gestion@crediteksas.com','comercial@crediteksas.com'],
 report_status text not null default 'preparado' check (report_status in ('preparado','error')),
 email_status text not null default 'sin_configurar' check (email_status in ('sin_configurar','pendiente','enviado','error')),
 email_sent_at timestamptz,
 provider_message_id text,
 error_code text,
 check (email_status <> 'enviado' or (email_sent_at is not null and provider_message_id is not null))
);
alter table public.krediya_import_reports enable row level security;
revoke all on public.krediya_import_reports from public, anon, authenticated;
grant select on public.krediya_import_reports to authenticated;
grant all on public.krediya_import_reports to service_role;
create policy krediya_import_report_read on public.krediya_import_reports
 for select to authenticated using ((select public.tiene_capacidad_aliados('revisor')));

create or replace function kora_private.capture_krediya_import_report()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_contexts jsonb; v_count integer;
begin
 if new.event_type <> 'liquidation.imported' or not exists (
  select 1 from public.liquidations where id=new.aggregate_id and plataforma='krediya'
 ) then return new; end if;
 -- Import RPC has already persisted every source row and operation at this point.
 -- Uses the SAME context resolver as liquidation (sale date, original PVP, PAGAMOS).
 begin
  select coalesce(jsonb_agg(public.aliados_contexto_precio_krediya(o.id)
    || jsonb_build_object('credito',o.external_id) order by o.operation_at,o.id),'[]'::jsonb),count(*)
   into v_contexts,v_count from public.liquidation_operations o
   where o.liquidation_id=new.aggregate_id and o.plataforma='krediya';
  insert into public.krediya_import_reports(liquidation_id,contexts,operation_count)
   values(new.aggregate_id,v_contexts,v_count) on conflict (liquidation_id) do nothing;
 exception when others then
  -- An unavailable report must NOT roll back the import. Record failure explicitly.
  begin
   insert into public.krediya_import_reports(liquidation_id,report_status,error_code)
    values(new.aggregate_id,'error',sqlstate) on conflict (liquidation_id) do nothing;
  exception when others then
   raise warning 'Krediya report pending for lot %, SQLSTATE %',new.aggregate_id,sqlstate;
  end;
 end;
 return new;
end $$;
revoke all on function kora_private.capture_krediya_import_report() from public,anon,authenticated;
create trigger capture_krediya_import_report after insert on public.liquidation_domain_events
 for each row when (new.event_type='liquidation.imported')
 execute function kora_private.capture_krediya_import_report();

-- Price differences are commercial follow-up, never approval gates.
-- Do not disguise a missing PAGAMOS/tariff as a known price or invent money.
create or replace function kora_private.krediya_pvp_followup_only()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
 if new.tipo='krediya_precio_venta_diferente' and exists (
  select 1 from public.liquidations where id=new.liquidation_id and plataforma='krediya'
 ) then new.bloquea_aprobacion:=false; end if;
 return new;
end $$;
revoke all on function kora_private.krediya_pvp_followup_only() from public,anon,authenticated;
create trigger krediya_pvp_followup_only before insert or update on public.liquidation_incidents
 for each row execute function kora_private.krediya_pvp_followup_only();
-- No backfill: previous imports, authorizations, amounts and payments stay untouched.
