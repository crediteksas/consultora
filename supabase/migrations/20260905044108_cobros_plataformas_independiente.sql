-- Módulo ADITIVO de conciliación de cobros. No modifica liquidaciones, tarifas,
-- bonos, órdenes de pago, bancos existentes ni saldos contables de Tesorería.
create schema cobros_private;
revoke all on schema cobros_private from public,anon;
grant usage on schema cobros_private to authenticated;

create function cobros_private.autorizado(p_escritura boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.perfiles p
 where p.id=auth.uid() and p.activo and (p.rol='gerencia' or (not p_escritura and p.rol='auditoria')))
$$;
revoke all on function cobros_private.autorizado(boolean) from public,anon;
grant execute on function cobros_private.autorizado(boolean) to authenticated;

create table public.cobros_expected(
 id uuid primary key default gen_random_uuid(),
 plataforma text not null check(plataforma in ('payjoy','alo','krediya','addi')),
 corte date not null,fecha_esperada date not null,
 concepto text not null check(length(btrim(concepto)) between 3 and 300),
 importe numeric(16,2) not null check(importe>0 and importe<1000000000000),
 soporte text not null check(length(btrim(soporte)) between 3 and 2000),
 fuente_tipo text not null default 'neto_confirmado' check(fuente_tipo='neto_confirmado'),
 liquidation_id uuid references public.liquidations(id),
 estado text not null default 'activo' check(estado in ('activo','anulado')),
 idempotency_key uuid not null unique,
 created_by uuid not null references public.perfiles(id),created_at timestamptz not null default now()
);
create unique index cobros_expected_lote_activo on public.cobros_expected(liquidation_id) where liquidation_id is not null and estado='activo';
create index on public.cobros_expected(created_by);
create index on public.cobros_expected(plataforma,corte);
create table public.cobros_deposits(
 id uuid primary key default gen_random_uuid(),
 plataforma text not null check(plataforma in ('payjoy','alo','krediya','addi')),
 fecha date not null,banco text not null check(length(btrim(banco)) between 2 and 100),
 cuenta_ultimos4 text not null check(cuenta_ultimos4 ~ '^[0-9]{4}$'),
 referencia text not null check(length(btrim(referencia)) between 1 and 120),
 importe numeric(16,2) not null check(importe>0 and importe<1000000000000),
 soporte text not null check(length(btrim(soporte)) between 3 and 2000),
 estado text not null default 'activo' check(estado in ('activo','anulado')),
 idempotency_key uuid not null unique,
 created_by uuid not null references public.perfiles(id),created_at timestamptz not null default now()
);
create index on public.cobros_deposits(created_by);
create unique index cobros_abono_no_duplicado on public.cobros_deposits(plataforma,fecha,lower(btrim(banco)),cuenta_ultimos4,lower(btrim(referencia)),importe) where estado='activo';
create table public.cobros_allocations(
 id uuid primary key default gen_random_uuid(),
 expected_id uuid not null references public.cobros_expected(id),
 deposit_id uuid not null references public.cobros_deposits(id),
 importe numeric(16,2) not null check(importe>0 and importe<1000000000000),
 estado text not null default 'activo' check(estado in ('activo','anulado')),
 idempotency_key uuid not null unique,
 created_by uuid not null references public.perfiles(id),created_at timestamptz not null default now()
);
create index on public.cobros_allocations(expected_id);
create index on public.cobros_allocations(deposit_id);
create index on public.cobros_allocations(created_by);
create table public.cobros_events(
 id uuid primary key default gen_random_uuid(),tipo text not null,registro_id uuid not null,
 detalle jsonb not null,actor_id uuid not null references public.perfiles(id),actor_nombre text not null,
 created_at timestamptz not null default now()
);
create index on public.cobros_events(actor_id);
create index on public.cobros_events(registro_id,created_at);
alter table public.cobros_expected enable row level security;
alter table public.cobros_deposits enable row level security;
alter table public.cobros_allocations enable row level security;
alter table public.cobros_events enable row level security;
revoke all on public.cobros_expected,public.cobros_deposits,public.cobros_allocations,public.cobros_events from public,anon,authenticated;
grant select on public.cobros_expected,public.cobros_deposits,public.cobros_allocations,public.cobros_events to authenticated;
create policy cobros_lectura on public.cobros_expected for select to authenticated using((select cobros_private.autorizado(false)));
create policy cobros_lectura on public.cobros_deposits for select to authenticated using((select cobros_private.autorizado(false)));
create policy cobros_lectura on public.cobros_allocations for select to authenticated using((select cobros_private.autorizado(false)));
create policy cobros_lectura on public.cobros_events for select to authenticated using((select cobros_private.autorizado(false)));

