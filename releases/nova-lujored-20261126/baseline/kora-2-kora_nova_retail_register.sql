CREATE OR REPLACE FUNCTION public.kora_nova_retail_register(p_registration jsonb, p_consent jsonb, p_photo_subject text, p_photo_hashes jsonb)
 RETURNS TABLE(cliente_id uuid, solicitud_id uuid)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r public.nova_retail_photo_reviews; prior public.kora_nova_sources; v_cid uuid;
begin
 if (p_registration->>'p_origen_codigo' ~ '^(CK-0[1-9]|distritoys|club-seven|ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C)$') is not true then raise exception 'OUTSIDE_PILOT';end if;
 perform pg_advisory_xact_lock(hashtextextended('nova-retail-registration:'||(p_registration->>'p_cedula'),0));
 select * into prior from public.kora_nova_sources where otp_id=(p_registration->>'p_otp_id')::uuid;
 if found then return query select * from public.kora_nova_register(p_registration,p_consent);return;end if;
 select id into v_cid from public.clientes where cedula=p_registration->>'p_cedula';
 if exists(select 1 from public.kora_nova_sources s left join public.nova_retail_cases c on c.source_id=s.solicitud_id where s.cliente_id=v_cid and s.registration->>'p_origen_codigo'=p_registration->>'p_origen_codigo' and s.revoked_at is null and c.delivered_at is null) then raise exception 'RESUME_EXISTING_APPLICATION';end if;
 select * into strict r from public.nova_retail_photo_reviews where otp_id=(p_registration->>'p_otp_id')::uuid for share;
 if r.subject_hash is distinct from p_photo_subject or r.hashes is distinct from p_photo_hashes or exists(select 1 from unnest(array['frente','reverso','selfie']) t where (r.results->t->>'status' in ('auto_approved','manual_pending')) is not true) then raise exception 'PHOTO_REVIEW_REQUIRED';end if;
 return query select * from public.kora_nova_register(p_registration,p_consent);
end $function$
