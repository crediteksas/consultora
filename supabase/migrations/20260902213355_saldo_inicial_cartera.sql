begin;

do $preflight$
begin
  if to_regclass('public.cuenta_corriente') is null
     or to_regclass('public.origenes') is null
     or to_regclass('public.perfiles') is null
     or to_regclass('public.audit_log') is null then
    raise exception 'Faltan tablas requeridas para registrar saldos iniciales de cartera';
  end if;
end;
$preflight$;

create table if not exists public.saldos_iniciales_cartera (
  id uuid primary key default gen_random_uuid(),
  tienda_codigo text not null references public.origenes(codigo),
  fecha_corte date not null,
  monto numeric not null check (monto > 0),
  concepto text not null check (nullif(btrim(concepto), '') is not null),
  observacion text,
  soporte_path text not null check (nullif(btrim(soporte_path), '') is not null),
  idempotency_key uuid not null unique,
  registrado_por uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint saldos_iniciales_cartera_tienda_unica unique (tienda_codigo)
);

alter table public.saldos_iniciales_cartera enable row level security;

drop policy if exists saldos_iniciales_select_central on public.saldos_iniciales_cartera;
create policy saldos_iniciales_select_central
on public.saldos_iniciales_cartera
for select to authenticated
using (
  exists (
    select 1 from public.perfiles p
    where p.id = (select auth.uid())
      and p.activo = true
      and p.rol in ('gerencia', 'auditoria')
  )
);

revoke all on table public.saldos_iniciales_cartera from public, anon, authenticated;
grant select on table public.saldos_iniciales_cartera to authenticated;

create or replace function public.registrar_saldo_inicial_cartera(
  p_tienda_codigo text,
  p_fecha_corte date,
  p_monto numeric,
  p_concepto text,
  p_observacion text,
  p_soporte_path text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_perfil public.perfiles%rowtype;
  v_saldo public.saldos_iniciales_cartera%rowtype;
  v_movimiento_id bigint;
  v_tienda_codigo text := btrim(coalesce(p_tienda_codigo, ''));
begin
  select * into v_perfil
  from public.perfiles
  where id = auth.uid() and activo = true;

  if not found or v_perfil.rol not in ('gerencia', 'auditoria') then
    raise exception 'Solo Gerencia o Auditoría pueden registrar el saldo inicial';
  end if;

  if v_tienda_codigo = '' or p_fecha_corte is null
     or p_monto is null or p_monto <= 0
     or nullif(btrim(coalesce(p_concepto, '')), '') is null
     or nullif(btrim(coalesce(p_soporte_path, '')), '') is null
     or p_idempotency_key is null then
    raise exception 'Tienda, fecha de corte, monto, concepto, soporte e idempotencia son obligatorios';
  end if;

  if not exists (
    select 1 from public.origenes
    where codigo = v_tienda_codigo and tipo = 'propia' and activo = true
  ) then
    raise exception 'La tienda no existe, no es propia o está inactiva';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('saldo_inicial:' || lower(v_tienda_codigo), 0));

  select * into v_saldo
  from public.saldos_iniciales_cartera
  where idempotency_key = p_idempotency_key;

  if found then
    select id into v_movimiento_id
    from public.cuenta_corriente
    where referencia_tipo = 'saldo_inicial'
      and referencia_id = v_saldo.id::text;
    return jsonb_build_object(
      'ok', true,
      'reutilizado', true,
      'saldo_inicial_id', v_saldo.id,
      'movimiento_id', v_movimiento_id
    );
  end if;

  if exists (
    select 1 from public.saldos_iniciales_cartera
    where tienda_codigo = v_tienda_codigo
  ) then
    raise exception 'La tienda ya tiene un saldo inicial registrado';
  end if;

  insert into public.saldos_iniciales_cartera (
    tienda_codigo, fecha_corte, monto, concepto, observacion,
    soporte_path, idempotency_key, registrado_por
  ) values (
    v_tienda_codigo, p_fecha_corte, p_monto, btrim(p_concepto),
    nullif(btrim(coalesce(p_observacion, '')), ''), btrim(p_soporte_path),
    p_idempotency_key, auth.uid()
  ) returning * into v_saldo;

  insert into public.cuenta_corriente (
    tienda_codigo, tipo, concepto, monto,
    referencia_tipo, referencia_id, usuario, nota
  ) values (
    v_tienda_codigo, 'cargo', btrim(p_concepto), p_monto,
    'saldo_inicial', v_saldo.id::text, auth.uid(),
    concat('Saldo a ', to_char(p_fecha_corte, 'YYYY-MM-DD'),
      case when nullif(btrim(coalesce(p_observacion, '')), '') is not null
        then ' · ' || btrim(p_observacion) else '' end)
  ) returning id into v_movimiento_id;

  insert into public.audit_log(usuario, accion, tabla, registro_id, detalle)
  values (
    coalesce(v_perfil.nombre, auth.uid()::text),
    'registrar_saldo_inicial_cartera',
    'saldos_iniciales_cartera',
    v_saldo.id::text,
    jsonb_build_object(
      'tienda_codigo', v_tienda_codigo,
      'fecha_corte', p_fecha_corte,
      'monto', p_monto,
      'movimiento_id', v_movimiento_id,
      'soporte_path', btrim(p_soporte_path)
    )
  );

  return jsonb_build_object(
    'ok', true,
    'reutilizado', false,
    'saldo_inicial_id', v_saldo.id,
    'movimiento_id', v_movimiento_id
  );
end;
$$;

revoke all on function public.registrar_saldo_inicial_cartera(
  text, date, numeric, text, text, text, uuid
) from public, anon;
grant execute on function public.registrar_saldo_inicial_cartera(
  text, date, numeric, text, text, text, uuid
) to authenticated;

commit;
