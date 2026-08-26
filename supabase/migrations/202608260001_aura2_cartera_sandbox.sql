begin;

create schema if not exists cartera;
revoke all on schema cartera from public, anon, authenticated;
grant usage on schema cartera to authenticated, service_role;

create type cartera.app_role as enum ('cartera_admin','cartera_manager','cartera_advisor','cartera_auditor','integration_kora');
create type cartera.report_status as enum ('PENDING_VALIDATION','MATCHED','MISMATCH','REJECTED');

create table cartera.customers (
  id uuid primary key default gen_random_uuid(), external_id text not null unique check (external_id ~ '^[a-z0-9_]+:.+'), name text not null, phone text,
  assigned_advisor uuid, sandbox_data boolean not null default true check (sandbox_data), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table cartera.obligations (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references cartera.customers(id), external_id text not null unique check (external_id ~ '^[a-z0-9_]+:.+'),
  platform text not null check (platform in ('payjoy','alo','addi','krediya')), store_id text not null, status text not null, balance numeric(14,2) not null check (balance >= 0), installment_amount numeric(14,2) not null check (installment_amount >= 0), due_date date,
  source_updated_at timestamptz not null, sandbox_data boolean not null default true check (sandbox_data), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table cartera.installments (
  id uuid primary key default gen_random_uuid(), obligation_id uuid not null references cartera.obligations(id) on delete cascade, external_id text not null unique, due_date date not null, amount numeric(14,2) not null, balance numeric(14,2) not null, status text not null,
  sandbox_data boolean not null default true check (sandbox_data), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table cartera.payments (
  id uuid primary key default gen_random_uuid(), obligation_id uuid not null references cartera.obligations(id), external_id text not null unique, amount numeric(14,2) not null check (amount > 0), paid_at timestamptz not null, status text not null,
  sandbox_data boolean not null default true check (sandbox_data), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table cartera.contacts (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references cartera.customers(id), obligation_id uuid references cartera.obligations(id), advisor_id uuid, channel text not null, template text, status text not null, contacted_at timestamptz,
  idempotency_key text not null unique, sandbox_data boolean not null default true check (sandbox_data), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table cartera.payment_promises (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references cartera.customers(id), obligation_id uuid not null references cartera.obligations(id), amount numeric(14,2) not null check (amount > 0), promised_date date not null, status text not null, advisor_id uuid,
  sandbox_data boolean not null default true check (sandbox_data), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table cartera.payment_reports (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references cartera.customers(id), obligation_id uuid not null references cartera.obligations(id), reported_amount numeric(14,2), reported_at timestamptz not null, evidence jsonb not null default '{}'::jsonb,
  status cartera.report_status not null default 'PENDING_VALIDATION', idempotency_key text not null unique, sandbox_data boolean not null default true check (sandbox_data), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table cartera.opt_outs (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references cartera.customers(id), scope text not null check (scope in ('COMMERCIAL','COLLECTIONS')), channel text not null, source text not null, active boolean not null default true,
  sandbox_data boolean not null default true check (sandbox_data), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(customer_id,scope,channel)
);
create table cartera.complaints (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references cartera.customers(id), obligation_id uuid references cartera.obligations(id), category text not null, status text not null, details jsonb not null default '{}'::jsonb,
  sandbox_data boolean not null default true check (sandbox_data), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table cartera.reconciliation_cases (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references cartera.customers(id), obligation_id uuid references cartera.obligations(id), payment_report_id uuid references cartera.payment_reports(id), type text not null, status text not null, evidence jsonb not null default '{}'::jsonb,
  sandbox_data boolean not null default true check (sandbox_data), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(payment_report_id)
);
create table cartera.experiment_assignments (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references cartera.customers(id), experiment_key text not null, assignment text not null, assigned_at timestamptz not null default now(),
  sandbox_data boolean not null default true check (sandbox_data), created_at timestamptz not null default now(), unique(customer_id,experiment_key)
);
create table cartera.audit_events (
  id uuid primary key default gen_random_uuid(), actor_id uuid, actor_role text, event_type text not null, entity_type text not null, entity_id uuid, payload jsonb not null default '{}'::jsonb, trace_id text not null,
  sandbox_data boolean not null default true check (sandbox_data), created_at timestamptz not null default now()
);

create index obligations_customer_idx on cartera.obligations(customer_id);
create index obligations_due_status_idx on cartera.obligations(due_date,status);
create index installments_obligation_idx on cartera.installments(obligation_id);
create index payments_obligation_paid_idx on cartera.payments(obligation_id,paid_at desc);
create index contacts_customer_time_idx on cartera.contacts(customer_id,contacted_at desc);
create index promises_customer_status_idx on cartera.payment_promises(customer_id,status);
create index reports_status_time_idx on cartera.payment_reports(status,reported_at desc);
create index opt_outs_customer_active_idx on cartera.opt_outs(customer_id,active);
create index reconciliation_status_idx on cartera.reconciliation_cases(status,created_at);
create index audit_trace_idx on cartera.audit_events(trace_id,created_at);

create function cartera.claim_role() returns text language sql stable as $$ select coalesce(auth.jwt()->'app_metadata'->>'cartera_role','') $$;
create function cartera.is_admin() returns boolean language sql stable as $$ select cartera.claim_role()='cartera_admin' $$;
create function cartera.can_read() returns boolean language sql stable as $$ select cartera.claim_role() in ('cartera_admin','cartera_manager','cartera_auditor') $$;
create function cartera.can_manage() returns boolean language sql stable as $$ select cartera.claim_role() in ('cartera_admin','cartera_manager') $$;
create function cartera.is_integration() returns boolean language sql stable as $$ select cartera.claim_role()='integration_kora' $$;
create function cartera.is_assigned(customer uuid) returns boolean language sql stable as $$ select cartera.claim_role()='cartera_advisor' and exists(select 1 from cartera.customers c where c.id=customer and c.assigned_advisor=auth.uid()) $$;

do $$ declare t text; begin
  foreach t in array array['customers','obligations','installments','payments','contacts','payment_promises','payment_reports','opt_outs','complaints','reconciliation_cases','experiment_assignments','audit_events'] loop
    execute format('alter table cartera.%I enable row level security',t);
    execute format('create policy %I on cartera.%I for select to authenticated using (cartera.can_read())','read_'||t,t);
    execute format('create policy %I on cartera.%I for all to authenticated using (cartera.can_manage()) with check (cartera.can_manage())','manage_'||t,t);
  end loop;
end $$;

create policy advisor_customers on cartera.customers for select to authenticated using (cartera.is_assigned(id));
create policy advisor_obligations on cartera.obligations for select to authenticated using (cartera.is_assigned(customer_id));
create policy advisor_contacts on cartera.contacts for all to authenticated using (cartera.is_assigned(customer_id)) with check (cartera.is_assigned(customer_id));
create policy advisor_promises on cartera.payment_promises for all to authenticated using (cartera.is_assigned(customer_id)) with check (cartera.is_assigned(customer_id));
create policy advisor_reports on cartera.payment_reports for all to authenticated using (cartera.is_assigned(customer_id)) with check (cartera.is_assigned(customer_id));
create policy advisor_installments on cartera.installments for select to authenticated using (exists(select 1 from cartera.obligations o where o.id=obligation_id and cartera.is_assigned(o.customer_id)));
create policy advisor_payments on cartera.payments for select to authenticated using (exists(select 1 from cartera.obligations o where o.id=obligation_id and cartera.is_assigned(o.customer_id)));
create policy advisor_opt_outs on cartera.opt_outs for select to authenticated using (cartera.is_assigned(customer_id));
create policy advisor_complaints on cartera.complaints for all to authenticated using (cartera.is_assigned(customer_id)) with check (cartera.is_assigned(customer_id));
create policy advisor_reconciliation on cartera.reconciliation_cases for select to authenticated using (cartera.is_assigned(customer_id));

create policy integration_customers on cartera.customers for all to authenticated using (cartera.is_integration()) with check (cartera.is_integration());
create policy integration_obligations on cartera.obligations for all to authenticated using (cartera.is_integration()) with check (cartera.is_integration());
create policy integration_installments on cartera.installments for all to authenticated using (cartera.is_integration()) with check (cartera.is_integration());
create policy integration_payments on cartera.payments for all to authenticated using (cartera.is_integration()) with check (cartera.is_integration());

grant select,insert,update,delete on all tables in schema cartera to authenticated, service_role;
grant usage,select on all sequences in schema cartera to authenticated, service_role;

create function cartera.create_payment_report(p_customer uuid,p_obligation uuid,p_amount numeric,p_evidence jsonb,p_idempotency text)
returns uuid language plpgsql security definer set search_path=cartera,public as $$
declare report_id uuid;
begin
  if not (cartera.can_manage() or cartera.is_assigned(p_customer)) then
    raise exception 'cartera payment report access denied' using errcode='42501';
  end if;
  if not exists(select 1 from cartera.obligations where id=p_obligation and customer_id=p_customer) then
    raise exception 'obligation does not belong to customer' using errcode='23503';
  end if;
  insert into cartera.payment_reports(customer_id,obligation_id,reported_amount,reported_at,evidence,idempotency_key)
  values(p_customer,p_obligation,p_amount,now(),coalesce(p_evidence,'{}'::jsonb),p_idempotency)
  on conflict(idempotency_key) do update set idempotency_key=excluded.idempotency_key returning id into report_id;
  insert into cartera.reconciliation_cases(customer_id,obligation_id,payment_report_id,type,status,evidence)
  values(p_customer,p_obligation,report_id,'CUSTOMER_REPORTED_PAYMENT','OPEN',coalesce(p_evidence,'{}'::jsonb))
  on conflict do nothing;
  insert into cartera.audit_events(event_type,entity_type,entity_id,payload,trace_id)
  values('PAYMENT_REPORT_CREATED','payment_report',report_id,jsonb_build_object('balance_changed',false),'payment-report:'||report_id);
  return report_id;
end $$;
revoke all on function cartera.create_payment_report(uuid,uuid,numeric,jsonb,text) from public,anon;
grant execute on function cartera.create_payment_report(uuid,uuid,numeric,jsonb,text) to authenticated,service_role;

create function cartera.audit_sensitive_change() returns trigger language plpgsql security definer set search_path=cartera,public as $$
declare entity uuid; event_name text; trace text;
begin
  entity := coalesce(new.id,old.id);
  event_name := upper(tg_table_name)||'_'||tg_op;
  trace := coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-trace-id',event_name||':'||entity::text);
  insert into cartera.audit_events(actor_id,actor_role,event_type,entity_type,entity_id,payload,trace_id)
  values(auth.uid(),cartera.claim_role(),event_name,tg_table_name,entity,
    jsonb_build_object('operation',tg_op,'sandbox',true),trace);
  return coalesce(new,old);
end $$;

create trigger audit_obligation_balance after update of balance on cartera.obligations for each row when (old.balance is distinct from new.balance) execute function cartera.audit_sensitive_change();
create trigger audit_payment_status after insert or update of status on cartera.payments for each row execute function cartera.audit_sensitive_change();
create trigger audit_promise after insert or update or delete on cartera.payment_promises for each row execute function cartera.audit_sensitive_change();
create trigger audit_opt_out after insert or update or delete on cartera.opt_outs for each row execute function cartera.audit_sensitive_change();
create trigger audit_reconciliation after insert or update on cartera.reconciliation_cases for each row execute function cartera.audit_sensitive_change();
create trigger audit_contact after insert or update of status on cartera.contacts for each row execute function cartera.audit_sensitive_change();

commit;
