CREATE OR REPLACE FUNCTION public.kora_nova_supervision(p_reviewer uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare result jsonb; total integer;
begin
  -- p_reviewer is provided by the server only, after verification with Auth.
  -- Re-check the current active profile and origin on every read.
  if not exists(select 1 from public.kora_nova_reviewers a
    join public.perfiles p on p.id=a.user_id
    join public.origenes o on o.codigo=a.origin_code
    where a.user_id=p_reviewer and a.active=true and p.activo=true and p.rol=a.expected_role
      and (p.rol='gerencia' or p.tienda_codigo=a.origin_code) and o.activo=true)
  then raise exception 'REVIEW_FORBIDDEN' using errcode='42501'; end if;

  select count(*) into total from public.kora_nova_sources s
    join public.kora_nova_reviewers a on a.user_id=p_reviewer and a.active=true
      and a.origin_code=s.registration->>'p_origen_codigo' and s.submitted_at>=a.accept_from
    join public.perfiles p on p.id=a.user_id and p.activo=true and p.rol=a.expected_role
      and (p.rol='gerencia' or p.tienda_codigo=a.origin_code)
    join public.origenes o on o.codigo=a.origin_code and o.activo=true;
  if total>1000 then raise exception 'PAGINATION_REQUIRED';end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.solicitud_id,
    'customer_label',case when s.revoked_at is not null or c.autorizacion_datos is not true
      then 'Solicitud con autorización revocada' else s.registration->>'p_nombre_completo' end,
    'city',case when s.revoked_at is not null or c.autorizacion_datos is not true
      then 'No disponible' else s.registration->>'p_ciudad' end,
    'origin_label',o.nombre,
    'updated_at',coalesce(s.revoked_at,b.delivered_at,s.submitted_at),
    'consent',case when s.revoked_at is not null or c.autorizacion_datos is not true then 'revoked' else 'verified' end,
    'documents',jsonb_build_object('received',(select count(distinct d.tipo) from public.documentos_solicitud d
      where d.solicitud_id=s.solicitud_id and d.cliente_id=s.cliente_id and d.tipo in ('frente','reverso','selfie')
      and exists(select 1 from storage.objects obj where obj.bucket_id='cedulas' and obj.name=d.storage_path)),'required',3),
    'references',jsonb_build_object('registered',jsonb_array_length(s.registration->'p_referencias'),'required',2,'verified',0),
    'delivery_state',coalesce(b.state,'incomplete'),'nova_application_id',b.application_id
  ) order by s.submitted_at desc),'[]'::jsonb) into result
  from public.kora_nova_sources s join public.clientes c on c.id=s.cliente_id
  join public.kora_nova_reviewers a on a.user_id=p_reviewer and a.active=true
    and a.origin_code=s.registration->>'p_origen_codigo' and s.submitted_at>=a.accept_from
  join public.perfiles p on p.id=a.user_id and p.activo=true and p.rol=a.expected_role
    and (p.rol='gerencia' or p.tienda_codigo=a.origin_code)
  join public.origenes o on o.codigo=a.origin_code and o.activo=true
  left join public.kora_nova_outbox b on b.solicitud_id=s.solicitud_id;
  return jsonb_build_object('requests',result,'complete',true,'scope_label','Piloto Móvil Shopping · CK-02');
end;$function$
