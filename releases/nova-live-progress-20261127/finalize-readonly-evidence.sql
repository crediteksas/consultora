CREATE OR REPLACE FUNCTION public.kora_nova_finalize(p_solicitud_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare e public.kora_nova_outbox; snap jsonb; ready timestamptz;
begin
  if not exists(select 1 from public.kora_nova_sources where solicitud_id=p_solicitud_id) then
    return jsonb_build_object('queued',false,'reason','legacy_registration');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('kora-nova-source:'||p_solicitud_id::text,0));
  select * into e from public.kora_nova_outbox where solicitud_id=p_solicitud_id for update;
  ready:=coalesce((e.snapshot->>'ready_at')::timestamptz,now());
  snap:=public.kora_nova_snapshot(p_solicitud_id,ready);
  if snap is null then return jsonb_build_object('queued',false,'reason','source_incomplete_or_unavailable');end if;
  if e.solicitud_id is not null then
    if snap is distinct from e.snapshot then return jsonb_build_object('queued',false,'reason','source_changed');end if;
    return jsonb_build_object('queued',true,'state',e.state);
  end if;
  insert into public.kora_nova_outbox(solicitud_id,snapshot,snapshot_hash) values(p_solicitud_id,snap,encode(sha256(convert_to(snap::text,'UTF8')),'hex'));
  return jsonb_build_object('queued',true,'state','pending');
end;$function$
