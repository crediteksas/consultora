CREATE OR REPLACE FUNCTION public.nova_retail_candidates()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 select coalesce(jsonb_agg(source_id),'[]'::jsonb) from (
 select s.solicitud_id source_id from public.kora_nova_sources s left join public.nova_retail_cases c on c.source_id=s.solicitud_id
 where s.registration->>'p_origen_codigo' ~ '^(CK-0[1-9]|distritoys|club-seven|ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C|ALIADO-5D608D3F-BDE6-45FB-B736-F5040577C63B)$' and s.revoked_at is null and c.delivered_at is null
 and (c.source_id is null or c.state in ('review','waiting','correct'))
 and coalesce(c.renewed_at,s.submitted_at)>now()-interval '45 days'
 order by c.last_checked_at asc nulls first,s.submitted_at desc limit 30
 ) q;
$function$