create function cobros_private.evento(p_tipo text,p_id uuid,p_detalle jsonb)
returns void language sql security definer set search_path='' as $$
 insert into public.cobros_events(tipo,registro_id,detalle,actor_id,actor_nombre)
 select p_tipo,p_id,p_detalle,p.id,p.nombre from public.perfiles p
 where p.id=auth.uid() and p.activo and p.rol='gerencia';
$$;
revoke all on function cobros_private.evento(text,uuid,jsonb) from public,anon,authenticated;

create function cobros_private.crear_esperado(p_plataforma text,p_corte date,p_fecha_esperada date,p_concepto text,p_importe numeric,p_soporte text,p_liquidation_id uuid,p_idempotency_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.cobros_expected%rowtype; l public.liquidations%rowtype;
begin
 if not cobros_private.autorizado(true) then raise exception 'Solo Gerencia puede registrar cobros'; end if;
 if p_idempotency_key is null then raise exception 'Falta identificador de solicitud'; end if;
 perform pg_advisory_xact_lock(hashtextextended('cobros-expected:'||p_idempotency_key,0));
 select * into r from public.cobros_expected where idempotency_key=p_idempotency_key;
 if found then
  if r.created_by<>auth.uid() or (r.plataforma,r.corte,r.fecha_esperada,r.concepto,r.importe,r.soporte,r.liquidation_id)
   is distinct from (p_plataforma,p_corte,p_fecha_esperada,btrim(p_concepto),p_importe,btrim(p_soporte),p_liquidation_id) then raise exception 'La solicitud ya se utilizó con otros datos'; end if;
  return r.id;
 end if;
 if p_importe is distinct from round(p_importe,2) then raise exception 'Usa máximo dos decimales'; end if;
 if p_liquidation_id is not null then
  select * into l from public.liquidations where id=p_liquidation_id;
  if not found or l.plataforma is distinct from p_plataforma or l.fecha_corte is distinct from p_corte then raise exception 'El lote no corresponde a la plataforma y corte'; end if;
 end if;
 insert into public.cobros_expected(plataforma,corte,fecha_esperada,concepto,importe,soporte,liquidation_id,idempotency_key,created_by)
 values(p_plataforma,p_corte,p_fecha_esperada,btrim(p_concepto),p_importe,btrim(p_soporte),p_liquidation_id,p_idempotency_key,auth.uid()) returning * into r;
 perform cobros_private.evento('expected_creado',r.id,to_jsonb(r));return r.id;
end $$;

create function cobros_private.registrar_abono(p_plataforma text,p_fecha date,p_banco text,p_cuenta_ultimos4 text,p_referencia text,p_importe numeric,p_soporte text,p_idempotency_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.cobros_deposits%rowtype;
begin
 if not cobros_private.autorizado(true) then raise exception 'Solo Gerencia puede registrar abonos'; end if;
 if p_idempotency_key is null then raise exception 'Falta identificador de solicitud'; end if;
 perform pg_advisory_xact_lock(hashtextextended('cobros-deposit:'||p_idempotency_key,0));
 select * into r from public.cobros_deposits where idempotency_key=p_idempotency_key;
 if found then
  if r.created_by<>auth.uid() or (r.plataforma,r.fecha,r.banco,r.cuenta_ultimos4,r.referencia,r.importe,r.soporte)
   is distinct from (p_plataforma,p_fecha,btrim(p_banco),p_cuenta_ultimos4,btrim(p_referencia),p_importe,btrim(p_soporte)) then raise exception 'La solicitud ya se utilizó con otros datos'; end if;
  return r.id;
 end if;
 if p_importe is distinct from round(p_importe,2) then raise exception 'Usa máximo dos decimales'; end if;
 if p_fecha>(now() at time zone 'America/Bogota')::date then raise exception 'Un abono recibido no puede tener fecha futura'; end if;
 if exists(select 1 from public.cobros_deposits where estado='activo' and plataforma=p_plataforma and fecha=p_fecha and lower(btrim(banco))=lower(btrim(p_banco)) and cuenta_ultimos4=p_cuenta_ultimos4 and lower(btrim(referencia))=lower(btrim(p_referencia)) and importe=p_importe) then
  raise exception 'Este abono ya está registrado. Revisa la referencia bancaria'; end if;
 insert into public.cobros_deposits(plataforma,fecha,banco,cuenta_ultimos4,referencia,importe,soporte,idempotency_key,created_by)
 values(p_plataforma,p_fecha,btrim(p_banco),p_cuenta_ultimos4,btrim(p_referencia),p_importe,btrim(p_soporte),p_idempotency_key,auth.uid()) returning * into r;
 perform cobros_private.evento('deposit_creado',r.id,to_jsonb(r));return r.id;
end $$;

create function cobros_private.aplicar_abono(p_deposit_id uuid,p_expected_id uuid,p_importe numeric,p_idempotency_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare d public.cobros_deposits%rowtype; e public.cobros_expected%rowtype; a public.cobros_allocations%rowtype; usado numeric;
begin
 if not cobros_private.autorizado(true) then raise exception 'Solo Gerencia puede aplicar abonos'; end if;
 if p_idempotency_key is null then raise exception 'Falta identificador de solicitud'; end if;
 perform pg_advisory_xact_lock(hashtextextended('cobros-allocation:'||p_idempotency_key,0));
 select * into a from public.cobros_allocations where idempotency_key=p_idempotency_key;
 if found then
  if a.created_by<>auth.uid() or (a.deposit_id,a.expected_id,a.importe) is distinct from (p_deposit_id,p_expected_id,p_importe) then raise exception 'La solicitud ya se utilizó con otros datos'; end if;
  return a.id;
 end if;
 if p_importe is null or p_importe<=0 or p_importe is distinct from round(p_importe,2) then raise exception 'Importe inválido'; end if;
 -- Todos los procesos bloquean depósito antes del cobro: sin sobreaplicación concurrente.
 select * into d from public.cobros_deposits where id=p_deposit_id for update;
 if not found or d.estado<>'activo' then raise exception 'Abono no disponible'; end if;
 select * into e from public.cobros_expected where id=p_expected_id for update;
 if not found or e.estado<>'activo' then raise exception 'Cobro no disponible'; end if;
 if d.plataforma<>e.plataforma then raise exception 'No se pueden cruzar plataformas'; end if;
 select coalesce(sum(importe),0) into usado from public.cobros_allocations where deposit_id=d.id and estado='activo';
 if p_importe>d.importe-usado then raise exception 'El valor supera el saldo disponible del abono'; end if;
 select coalesce(sum(importe),0) into usado from public.cobros_allocations where expected_id=e.id and estado='activo';
 if p_importe>e.importe-usado then raise exception 'El valor supera el pendiente del cobro. El excedente queda sin asignar'; end if;
 insert into public.cobros_allocations(deposit_id,expected_id,importe,idempotency_key,created_by)
 values(d.id,e.id,p_importe,p_idempotency_key,auth.uid()) returning * into a;
 perform cobros_private.evento('allocation_creada',a.id,to_jsonb(a));return a.id;
end $$;

create function cobros_private.anular_registro(p_tipo text,p_id uuid,p_motivo text)
returns void language plpgsql security definer set search_path='' as $$
declare a public.cobros_allocations%rowtype; estado_actual text;
begin
 if not cobros_private.autorizado(true) then raise exception 'Solo Gerencia puede anular'; end if;
 if length(btrim(coalesce(p_motivo,''))) not between 5 and 2000 then raise exception 'Explica el motivo de la anulación'; end if;
 if p_tipo='allocation' then
  select * into a from public.cobros_allocations where id=p_id;
  if not found then raise exception 'Aplicación no encontrada'; end if;
  perform 1 from public.cobros_deposits where id=a.deposit_id for update;
  perform 1 from public.cobros_expected where id=a.expected_id for update;
  select estado into estado_actual from public.cobros_allocations where id=p_id for update;
  if estado_actual='anulado' then return; end if;
  update public.cobros_allocations set estado='anulado' where id=p_id;
 elsif p_tipo='deposit' then
  select estado into estado_actual from public.cobros_deposits where id=p_id for update;
  if not found then raise exception 'Abono no encontrado'; end if;
  if estado_actual='anulado' then return; end if;
  if exists(select 1 from public.cobros_allocations where deposit_id=p_id and estado='activo') then raise exception 'Primero anula sus aplicaciones; el historial se conserva'; end if;
  update public.cobros_deposits set estado='anulado' where id=p_id;
 elsif p_tipo='expected' then
  select estado into estado_actual from public.cobros_expected where id=p_id for update;
  if not found then raise exception 'Cobro no encontrado'; end if;
  if estado_actual='anulado' then return; end if;
  if exists(select 1 from public.cobros_allocations where expected_id=p_id and estado='activo') then raise exception 'Primero anula sus aplicaciones; el historial se conserva'; end if;
  update public.cobros_expected set estado='anulado' where id=p_id;
 else raise exception 'Tipo de registro inválido'; end if;
 perform cobros_private.evento(p_tipo||'_anulado',p_id,jsonb_build_object('motivo',btrim(p_motivo)));
end $$;

create function cobros_private.resumen()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not cobros_private.autorizado(false) then raise exception 'Acceso a cobros no autorizado'; end if;
 return jsonb_build_object(
 'expected',coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object('aplicado',coalesce((select sum(a.importe) from public.cobros_allocations a where a.expected_id=e.id and a.estado='activo'),0)) order by e.corte desc,e.id) from public.cobros_expected e),'[]'::jsonb),
 'deposits',coalesce((select jsonb_agg(to_jsonb(d)||jsonb_build_object('aplicado',coalesce((select sum(a.importe) from public.cobros_allocations a where a.deposit_id=d.id and a.estado='activo'),0)) order by d.fecha desc,d.id) from public.cobros_deposits d),'[]'::jsonb),
 'allocations',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at,a.id) from public.cobros_allocations a),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc,e.id) from public.cobros_events e),'[]'::jsonb),
 'candidates',coalesce((select jsonb_agg(to_jsonb(c) order by c.corte desc,c.liquidation_id) from (
  select l.id liquidation_id,l.plataforma,l.fecha_corte corte,'Liquidación · '||l.fecha_corte concepto,l.estado estado_liquidacion,
  (select sum(o.monto_credito) from public.liquidation_operations o where o.liquidation_id=l.id and o.reconocida) base_estimada,
  (select count(*) from public.liquidation_operations o where o.liquidation_id=l.id and o.reconocida) operaciones
  from public.liquidations l where l.fecha_corte is not null and l.plataforma in ('payjoy','alo','krediya','addi')
  and not exists(select 1 from public.cobros_expected e where e.liquidation_id=l.id and e.estado='activo')
 ) c),'[]'::jsonb));
