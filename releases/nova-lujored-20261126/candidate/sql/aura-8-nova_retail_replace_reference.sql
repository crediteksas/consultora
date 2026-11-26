CREATE OR REPLACE FUNCTION public.nova_retail_replace_reference(p_source uuid, p_old uuid, p_new uuid, p_hash text, p_customer_hash text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r public.nova_reference_verifications; d public.nova_reference_dialogues; delivered public.nova_retail_reference_dispatch; personal_is_family boolean;
begin
 select * into strict r from public.nova_reference_verifications where id=p_old for update;
 if r.superseded_at is not null or (p_hash ~ '^[a-f0-9]{64}$') is not true or p_hash in (r.contact_hash,p_customer_hash) then raise exception 'INVALID_REPLACEMENT';end if;
 if not exists(select 1 from public.nova_registration_receipts s join public.nova_credit_applications a on a.id=s.application_id where s.application_id=r.application_id and s.source_application_id=p_source and a.store_code ~ '^(CK-0[1-9]|distritoys|club-seven|ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C|ALIADO-5D608D3F-BDE6-45FB-B736-F5040577C63B)$') then raise exception 'OUT_OF_SCOPE';end if;
 select * into d from public.nova_reference_dialogues where reference_id=p_old;
 select * into delivered from public.nova_retail_reference_dispatch where reference_id=p_old;
 personal_is_family := coalesce(
   r.reference_type = 'personal' AND d.status = 'completed'
   AND d.outcome = 'response_collected' AND d.contact_hash = r.contact_hash
   AND d.state #> '{answers,knows}' = 'true'::jsonb
   AND d.state #> '{answers,contact_confirmed}' = 'true'::jsonb
   AND d.state #>> '{answers,relationship}' = 'family', false);
 if (d.status='completed' and not personal_is_family) or d.outcome='does_not_know' then raise exception 'REVIEW_REQUIRED';end if;
 if (personal_is_family or coalesce(d.status='declined',false) or coalesce(delivered.delivered_at<=now()-interval '10 minutes',false) or coalesce(delivered.state='failed' and delivered.attempts>=5,false) or exists(select 1 from public.nova_reference_dialogues x where x.contact_hash=r.contact_hash and x.status='declined')) is not true then raise exception 'WAIT_FOR_REFERENCE';end if;
 if exists(select 1 from public.nova_reference_verifications where application_id=r.application_id and superseded_at is null and contact_hash=p_hash) then raise exception 'DUPLICATE_REFERENCE';end if;
 if exists(select 1 from public.nova_reference_dialogues where contact_hash=p_hash and status='declined') then raise exception 'CONTACT_DECLINED';end if;
 update public.nova_reference_verifications set superseded_at=now(),updated_at=now() where id=p_old;
 update public.nova_reference_dialogues set status='stopped',updated_at=now() where reference_id=p_old and status='active';
 update public.nova_retail_reference_dispatch set state='cancelled',updated_at=now() where reference_id=p_old and state in ('sending','accepted','sent','failed');
 insert into public.nova_reference_verifications(id,application_id,reference_type,contact_hash,consent_status,verification_status,attempts) values(p_new,r.application_id,r.reference_type,p_hash,'pending','pending',0);
 return p_new;
end $function$
