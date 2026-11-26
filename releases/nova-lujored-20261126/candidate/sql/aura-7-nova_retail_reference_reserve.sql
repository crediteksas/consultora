CREATE OR REPLACE FUNCTION public.nova_retail_reference_reserve(p_reference uuid, p_source uuid, p_contact_hash text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare attempt uuid:=gen_random_uuid();saved uuid;
begin
 if not exists(select 1 from public.nova_reference_verifications r join public.nova_registration_receipts s on s.application_id=r.application_id join public.nova_credit_applications a on a.id=r.application_id where r.id=p_reference and r.superseded_at is null and not exists(select 1 from public.nova_reference_dialogues x where x.contact_hash=p_contact_hash and x.status='declined') and s.source_application_id=p_source and a.store_code ~ '^(CK-0[1-9]|distritoys|club-seven|ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C|ALIADO-5D608D3F-BDE6-45FB-B736-F5040577C63B)$' and r.contact_hash=p_contact_hash and r.consent_status='pending' and r.verification_status='pending' and not exists(select 1 from public.nova_reference_dialogues d where d.reference_id=r.id)) then return null;end if;
 insert into public.nova_retail_reference_dispatch(reference_id,source_id,contact_hash,attempt_id,state) values(p_reference,p_source,p_contact_hash,attempt,'sending')
 on conflict(reference_id) do update set attempt_id=excluded.attempt_id,state='sending',attempts=nova_retail_reference_dispatch.attempts+1,updated_at=now(),provider_message_id=null,error_code=null
 where nova_retail_reference_dispatch.state='failed' and nova_retail_reference_dispatch.attempts<5 and nova_retail_reference_dispatch.next_attempt_at<=now() and nova_retail_reference_dispatch.delivered_at is null
 returning attempt_id into saved;
 if saved is not null then insert into public.nova_retail_reference_dispatch_events(reference_id,status) values(p_reference,'sending');end if;
 return saved;
end $function$
