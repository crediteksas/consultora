-- Extensión aditiva para adjuntar evidencia privada a comentarios.
begin;

create or replace function public.kora_attach_incident_comment_evidence(
  p_comment_id uuid,
  p_path text,
  p_name text,
  p_mime text,
  p_size bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_comment public.kora_incident_comments%rowtype;
  v_incident public.kora_incidents%rowtype;
begin
  select * into v_comment
  from public.kora_incident_comments
  where id = p_comment_id
  for update;
  select * into v_incident
  from public.kora_incidents
  where id = v_comment.incident_id;

  if v_comment.id is null
     or not public.kora_incident_can_view(v_incident)
     or not (v_comment.author_user_id = auth.uid()
       or public.kora_incident_has_permission('incident_admin')) then
    raise exception 'No autorizado para adjuntar evidencia al comentario';
  end if;
  if p_path !~ ('^' || v_incident.id::text || '/[0-9a-f-]{36}\.(png|jpg|jpeg|webp|pdf)$')
     or p_mime not in ('image/png', 'image/jpeg', 'image/webp', 'application/pdf')
     or p_size is null or p_size < 1 or p_size > 10485760 then
    raise exception 'La evidencia del comentario no es válida';
  end if;

  update public.kora_incident_comments
  set evidence_path = p_path,
      evidence_name = public.kora_sanitize_incident_text(p_name, 240),
      evidence_mime = p_mime,
      evidence_size = p_size
  where id = p_comment_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.kora_attach_incident_comment_evidence(uuid, text, text, text, bigint)
  from public, anon;
grant execute on function public.kora_attach_incident_comment_evidence(uuid, text, text, text, bigint)
  to authenticated;

commit;
