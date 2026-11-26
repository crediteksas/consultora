CREATE OR REPLACE FUNCTION public.nova_allied_login_session(p_session_hash text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 select jsonb_build_object('actor_id',m.actor_id,'store_code',m.store_code,'name',m.name,'active',true)
 from public.nova_allied_login_sessions s join public.nova_allied_login_members m on m.actor_id=s.actor_id
 join public.perfiles p on p.id=m.actor_id join public.origenes o on o.codigo=m.store_code
 where s.session_hash=p_session_hash and s.revoked_at is null and s.expires_at>now()
 and m.active and p.activo and p.tienda_codigo=m.store_code and o.activo
 and m.store_code in ('distritoys','ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C','club-seven','ALIADO-5D608D3F-BDE6-45FB-B736-F5040577C63B');
$function$
