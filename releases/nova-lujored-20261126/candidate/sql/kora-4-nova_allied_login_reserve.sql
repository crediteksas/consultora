CREATE OR REPLACE FUNCTION public.nova_allied_login_reserve(p_phone text, p_challenge_id uuid, p_code_hash text, p_ip_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare member public.nova_allied_login_members;
begin
 if p_phone !~ '^3[0-9]{9}$' or p_code_hash !~ '^[a-f0-9]{64}$' or p_ip_hash !~ '^[a-f0-9]{64}$'
 or p_phone is null or p_challenge_id is null or p_code_hash is null or p_ip_hash is null then raise exception 'INVALID_INPUT';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nova-allied-ip:'||p_ip_hash,0));
 if (select count(*) from public.nova_allied_login_challenges where ip_hash=p_ip_hash and created_at>now()-interval '1 hour')>=20
 then return '{"send":false}'::jsonb;end if;
 select m.* into member from public.nova_allied_login_members m
 join public.perfiles p on p.id=m.actor_id
 join public.origenes o on o.codigo=m.store_code
 where m.phone=p_phone and m.active and p.activo and p.tienda_codigo=m.store_code and o.activo
 and m.store_code in ('distritoys','ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C','club-seven','ALIADO-5D608D3F-BDE6-45FB-B736-F5040577C63B')
 for update of m;
 if not found then return '{"send":false}'::jsonb;end if;
 if exists(select 1 from public.nova_allied_login_challenges where actor_id=member.actor_id and created_at>now()-interval '1 minute')
 or (select count(*) from public.nova_allied_login_challenges where actor_id=member.actor_id and created_at>now()-interval '1 hour')>=5
 then return '{"send":false}'::jsonb;end if;
 insert into public.nova_allied_login_challenges(id,actor_id,ip_hash,code_hash) values(p_challenge_id,member.actor_id,p_ip_hash,p_code_hash);
 return '{"send":true}'::jsonb;
end;$function$