end $$;

-- Solo los wrappers públicos invoker son visibles en Data API; las escrituras
-- privilegiadas viven en esquema no expuesto y comprueban auth.uid + perfil activo.
revoke all on function cobros_private.crear_esperado(text,date,date,text,numeric,text,uuid,uuid),cobros_private.registrar_abono(text,date,text,text,text,numeric,text,uuid),cobros_private.aplicar_abono(uuid,uuid,numeric,uuid),cobros_private.anular_registro(text,uuid,text),cobros_private.resumen() from public,anon;
grant execute on function cobros_private.crear_esperado(text,date,date,text,numeric,text,uuid,uuid),cobros_private.registrar_abono(text,date,text,text,text,numeric,text,uuid),cobros_private.aplicar_abono(uuid,uuid,numeric,uuid),cobros_private.anular_registro(text,uuid,text),cobros_private.resumen() to authenticated;
create function public.cobros_crear_esperado(p_plataforma text,p_corte date,p_fecha_esperada date,p_concepto text,p_importe numeric,p_soporte text,p_liquidation_id uuid,p_idempotency_key uuid)
returns uuid language sql security invoker set search_path='' as $$select cobros_private.crear_esperado(p_plataforma,p_corte,p_fecha_esperada,p_concepto,p_importe,p_soporte,p_liquidation_id,p_idempotency_key)$$;
create function public.cobros_registrar_abono(p_plataforma text,p_fecha date,p_banco text,p_cuenta_ultimos4 text,p_referencia text,p_importe numeric,p_soporte text,p_idempotency_key uuid)
returns uuid language sql security invoker set search_path='' as $$select cobros_private.registrar_abono(p_plataforma,p_fecha,p_banco,p_cuenta_ultimos4,p_referencia,p_importe,p_soporte,p_idempotency_key)$$;
create function public.cobros_aplicar_abono(p_deposit_id uuid,p_expected_id uuid,p_importe numeric,p_idempotency_key uuid)
returns uuid language sql security invoker set search_path='' as $$select cobros_private.aplicar_abono(p_deposit_id,p_expected_id,p_importe,p_idempotency_key)$$;
create function public.cobros_anular_registro(p_tipo text,p_id uuid,p_motivo text)
returns void language sql security invoker set search_path='' as $$select cobros_private.anular_registro(p_tipo,p_id,p_motivo)$$;
create function public.cobros_plataformas_resumen()
returns jsonb language sql stable security invoker set search_path='' as $$select cobros_private.resumen()$$;
revoke all on function public.cobros_crear_esperado(text,date,date,text,numeric,text,uuid,uuid),public.cobros_registrar_abono(text,date,text,text,text,numeric,text,uuid),public.cobros_aplicar_abono(uuid,uuid,numeric,uuid),public.cobros_anular_registro(text,uuid,text),public.cobros_plataformas_resumen() from public,anon;
grant execute on function public.cobros_crear_esperado(text,date,date,text,numeric,text,uuid,uuid),public.cobros_registrar_abono(text,date,text,text,text,numeric,text,uuid),public.cobros_aplicar_abono(uuid,uuid,numeric,uuid),public.cobros_anular_registro(text,uuid,text),public.cobros_plataformas_resumen() to authenticated;
notify pgrst,'reload schema';
