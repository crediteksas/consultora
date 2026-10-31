-- KORA only. Local review candidate; production application is a separate action.
-- Immutable WhatsApp acceptance binding plus a monotone projection of signed
-- delivery events. No resends, historical backfill, quota/guard relaxation,
-- consent changes, or OTP/code/photo deletion is performed by this migration.
begin;
set local lock_timeout = '5s';

create table public.nova_otp_delivery_receipts (
  otp_id uuid primary key references public.otp_codigos(id),
  provider_message_id text not null unique
    check (provider_message_id ~ '^wamid\.[A-Za-z0-9._=:/+-]{1,190}$'),
  state text not null default 'accepted'
    check (state in ('accepted','sent','delivered','read','failed')),
  accepted_at timestamptz not null,
  event_at timestamptz not null,
  error_code text null check (error_code ~ '^[0-9]{1,16}$'),
  checked_at timestamptz not null default now()
);
alter table public.nova_otp_delivery_receipts enable row level security;
revoke all on public.nova_otp_delivery_receipts from public, anon, authenticated, service_role;
grant select, insert, update on public.nova_otp_delivery_receipts to service_role;
comment on table public.nova_otp_delivery_receipts is
  'Backend-only exact OTP/wamid binding; API acceptance and signed delivery are separate. Does not authorize or send a retry.';

create function public.nova_otp_delivery_binding_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.otp_id is distinct from old.otp_id
      or new.provider_message_id is distinct from old.provider_message_id
      or new.accepted_at is distinct from old.accepted_at then
    raise exception 'OTP_DELIVERY_BINDING_IMMUTABLE';
  end if;
  return new;
end;
$$;
revoke all on function public.nova_otp_delivery_binding_guard() from public, anon, authenticated;
grant execute on function public.nova_otp_delivery_binding_guard() to service_role;
create trigger nova_otp_delivery_binding_guard before update
on public.nova_otp_delivery_receipts for each row
execute function public.nova_otp_delivery_binding_guard();

