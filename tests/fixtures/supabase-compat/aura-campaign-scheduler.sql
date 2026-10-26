-- Service-only scheduler. Existing consent, customer and campaign permissions are untouched.
create table public.sofia_campaign_schedule_v1 (
 campaign_id uuid primary key references public.sofia_campaigns(id),
 state text not null default 'armed' check(state in ('armed','running','completed','blocked','expired')),
 scheduled_at timestamptz not null, expires_at timestamptz not null,
 audience_size integer not null check(audience_size between 1 and 38), audience_hash text not null,
 template_id text not null check(template_id ~ '^[0-9]+$'), template_name text not null,
 template_language text not null, body_text text not null, approval_ref text not null,
 last_reason text, checked_at timestamptz, created_at timestamptz not null default now(),
 check(expires_at > scheduled_at and expires_at <= scheduled_at + interval '10 minutes'),
 check(mod(extract(epoch from scheduled_at),1800)=0)
);
alter table public.sofia_campaign_schedule_v1 enable row level security;
revoke all on public.sofia_campaign_schedule_v1 from public, anon, authenticated;
grant select, insert, update on public.sofia_campaign_schedule_v1 to service_role;

create function public.sofia_campaign_contact_eligible_v1(p_cliente uuid, p_phone text)
returns boolean language sql stable security invoker set search_path = '' as $$
 select exists(select 1 from public.clientes c where c.id=p_cliente
 and p_phone ~ '^57[0-9]{10}$' and regexp_replace(c.telefono,'[^0-9]','','g')=p_phone
 and c.optin_datos is true and c.optin_comercial is true and c.optin_whatsapp is true
 and c.optin_fecha is not null and nullif(c.optin_version,'') is not null and nullif(c.optin_canal,'') is not null
 and exists(select 1 from public.sofia_consent_events e
  where regexp_replace(e.telefono,'[^0-9]','','g')=p_phone and e.source_message_id=c.optin_evidence_id
  and e.purpose='comercial_whatsapp' and e.decision='granted')
 and (select e.decision from public.sofia_consent_events e
  where regexp_replace(e.telefono,'[^0-9]','','g')=p_phone and e.purpose='comercial_whatsapp'
  order by e.occurred_at desc,e.created_at desc,e.id desc limit 1)='granted'
 and not exists(select 1 from public.sofia_campaign_suppressions s
  where s.active and regexp_replace(s.telefono,'[^0-9]','','g')=p_phone));
$$;

create function public.sofia_campaign_integrity_v1(p_campaign uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
 select exists(select 1 from public.sofia_campaign_schedule_v1 j
 join public.sofia_campaigns c on c.id=j.campaign_id
 where j.campaign_id=p_campaign and j.state in ('armed','running')
 and c.status in ('scheduled','running') and c.approved_at is not null
 and c.scheduled_at=j.scheduled_at and c.template_name=j.template_name
 and c.template_language=j.template_language and c.header_media_url is null
 and c.template_meta_status='approved' and length(j.approval_ref)>0
 and (select count(*) from public.sofia_campaign_recipients r where r.campaign_id=p_campaign)=j.audience_size
 and (select md5(string_agg(r.id::text||':'||r.cliente_id::text||':'||r.telefono,',' order by r.telefono))
  from public.sofia_campaign_recipients r where r.campaign_id=p_campaign)=j.audience_hash);
$$;

create function public.sofia_campaign_send_allowed_v1(p_recipient uuid)
returns boolean language sql volatile security invoker set search_path = '' as $$
 select exists(select 1 from public.sofia_campaign_recipients r
 join public.sofia_campaign_schedule_v1 j on j.campaign_id=r.campaign_id
 where r.id=p_recipient and r.send_status='queued' and r.eligibility_status='eligible'
 and clock_timestamp()>=j.scheduled_at and clock_timestamp()<j.expires_at
 and public.sofia_campaign_integrity_v1(j.campaign_id)
 and public.sofia_campaign_contact_eligible_v1(r.cliente_id,r.telefono));
$$;

create function public.sofia_campaign_claim_v1(p_recipient uuid)
returns table(id uuid, telefono text) language plpgsql security invoker set search_path = '' as $$
declare j public.sofia_campaign_schedule_v1; r public.sofia_campaign_recipients;
begin
 select s.* into j from public.sofia_campaign_schedule_v1 s
 join public.sofia_campaign_recipients x on x.campaign_id=s.campaign_id
 where x.id=p_recipient for update of s;
 if not found or clock_timestamp()<j.scheduled_at or clock_timestamp()>=j.expires_at
  or not public.sofia_campaign_integrity_v1(j.campaign_id) then return; end if;
 select x.* into r from public.sofia_campaign_recipients x where x.id=p_recipient for update;
 if r.send_status<>'pending' then return; end if;
 if r.eligibility_status<>'eligible' or not public.sofia_campaign_contact_eligible_v1(r.cliente_id,r.telefono) then
  update public.sofia_campaign_recipients x set send_status='suppressed',exclusion_reason='consent_not_current'
  where x.id=r.id; return;
 end if;
 update public.sofia_campaign_schedule_v1 s set state='running',checked_at=clock_timestamp() where s.campaign_id=j.campaign_id;
 update public.sofia_campaign_recipients x set send_status='queued',queued_at=clock_timestamp() where x.id=r.id;
 return query select r.id,r.telefono;
end;
$$;

create function public.sofia_campaign_finish_v1(p_campaign uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
 perform 1 from public.sofia_campaign_schedule_v1 where campaign_id=p_campaign for update;
 if exists(select 1 from public.sofia_campaign_recipients where campaign_id=p_campaign and send_status in ('pending','queued')) then return false; end if;
 update public.sofia_campaign_schedule_v1 set state='completed',last_reason='attempts_processed_check_receipts',checked_at=clock_timestamp()
 where campaign_id=p_campaign and state in ('armed','running');
 if not found then return false; end if;
 update public.sofia_campaigns set status='completed',updated_at=clock_timestamp() where id=p_campaign;
 return true;
end;
$$;
revoke all on function public.sofia_campaign_contact_eligible_v1(uuid,text) from public,anon,authenticated;
revoke all on function public.sofia_campaign_integrity_v1(uuid) from public,anon,authenticated;
revoke all on function public.sofia_campaign_send_allowed_v1(uuid) from public,anon,authenticated;
revoke all on function public.sofia_campaign_claim_v1(uuid) from public,anon,authenticated;
revoke all on function public.sofia_campaign_finish_v1(uuid) from public,anon,authenticated;
grant execute on function public.sofia_campaign_contact_eligible_v1(uuid,text) to service_role;
grant execute on function public.sofia_campaign_integrity_v1(uuid) to service_role;
grant execute on function public.sofia_campaign_send_allowed_v1(uuid) to service_role;
grant execute on function public.sofia_campaign_claim_v1(uuid) to service_role;
grant execute on function public.sofia_campaign_finish_v1(uuid) to service_role;
