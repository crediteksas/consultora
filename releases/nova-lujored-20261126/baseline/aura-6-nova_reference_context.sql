CREATE OR REPLACE FUNCTION public.nova_reference_context(p_reference_id uuid, p_contact_hash text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 select jsonb_build_object('reference_id',r.id,'application_id',r.application_id,'reference_type',r.reference_type,
 'contact_hash',r.contact_hash,'source_application_id',receipt.source_application_id,'payload_hash',receipt.payload_hash,
 'received_at',receipt.received_at,'dialogue',to_jsonb(d))
 from public.nova_reference_verifications r
 join public.nova_credit_applications a on a.id=r.application_id
 join public.nova_registration_receipts receipt on receipt.application_id=a.id
 left join public.nova_reference_dialogues d on d.reference_id=r.id
 where r.id=p_reference_id and r.contact_hash=p_contact_hash and a.store_code ~ '^(CK-0[1-9]|distritoys|club-seven|ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C)$' and r.superseded_at is null and a.data_consent_granted is true;
$function$