create function public.nova_otp_delivery_register(
  p_otp_id uuid, p_cedula text, p_celular text,
  p_enlace_registro_id uuid, p_provider_message_id text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare o public.otp_codigos; r public.nova_otp_delivery_receipts; accepted timestamptz;
begin
  if (p_otp_id is not null and p_enlace_registro_id is not null
      and p_cedula ~ '^[0-9]{6,12}$' and p_celular ~ '^3[0-9]{9}$'
      and p_provider_message_id ~ '^wamid\.[A-Za-z0-9._=:/+-]{1,190}$') is not true then
    raise exception 'OTP_DELIVERY_INPUT_INVALID';
  end if;
  perform 1 from public.enlaces_registro l join public.origenes x on x.codigo = l.origen_codigo
    where l.id = p_enlace_registro_id and l.activo and l.revoked_at is null and x.activo;
  if not found then raise exception 'OTP_LINK_NOT_ACTIVE'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('otp:celular:' || p_celular, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('otp:enlace:' || p_enlace_registro_id::text, 0));
  select * into o from public.otp_codigos where id = p_otp_id
    and cedula = p_cedula and celular = p_celular and enlace_registro_id = p_enlace_registro_id
    and codigo_hash ~ '^[A-Za-z0-9_-]{43}$'
    and created_at is not null and expira_at is not null for update;
  if not found then raise exception 'OTP_DELIVERY_CONTEXT_MISMATCH'; end if;
  select * into r from public.nova_otp_delivery_receipts where otp_id = o.id for update;
  if found then
    if r.provider_message_id <> p_provider_message_id then raise exception 'OTP_DELIVERY_BINDING_CONFLICT'; end if;
    -- An exact replay is read-only even after expiry/verification; no new send.
    return jsonb_build_object('found',true,'registered',true,'otpId',o.id,
      'providerMessageId',r.provider_message_id,'createdAt',o.created_at,'expiresAt',o.expira_at,
      'acceptedAt',r.accepted_at,'state',r.state,'errorCode',r.error_code,
      'eventAt',r.event_at,'checkedAt',r.checked_at,'verified',o.verificado is true,
      'consumed',o.registro_consumido_at is not null,'expired',o.expira_at<=now(),
      'retryAfter',case when o.verificado is true or o.registro_consumido_at is not null then 0
        else greatest(0,least(300,ceil(extract(epoch from o.expira_at-now()))))::integer end);
  end if;
  if (o.verificado is not true and o.registro_consumido_at is null
      and o.expira_at > now() and o.envio_fallido_at is null) is not true then
    raise exception 'OTP_DELIVERY_OTP_NOT_LIVE';
  end if;
  accepted := coalesce(o.envio_aceptado_at, now());
  insert into public.nova_otp_delivery_receipts
    (otp_id, provider_message_id, state, accepted_at, event_at)
    values (o.id, p_provider_message_id, 'accepted', accepted, accepted) returning * into r;
  update public.otp_codigos set envio_aceptado_at = accepted where id = o.id and envio_aceptado_at is null;
  return jsonb_build_object('found',true,'registered',true,'otpId',o.id,
    'providerMessageId',r.provider_message_id,'createdAt',o.created_at,'expiresAt',o.expira_at,
    'acceptedAt',r.accepted_at,'state',r.state,'errorCode',r.error_code,
    'eventAt',r.event_at,'checkedAt',r.checked_at,'verified',o.verificado is true,
    'consumed',o.registro_consumido_at is not null,'expired',o.expira_at<=now(),
    'retryAfter',greatest(0,least(300,ceil(extract(epoch from o.expira_at-now()))))::integer);
end;
$$;

create function public.nova_otp_delivery_read(
  p_cedula text, p_celular text, p_enlace_registro_id uuid, p_otp_id uuid default null
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare o public.otp_codigos; r public.nova_otp_delivery_receipts; has_receipt boolean;
begin
  if (p_enlace_registro_id is not null and p_cedula ~ '^[0-9]{6,12}$'
      and p_celular ~ '^3[0-9]{9}$') is not true then raise exception 'OTP_DELIVERY_INPUT_INVALID'; end if;
  perform 1 from public.enlaces_registro l join public.origenes x on x.codigo = l.origen_codigo
    where l.id = p_enlace_registro_id and l.activo and l.revoked_at is null and x.activo;
  if not found then raise exception 'OTP_LINK_NOT_ACTIVE'; end if;
  select * into o from public.otp_codigos where cedula = p_cedula and celular = p_celular
    and enlace_registro_id = p_enlace_registro_id and codigo_hash ~ '^[A-Za-z0-9_-]{43}$'
    -- Once a browser holds an opaque attempt ID, polling cannot silently
    -- switch to a newer attempt from another device with the same identity.
    and (p_otp_id is null or id = p_otp_id)
    and created_at >= now() - interval '24 hours' and expira_at is not null
    order by created_at desc, id desc limit 1;
  if not found then return jsonb_build_object('found', false); end if;
  select * into r from public.nova_otp_delivery_receipts where otp_id = o.id;
  has_receipt := found;
  return jsonb_build_object(
    'found', true, 'registered', has_receipt, 'otpId', o.id,
    'providerMessageId', r.provider_message_id, 'createdAt', o.created_at,
    'expiresAt', o.expira_at, 'acceptedAt', coalesce(r.accepted_at, o.envio_aceptado_at),
    'state', case when has_receipt then r.state when o.envio_fallido_at is not null then 'failed'
      when o.envio_aceptado_at is not null then 'accepted' else 'uncertain' end,
    'errorCode', r.error_code, 'eventAt', r.event_at, 'checkedAt', r.checked_at,
    'verified', o.verificado is true, 'consumed', o.registro_consumido_at is not null,
    'expired', o.expira_at <= now(),
    'retryAfter', case when o.verificado is true or o.registro_consumido_at is not null then 0
      else greatest(0, least(300, ceil(extract(epoch from o.expira_at - now()))))::integer end
  );
end;
$$;

create function public.nova_otp_delivery_apply(
  p_otp_id uuid, p_provider_message_id text, p_state text,
  p_event_at timestamptz, p_error_code text default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare o public.otp_codigos; r public.nova_otp_delivery_receipts;
  old_rank integer; new_rank integer; applied boolean := false;
begin
  if (p_otp_id is not null and p_provider_message_id ~ '^wamid\.[A-Za-z0-9._=:/+-]{1,190}$'
      and p_state in ('accepted','sent','delivered','read','failed') and p_event_at is not null
      and (p_error_code is null or p_error_code ~ '^[0-9]{1,16}$')) is not true then
    raise exception 'OTP_DELIVERY_EVENT_INVALID';
  end if;
  select * into o from public.otp_codigos where id = p_otp_id;
  if not found then raise exception 'OTP_DELIVERY_CONTEXT_MISMATCH'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('otp:celular:' || o.celular, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('otp:enlace:' || o.enlace_registro_id::text, 0));
  select * into o from public.otp_codigos where id = p_otp_id for update;
  select * into r from public.nova_otp_delivery_receipts where otp_id = p_otp_id for update;
  if not found or r.provider_message_id is distinct from p_provider_message_id then
    raise exception 'OTP_DELIVERY_BINDING_CONFLICT';
  end if;
  if o.created_at is null or p_event_at < o.created_at - interval '1 second' or p_event_at > now() + interval '60 seconds' then
    raise exception 'OTP_DELIVERY_EVENT_TIME_INVALID';
  end if;
  old_rank := case r.state when 'accepted' then 0 when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 else 4 end;
  new_rank := case p_state when 'accepted' then 0 when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 else 4 end;
  -- signed events have whole-second precision and can arrive before the API
  -- response was recorded. Compare against creation for the initial projection.
  -- A signed failure for this exact wamid is terminal even if it conflicts
  -- with a later-timestamped progress event. Such contradictions never allow
  -- verification or a resend; the original raw evidence remains in AURA.
  if new_rank >= old_rank and (r.state = 'accepted' or p_event_at >= r.event_at
      or (p_state = 'failed' and r.state <> 'failed'))
      and not (r.state = 'failed' and p_state <> 'failed') then
    applied := r.state is distinct from p_state or r.event_at is distinct from p_event_at
      or (r.error_code is null and p_error_code is not null);
    if applied then
      update public.nova_otp_delivery_receipts set state = p_state, event_at = p_event_at,
        error_code = coalesce(error_code, p_error_code), checked_at = now() where otp_id = p_otp_id returning * into r;
    end if;
  end if;
  if not applied then update public.nova_otp_delivery_receipts set checked_at = now() where otp_id = p_otp_id; end if;
  return jsonb_build_object('applied', applied, 'otpId', r.otp_id, 'providerMessageId', r.provider_message_id,
    'state', r.state, 'acceptedAt', r.accepted_at, 'eventAt', r.event_at,
    'errorCode', r.error_code, 'checkedAt', now());
end;
$$;

create function public.nova_otp_delivery_verify_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare delivery_state text;
begin
  if old.codigo_hash is not null and old.enlace_registro_id is not null
      and old.verificado is not true and new.verificado is true then
    -- Serializes with the apply RPC's OTP/receipt row locks. A failure that
    -- committed before verification cannot be bypassed by a stale HTTP read.
    select state into delivery_state from public.nova_otp_delivery_receipts where otp_id = old.id for share;
    if delivery_state = 'failed' then raise exception 'OTP_DELIVERY_FAILED'; end if;
  end if;
  return new;
end;
$$;
revoke all on function public.nova_otp_delivery_verify_guard() from public, anon, authenticated;
grant execute on function public.nova_otp_delivery_verify_guard() to service_role;
create trigger nova_otp_delivery_verify_guard before update of verificado on public.otp_codigos
for each row execute function public.nova_otp_delivery_verify_guard();

revoke all on function public.nova_otp_delivery_register(uuid,text,text,uuid,text),
  public.nova_otp_delivery_read(text,text,uuid,uuid),
  public.nova_otp_delivery_apply(uuid,text,text,timestamptz,text) from public, anon, authenticated;
grant execute on function public.nova_otp_delivery_register(uuid,text,text,uuid,text),
  public.nova_otp_delivery_read(text,text,uuid,uuid),
  public.nova_otp_delivery_apply(uuid,text,text,timestamptz,text) to service_role;
commit;
