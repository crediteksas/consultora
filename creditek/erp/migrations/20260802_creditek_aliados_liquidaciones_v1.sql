-- Creditek Aliados V1. No aplicar sin configurar perfiles verificados de Óscar y Maite.
begin;

do $preflight$
begin
  if to_regclass('public.perfiles') is null or to_regclass('public.origenes') is null
     or to_regclass('public.ejecutivos') is null or to_regclass('public.audit_log') is null
     or to_regclass('storage.objects') is null or not exists(select 1 from storage.buckets where id='soportes') then
    raise exception 'Falta infraestructura reutilizable requerida por Creditek Aliados';
  end if;
end;
$preflight$;

create table if not exists public.aliados_operadores (
  perfil_id uuid primary key references public.perfiles(id),
  capacidad text not null check(capacidad in('revisor','aprobador')),
  activo boolean not null default true,
  creado_por uuid references public.perfiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);

-- Insertar únicamente UUID comprobados antes de staging. Nunca autorizar por nombre/correo.
-- insert into public.aliados_operadores(perfil_id,capacidad) values
--   ('UUID_MAITE'::uuid,'revisor'),('UUID_OSCAR'::uuid,'aprobador')
-- on conflict(perfil_id) do update set capacidad=excluded.capacidad,activo=true;

create or replace function public.tiene_capacidad_aliados(p_capacidad text default 'revisor')
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.aliados_operadores o join public.perfiles p on p.id=o.perfil_id
    where o.perfil_id=auth.uid() and o.activo and p.activo
      and (o.capacidad=p_capacidad or o.capacidad='aprobador'));
$$;
revoke all on function public.tiene_capacidad_aliados(text) from public,anon;
grant execute on function public.tiene_capacidad_aliados(text) to authenticated;

create table if not exists public.liquidation_platforms (
  id text primary key check(id in('payjoy','alo')), nombre text not null unique, activo boolean not null default true
);
insert into public.liquidation_platforms(id,nombre) values('payjoy','PayJoy'),('alo','ALO Credit')
on conflict(id) do update set nombre=excluded.nombre;

create table if not exists public.liquidations (
  id uuid primary key default gen_random_uuid(), plataforma text not null references public.liquidation_platforms(id),
  estado text not null default 'importada' check(estado in('importada','validada','con_novedades','calculada','revisada','aprobada','programada','pagada','conciliada','cerrada','anulada')),
  periodo_desde date, periodo_hasta date, fecha_corte date, imported_at timestamptz not null default now(), imported_by uuid not null references public.perfiles(id) default auth.uid(),
  reviewed_at timestamptz, reviewed_by uuid references public.perfiles(id), approved_at timestamptz, approved_by uuid references public.perfiles(id),
  frozen_at timestamptz, total_operaciones numeric(16,2) not null default 0, total_pago_aliados numeric(16,2) not null default 0,
  total_bonos numeric(16,2) not null default 0, total_utilidad_creditek numeric(16,2) not null default 0, total_pagar numeric(16,2) not null default 0,
  idempotency_key uuid not null unique, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.liquidation_imported_files (
  id uuid primary key default gen_random_uuid(), liquidation_id uuid not null unique references public.liquidations(id),
  original_name text not null, sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'), storage_path text not null unique,
  size_bytes bigint not null check(size_bytes>0 and size_bytes<=10485760), mime_type text not null,
  detected_cutoff date, uploaded_by uuid not null references public.perfiles(id) default auth.uid(), uploaded_at timestamptz not null default now()
);
alter table public.liquidations add column if not exists operaciones_tiendas integer not null default 0;
alter table public.liquidations add column if not exists operaciones_aliados integer not null default 0;
alter table public.liquidations add column if not exists total_pago_tiendas numeric(16,2) not null default 0;
alter table public.liquidations add column if not exists total_utilidad_tiendas numeric(16,2) not null default 0;
create unique index if not exists liquidation_imported_files_sha256_uidx on public.liquidation_imported_files(sha256);

create table if not exists public.liquidation_source_rows (
  id uuid primary key default gen_random_uuid(), liquidation_id uuid not null references public.liquidations(id),
  file_id uuid not null references public.liquidation_imported_files(id), sheet_name text not null, row_number integer not null check(row_number>0),
  movement_type text, source_key text, original_data jsonb not null, created_at timestamptz not null default now(), unique(file_id,sheet_name,row_number)
);
create table if not exists public.liquidation_operations (
  id uuid primary key default gen_random_uuid(), liquidation_id uuid not null references public.liquidations(id), plataforma text not null references public.liquidation_platforms(id),
  source_key text not null, external_id text not null, operation_at timestamptz, establishment_name text not null,
  origen_codigo text references public.origenes(codigo), tipo_establecimiento text not null check(tipo_establecimiento in('propia','aliado','no_reconocido')),
  ejecutivo_id uuid references public.ejecutivos(id), cliente_documento text, cliente_nombre text, imei text, referencia text, modelo text,
  monto_credito numeric(16,2), monto_base numeric(16,2) not null, inicial numeric(16,2) not null default 0,
  accesorios_cantidad integer not null default 0 check(accesorios_cantidad>=0), accesorios numeric(16,2) not null default 0,
  reconocida boolean not null default false, normalized_data jsonb not null, created_at timestamptz not null default now(), unique(liquidation_id,source_key)
);
create unique index if not exists liquidation_operations_platform_external_uidx on public.liquidation_operations(plataforma,external_id,liquidation_id);

create table if not exists public.settlement_policy_versions (
  id uuid primary key default gen_random_uuid(), version integer not null check(version>0), plataforma text not null references public.liquidation_platforms(id),
  tipo_establecimiento text not null check(tipo_establecimiento in('propia','aliado')), porcentaje numeric(8,6) check(porcentaje>0 and porcentaje<=1),
  base_field text not null check(base_field in('monto_base','monto_credito')), formula_code text not null,
  vigente_desde date not null, vigente_hasta date, estado text not null check(estado in('borrador','pendiente','aprobada','inactiva','rechazada')),
  creado_por uuid references public.perfiles(id), aprobado_por uuid references public.perfiles(id), aprobado_at timestamptz,
  created_at timestamptz not null default now(), check(vigente_hasta is null or vigente_hasta>=vigente_desde),
  check(estado<>'aprobada' or (creado_por is not null and aprobado_por is not null and aprobado_at is not null)), unique(plataforma,tipo_establecimiento,version)
);
alter table public.liquidation_operations add column if not exists accesorios_cantidad integer not null default 0 check(accesorios_cantidad>=0);
alter table public.liquidation_operations add column if not exists venta_id uuid;
alter table public.liquidation_operations add column if not exists credito_id uuid;
alter table public.liquidation_operations add column if not exists unidad_id uuid;
alter table public.liquidation_operations add column if not exists inicial_kora numeric(16,2);
alter table public.liquidation_operations add column if not exists diferencia_inicial numeric(16,2);
alter table public.liquidation_operations add column if not exists costo_equipo numeric(16,2);
alter table public.liquidation_operations add column if not exists pagamos numeric(16,2);
alter table public.liquidation_operations add column if not exists pago_neto_tienda numeric(16,2);
alter table public.liquidation_operations add column if not exists utilidad_tienda numeric(16,2);
alter table public.liquidation_operations add column if not exists utilidad_creditek_tienda numeric(16,2);
alter table public.liquidation_operations add column if not exists diferencia_justificacion text;
alter table public.liquidation_operations add column if not exists diferencia_revisada_por uuid references public.perfiles(id);
alter table public.liquidation_operations add column if not exists diferencia_revisada_at timestamptz;
alter table public.liquidation_operations add column if not exists snapshot_tienda_at timestamptz;
alter table public.settlement_policy_versions add column if not exists base_field text not null default 'monto_base' check(base_field in('monto_base','monto_credito'));
create unique index if not exists settlement_policy_one_open_range_idx on public.settlement_policy_versions(plataforma,tipo_establecimiento,vigente_desde,coalesce(vigente_hasta,'infinity'::date)) where estado='aprobada';

create table if not exists public.liquidation_calculations (
  id uuid primary key default gen_random_uuid(), liquidation_id uuid not null references public.liquidations(id), operation_id uuid not null unique references public.liquidation_operations(id),
  policy_version_id uuid not null references public.settlement_policy_versions(id), policy_snapshot jsonb not null,
  pagamos numeric(16,2) not null, pago_aliado numeric(16,2) not null, total_bonos numeric(16,2) not null default 0,
  utilidad_creditek numeric(16,2) not null, explanation jsonb not null, calculated_by uuid not null references public.perfiles(id) default auth.uid(), calculated_at timestamptz not null default now(),
  check(pagamos>=0 and pago_aliado>=0 and total_bonos>=0 and utilidad_creditek>=0)
);
create table if not exists public.liquidation_beneficiaries (
  id uuid primary key default gen_random_uuid(), tipo text not null check(tipo in('aliado','ejecutivo','otro')), identificacion text not null,
  nombre text not null, origen_codigo text references public.origenes(codigo), ejecutivo_id uuid references public.ejecutivos(id), activo boolean not null default true,
  created_at timestamptz not null default now(), unique(tipo,identificacion)
);
create table if not exists public.beneficiary_bank_accounts (
  id uuid primary key default gen_random_uuid(), beneficiary_id uuid not null references public.liquidation_beneficiaries(id), banco text not null,
  tipo_cuenta text not null, numero_cuenta text not null, validada boolean not null default false, validada_por uuid references public.perfiles(id), validada_at timestamptz,
  activo boolean not null default true, created_at timestamptz not null default now(), unique(beneficiary_id,numero_cuenta),
  check(not validada or (validada_por is not null and validada_at is not null))
);
create table if not exists public.liquidation_bonuses (
  id uuid primary key default gen_random_uuid(), liquidation_id uuid not null references public.liquidations(id), operation_id uuid not null references public.liquidation_operations(id),
  beneficiary_id uuid not null references public.liquidation_beneficiaries(id), tipo_bono text not null, rule_snapshot jsonb,
  valor numeric(16,2) not null check(valor>0), motivo text not null, estado text not null default 'borrador' check(estado in('borrador','aprobado','rechazado','anulado')),
  idempotency_key uuid not null unique, created_by uuid not null references public.perfiles(id) default auth.uid(), created_at timestamptz not null default now()
);
create table if not exists public.liquidation_incidents (
  id uuid primary key default gen_random_uuid(), liquidation_id uuid not null references public.liquidations(id), operation_id uuid references public.liquidation_operations(id),
  tipo text not null, descripcion text not null, bloquea_aprobacion boolean not null default true, estado text not null default 'abierta' check(estado in('abierta','resuelta','descartada')),
  resolution text, resolved_by uuid references public.perfiles(id), resolved_at timestamptz, created_at timestamptz not null default now(), unique(liquidation_id,operation_id,tipo)
);
create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(), liquidation_id uuid not null references public.liquidations(id), beneficiary_id uuid not null references public.liquidation_beneficiaries(id),
  bank_account_id uuid not null references public.beneficiary_bank_accounts(id), valor numeric(16,2) not null check(valor>0),
  estado text not null default 'pendiente' check(estado in('pendiente','programado','pagado','rechazado','anulado','conciliado')),
  fecha_programada date, fecha_pagada timestamptz, soporte_path text, idempotency_key uuid not null unique,
  created_by uuid not null references public.perfiles(id) default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(liquidation_id,beneficiary_id)
);
create table if not exists public.payment_items (
  id uuid primary key default gen_random_uuid(), payment_order_id uuid not null references public.payment_orders(id), operation_id uuid not null references public.liquidation_operations(id),
  bonus_id uuid references public.liquidation_bonuses(id), concepto text not null, valor numeric(16,2) not null check(valor>0), created_at timestamptz not null default now(),
  unique(payment_order_id,operation_id,concepto,bonus_id)
);
create table if not exists public.liquidation_approvals (
  id uuid primary key default gen_random_uuid(), liquidation_id uuid not null references public.liquidations(id), etapa text not null check(etapa in('revision','aprobacion')),
  decision text not null check(decision in('aprobada','rechazada','correccion')), comentario text, actor_id uuid not null references public.perfiles(id) default auth.uid(), created_at timestamptz not null default now(),
  unique(liquidation_id,etapa,decision)
);
create table if not exists public.liquidation_adjustments (
  id uuid primary key default gen_random_uuid(), liquidation_id uuid not null references public.liquidations(id), operation_id uuid references public.liquidation_operations(id),
  field_name text not null, old_value jsonb not null, new_value jsonb not null, motivo text not null, estado text not null default 'pendiente' check(estado in('pendiente','aprobado','rechazado','revertido')),
  created_by uuid not null references public.perfiles(id) default auth.uid(), approved_by uuid references public.perfiles(id), created_at timestamptz not null default now(), approved_at timestamptz
);
create table if not exists public.liquidation_domain_events (
  id uuid primary key default gen_random_uuid(), event_type text not null check(event_type in('liquidation.imported','liquidation.validated','liquidation.has_incidents','liquidation.calculated','liquidation.reviewed','liquidation.approved','payment.scheduled','payment.completed','payment.rejected','liquidation.closed')),
  aggregate_type text not null check(aggregate_type in('liquidation','payment')), aggregate_id uuid not null, payload jsonb not null,
  occurred_at timestamptz not null default now(), published_at timestamptz, attempts integer not null default 0, idempotency_key text not null unique
);

create index if not exists liquidations_search_idx on public.liquidations(plataforma,estado,fecha_corte,imported_at desc);
create index if not exists liquidation_operations_search_idx on public.liquidation_operations(liquidation_id,origen_codigo,ejecutivo_id,imei,cliente_documento);
create index if not exists payment_orders_search_idx on public.payment_orders(liquidation_id,estado,beneficiary_id);
create index if not exists liquidation_incidents_open_idx on public.liquidation_incidents(liquidation_id,estado) where bloquea_aprobacion;
create index if not exists liquidation_events_pending_idx on public.liquidation_domain_events(occurred_at) where published_at is null;

create or replace function public.aliados_seed_politica_inicial(p_vigente_desde date)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.tiene_capacidad_aliados('aprobador') then raise exception 'Solo el aprobador puede activar la política inicial'; end if;
  insert into public.settlement_policy_versions(version,plataforma,tipo_establecimiento,porcentaje,base_field,formula_code,vigente_desde,estado,creado_por,aprobado_por,aprobado_at)
  values(1,'payjoy','aliado',0.77,'monto_base','BASE_LIQUIDABLE_X_PORCENTAJE_MENOS_INICIAL',p_vigente_desde,'aprobada',auth.uid(),auth.uid(),now()),
        (1,'alo','aliado',0.77,'monto_credito','BASE_LIQUIDABLE_X_PORCENTAJE_MENOS_INICIAL',p_vigente_desde,'aprobada',auth.uid(),auth.uid(),now())
  on conflict(plataforma,tipo_establecimiento,version) do nothing;
end; $$;

create or replace function public.aliados_importar_liquidacion(p_plataforma text,p_nombre text,p_sha256 text,p_storage_path text,p_size bigint,p_mime text,p_periodo_desde date,p_periodo_hasta date,p_fecha_corte date,p_rows jsonb,p_operations jsonb,p_incidents jsonb,p_idempotency_key uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;v_file uuid;v_row jsonb;v_op jsonb;v_inc jsonb;
begin
 if not public.tiene_capacidad_aliados('revisor') then raise exception 'No autorizado para importar liquidaciones'; end if;
 if p_idempotency_key is null then raise exception 'Llave de idempotencia requerida'; end if;
 select id into v_id from public.liquidations where idempotency_key=p_idempotency_key; if found then return v_id; end if;
 if exists(select 1 from public.liquidation_imported_files where sha256=p_sha256) then raise exception 'archivo_duplicado'; end if;
 insert into public.liquidations(plataforma,periodo_desde,periodo_hasta,fecha_corte,idempotency_key) values(p_plataforma,p_periodo_desde,p_periodo_hasta,p_fecha_corte,p_idempotency_key) returning id into v_id;
 insert into public.liquidation_imported_files(liquidation_id,original_name,sha256,storage_path,size_bytes,mime_type,detected_cutoff) values(v_id,btrim(p_nombre),lower(p_sha256),p_storage_path,p_size,p_mime,p_fecha_corte) returning id into v_file;
 for v_row in select * from jsonb_array_elements(coalesce(p_rows,'[]')) loop
  insert into public.liquidation_source_rows(liquidation_id,file_id,sheet_name,row_number,movement_type,source_key,original_data)
  values(v_id,v_file,coalesce(v_row->>'sheet','Datos'),(v_row->>'row_number')::int,v_row->>'movement_type',v_row->>'source_key',v_row->'original');
 end loop;
 for v_op in select * from jsonb_array_elements(coalesce(p_operations,'[]')) loop
  insert into public.liquidation_operations(liquidation_id,plataforma,source_key,external_id,operation_at,establishment_name,origen_codigo,tipo_establecimiento,ejecutivo_id,cliente_documento,cliente_nombre,imei,referencia,modelo,monto_credito,monto_base,inicial,accesorios_cantidad,accesorios,reconocida,normalized_data)
  values(v_id,p_plataforma,v_op->>'sourceKey',v_op->>'externalId',(v_op->>'fecha')::timestamptz,v_op->>'establecimientoNombre',nullif(v_op#>>'{establecimiento,codigo}',''),coalesce(nullif(v_op->>'tipoEstablecimiento',''),'no_reconocido'),nullif(v_op#>>'{ejecutivo,id}','')::uuid,v_op->>'clienteDocumento',v_op->>'clienteNombre',v_op->>'imei',v_op->>'referencia',v_op->>'modelo',nullif(v_op->>'montoCredito','')::numeric,(v_op->>'montoBase')::numeric,coalesce((v_op->>'inicial')::numeric,0),coalesce((v_op->>'accesoriosCantidad')::integer,0),coalesce((v_op->>'accesorios')::numeric,0),coalesce((v_op->>'reconocida')::boolean,false),v_op);
 end loop;
 for v_inc in select * from jsonb_array_elements(coalesce(p_incidents,'[]')) loop
  insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion)
  select v_id,o.id,v_inc->>'tipo',coalesce(v_inc->>'descripcion',v_inc->>'tipo') from public.liquidation_operations o where o.liquidation_id=v_id and o.source_key=v_inc->>'sourceKey' on conflict do nothing;
 end loop;
 if jsonb_array_length(coalesce(p_incidents,'[]'))>0 then
  update public.liquidations set estado='con_novedades' where id=v_id;
  insert into public.liquidation_domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key) values('liquidation.has_incidents','liquidation',v_id,jsonb_build_object('liquidation_id',v_id,'incident_count',jsonb_array_length(p_incidents)),v_id||':has_incidents');
 end if;
 insert into public.liquidation_domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key) values('liquidation.imported','liquidation',v_id,jsonb_build_object('liquidation_id',v_id,'platform',p_plataforma),v_id||':imported');
 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),'aliados_liquidacion_importada','liquidations',v_id,jsonb_build_object('plataforma',p_plataforma,'sha256',p_sha256,'archivo',p_nombre));
 return v_id;
end; $$;

create or replace function public.aliados_cambiar_estado(p_id uuid,p_estado text,p_comentario text default null)
returns public.liquidations language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.liquidations%rowtype;v_anterior text;v_event text;
begin
 select * into v from public.liquidations where id=p_id for update; if not found then raise exception 'Liquidación no encontrada'; end if; v_anterior=v.estado;
 if p_estado='validada' then
  if not public.tiene_capacidad_aliados('revisor') then raise exception 'Solo Maite/revisor puede validar'; end if;
  if v.estado not in('importada','con_novedades') then raise exception 'Transición inválida'; end if;
  if exists(select 1 from public.liquidation_incidents where liquidation_id=p_id and bloquea_aprobacion and estado='abierta') then raise exception 'Resuelva las novedades antes de validar'; end if;
  update public.liquidations set estado='validada',updated_at=now() where id=p_id returning * into v;v_event='liquidation.validated';
 elsif p_estado='revisada' then
  if not public.tiene_capacidad_aliados('revisor') then raise exception 'Solo Maite/revisor puede revisar'; end if;
  if v.estado<>'calculada' then raise exception 'Transición inválida'; end if;
  update public.liquidations set estado='revisada',reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=p_id returning * into v;
  insert into public.liquidation_approvals(liquidation_id,etapa,decision,comentario) values(p_id,'revision','aprobada',p_comentario) on conflict do nothing;v_event='liquidation.reviewed';
 elsif p_estado='con_novedades' then
  if not public.tiene_capacidad_aliados('aprobador') then raise exception 'Solo Óscar/aprobador puede devolver la liquidación'; end if;
  if v.estado not in('calculada','revisada') then raise exception 'Transición inválida'; end if;
  if nullif(btrim(p_comentario),'') is null then raise exception 'El motivo es obligatorio'; end if;
  update public.liquidations set estado='con_novedades',reviewed_at=null,reviewed_by=null,updated_at=now() where id=p_id returning * into v;
  insert into public.liquidation_approvals(liquidation_id,etapa,decision,comentario) values(p_id,'revision','correccion',p_comentario) on conflict do nothing;v_event='liquidation.has_incidents';
 elsif p_estado='aprobada' then
  if not public.tiene_capacidad_aliados('aprobador') then raise exception 'Solo Óscar/aprobador puede aprobar'; end if;
  if v.estado<>'revisada' then raise exception 'Transición inválida'; end if;
  if exists(select 1 from public.liquidation_incidents where liquidation_id=p_id and bloquea_aprobacion and estado='abierta') then raise exception 'Existen novedades que bloquean la aprobación'; end if;
  if exists(select 1 from public.liquidation_operations where liquidation_id=p_id and tipo_establecimiento='propia' and coalesce(pagamos,0)<=0) then raise exception 'operacion_tienda_sin_pagamos';end if;
  if exists(select 1 from public.liquidation_operations where liquidation_id=p_id and tipo_establecimiento='propia' and diferencia_inicial<>0 and diferencia_revisada_at is null) then raise exception 'diferencia_inicial_sin_revisar';end if;
  if exists(select 1 from public.payment_orders po left join public.beneficiary_bank_accounts ba on ba.id=po.bank_account_id where po.liquidation_id=p_id and (ba.id is null or not ba.validada)) then raise exception 'Beneficiario sin cuenta bancaria validada'; end if;
  if v.total_pagar<>(select coalesce(sum(valor),0) from public.payment_orders where liquidation_id=p_id and estado not in('rechazado','anulado')) then raise exception 'Pago total diferente al detalle'; end if;
  update public.liquidations set estado='aprobada',approved_by=auth.uid(),approved_at=now(),frozen_at=now(),updated_at=now() where id=p_id returning * into v;
  insert into public.liquidation_approvals(liquidation_id,etapa,decision,comentario) values(p_id,'aprobacion','aprobada',p_comentario) on conflict do nothing;v_event='liquidation.approved';
 else raise exception 'Transición no habilitada por este RPC'; end if;
 insert into public.liquidation_domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key) values(v_event,'liquidation',p_id,jsonb_build_object('liquidation_id',p_id),p_id||':'||p_estado) on conflict(idempotency_key) do nothing;
 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),'aliados_liquidacion_'||p_estado,'liquidations',p_id,jsonb_build_object('anterior',v_anterior,'nuevo',p_estado,'comentario',p_comentario));return v;
end; $$;

create or replace function public.aliados_calcular_liquidacion(p_id uuid)
returns public.liquidations language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.liquidations%rowtype;o public.liquidation_operations%rowtype;p public.settlement_policy_versions%rowtype;
 b public.liquidation_beneficiaries%rowtype;a public.beneficiary_bank_accounts%rowtype;c public.liquidation_calculations%rowtype;
 bn public.liquidation_bonuses%rowtype;
 v_count int;v_policy_id uuid;v_base numeric;v_bonus numeric;v_order uuid;v_tot_base numeric:=0;v_tot_pago numeric:=0;v_tot_bonus numeric:=0;v_tot_util numeric:=0;
 v_tot_tiendas numeric:=0;v_util_tiendas numeric:=0;v_count_tiendas integer:=0;v_count_aliados integer:=0;
begin
 if not public.tiene_capacidad_aliados('revisor') then raise exception 'No autorizado para calcular'; end if;
 select * into v from public.liquidations where id=p_id for update; if not found then raise exception 'Liquidación no encontrada'; end if;
 if v.estado not in('validada','calculada') then raise exception 'La liquidación debe estar validada'; end if;
 delete from public.payment_items where payment_order_id in(select id from public.payment_orders where liquidation_id=p_id and estado='pendiente');
 delete from public.payment_orders where liquidation_id=p_id and estado='pendiente';delete from public.liquidation_calculations where liquidation_id=p_id;
 for o in select * from public.liquidation_operations where liquidation_id=p_id and tipo_establecimiento='aliado' loop
  if not o.reconocida then insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,o.id,'operacion_no_reconocida','La plataforma no reconoce la operación') on conflict do nothing;continue;end if;
  if o.ejecutivo_id is null then insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,o.id,'aliado_sin_ejecutivo','El aliado no tiene ejecutivo vigente') on conflict do nothing;continue;end if;
  select count(*),min(id::text)::uuid into v_count,v_policy_id from public.settlement_policy_versions where plataforma=o.plataforma and tipo_establecimiento='aliado' and estado='aprobada' and vigente_desde<=o.operation_at::date and (vigente_hasta is null or vigente_hasta>=o.operation_at::date);
  if v_count<>1 then insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,o.id,case when v_count=0 then 'politica_ausente' else 'politica_ambigua' end,'No existe una política única vigente') on conflict do nothing;continue;end if;
  select * into p from public.settlement_policy_versions where id=v_policy_id;
  v_base:=case p.base_field when 'monto_credito' then o.monto_credito else o.monto_base end;
  if v_base is null or v_base<0 then insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,o.id,'base_liquidable_invalida','La base indicada por la política no está disponible') on conflict do nothing;continue;end if;
  select coalesce(sum(valor),0) into v_bonus from public.liquidation_bonuses where operation_id=o.id and estado='aprobado';
  insert into public.liquidation_calculations(liquidation_id,operation_id,policy_version_id,policy_snapshot,pagamos,pago_aliado,total_bonos,utilidad_creditek,explanation)
  values(p_id,o.id,p.id,to_jsonb(p),round(v_base*p.porcentaje,2),round(v_base*p.porcentaje-o.inicial,2),v_bonus,round(v_base-(v_base*p.porcentaje-o.inicial)-v_bonus,2),jsonb_build_object('base_field',p.base_field,'base_liquidable',v_base,'monto_total_original',o.monto_base,'accesorios_cantidad',o.accesorios_cantidad,'accesorios_valor',o.accesorios,'porcentaje',p.porcentaje,'inicial',o.inicial,'formula',p.formula_code)) returning * into c;
  if c.pago_aliado<0 or c.utilidad_creditek<0 then raise exception 'valor_negativo_imposible';end if;
  select * into b from public.liquidation_beneficiaries where tipo='aliado' and origen_codigo=o.origen_codigo and activo limit 1;
  if not found then insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,o.id,'beneficiario_sin_identificacion','No existe beneficiario del aliado') on conflict do nothing;continue;end if;
  select * into a from public.beneficiary_bank_accounts where beneficiary_id=b.id and activo and validada order by validada_at desc limit 1;
  if not found then insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,o.id,'cuenta_bancaria_no_validada','El aliado no tiene cuenta validada') on conflict do nothing;continue;end if;
  insert into public.payment_orders(liquidation_id,beneficiary_id,bank_account_id,valor,idempotency_key) values(p_id,b.id,a.id,c.pago_aliado,gen_random_uuid())
  on conflict(liquidation_id,beneficiary_id) do update set valor=public.payment_orders.valor+excluded.valor returning id into v_order;
  insert into public.payment_items(payment_order_id,operation_id,concepto,valor) values(v_order,o.id,'pago_aliado',c.pago_aliado);
  v_tot_base:=v_tot_base+v_base;v_tot_pago:=v_tot_pago+c.pago_aliado;v_tot_bonus:=v_tot_bonus+v_bonus;v_tot_util:=v_tot_util+c.utilidad_creditek;
  v_count_aliados:=v_count_aliados+1;
 end loop;
 for o in select * from public.liquidation_operations where liquidation_id=p_id and tipo_establecimiento='propia' loop
  if coalesce(o.pagamos,0)<=0 then insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,o.id,'operacion_tienda_sin_pagamos','Óscar debe definir Pagamos para esta operación') on conflict do nothing;continue;end if;
  if o.inicial_kora is null or o.costo_equipo is null or o.pago_neto_tienda is null then insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,o.id,'imei_no_resuelto','No fue posible congelar inicial y costo por IMEI') on conflict do nothing;continue;end if;
  if o.diferencia_inicial<>0 and o.diferencia_revisada_at is null then insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,o.id,'diferencia_inicial_sin_revisar','Maite debe revisar y justificar la diferencia de inicial') on conflict do nothing;continue;end if;
  select * into b from public.liquidation_beneficiaries where tipo='otro' and origen_codigo=o.origen_codigo and activo limit 1;
  if not found then insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,o.id,'beneficiario_tienda_ausente','La tienda no tiene beneficiario de pago') on conflict do nothing;continue;end if;
  select * into a from public.beneficiary_bank_accounts where beneficiary_id=b.id and activo and validada order by validada_at desc limit 1;
  if not found then insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,o.id,'cuenta_bancaria_no_validada','La tienda no tiene cuenta validada') on conflict do nothing;continue;end if;
  insert into public.payment_orders(liquidation_id,beneficiary_id,bank_account_id,valor,idempotency_key) values(p_id,b.id,a.id,o.pago_neto_tienda,gen_random_uuid())
  on conflict(liquidation_id,beneficiary_id) do update set valor=public.payment_orders.valor+excluded.valor returning id into v_order;
  insert into public.payment_items(payment_order_id,operation_id,concepto,valor) values(v_order,o.id,'pago_tienda',o.pago_neto_tienda);
  v_tot_base:=v_tot_base+case when o.plataforma='payjoy' then coalesce(o.monto_credito,o.monto_base)-o.inicial_kora else o.monto_base end;
  v_tot_tiendas:=v_tot_tiendas+o.pago_neto_tienda;v_util_tiendas:=v_util_tiendas+o.utilidad_tienda;v_tot_util:=v_tot_util+o.utilidad_creditek_tienda;v_count_tiendas:=v_count_tiendas+1;
 end loop;
 for bn in select * from public.liquidation_bonuses where liquidation_id=p_id and estado='aprobado' loop
  select * into a from public.beneficiary_bank_accounts where beneficiary_id=bn.beneficiary_id and activo and validada order by validada_at desc limit 1;
  if not found then insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,bn.operation_id,'bono_beneficiario_sin_cuenta','El beneficiario del bono no tiene cuenta validada') on conflict do nothing;continue;end if;
  insert into public.payment_orders(liquidation_id,beneficiary_id,bank_account_id,valor,idempotency_key) values(p_id,bn.beneficiary_id,a.id,bn.valor,gen_random_uuid())
  on conflict(liquidation_id,beneficiary_id) do update set valor=public.payment_orders.valor+excluded.valor returning id into v_order;
  insert into public.payment_items(payment_order_id,operation_id,bonus_id,concepto,valor) values(v_order,bn.operation_id,bn.id,'bono_'||bn.tipo_bono,bn.valor);
 end loop;
 if exists(select 1 from public.liquidation_incidents where liquidation_id=p_id and estado='abierta' and bloquea_aprobacion) then update public.liquidations set estado='con_novedades',updated_at=now() where id=p_id returning * into v;return v;end if;
 update public.liquidations set estado='calculada',total_operaciones=v_tot_base,total_pago_aliados=v_tot_pago,total_pago_tiendas=v_tot_tiendas,total_bonos=v_tot_bonus,total_utilidad_creditek=v_tot_util,total_utilidad_tiendas=v_util_tiendas,total_pagar=v_tot_pago+v_tot_tiendas+v_tot_bonus,operaciones_tiendas=v_count_tiendas,operaciones_aliados=v_count_aliados,updated_at=now() where id=p_id returning * into v;
 insert into public.liquidation_domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key) values('liquidation.calculated','liquidation',p_id,jsonb_build_object('liquidation_id',p_id,'platform',v.plataforma),p_id||':calculated') on conflict do nothing;
 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),'aliados_liquidacion_calculada','liquidations',p_id,jsonb_build_object('total_pagar',v.total_pagar));return v;
end; $$;

create or replace function public.aliados_guardar_bono(p_liquidation_id uuid,p_operation_id uuid,p_beneficiary_id uuid,p_tipo text,p_valor numeric,p_motivo text,p_idempotency_key uuid)
returns public.liquidation_bonuses language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.liquidation_bonuses%rowtype;s text;
begin
 if not public.tiene_capacidad_aliados('revisor') then raise exception 'No autorizado para bonos';end if;
 select estado into s from public.liquidations where id=p_liquidation_id for update;if s not in('importada','validada','con_novedades','calculada') then raise exception 'Liquidación congelada';end if;
 select * into v from public.liquidation_bonuses where idempotency_key=p_idempotency_key;if found then return v;end if;
 insert into public.liquidation_bonuses(liquidation_id,operation_id,beneficiary_id,tipo_bono,valor,motivo,estado,idempotency_key) values(p_liquidation_id,p_operation_id,p_beneficiary_id,btrim(p_tipo),p_valor,btrim(p_motivo),'aprobado',p_idempotency_key) returning * into v;
 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),'aliados_bono_manual','liquidation_bonuses',v.id,to_jsonb(v));return v;
end; $$;

create or replace function public.aliados_resolver_operaciones_propias(p_liquidation_id uuid)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.liquidation_operations%rowtype;v_count integer;v_venta uuid;v_credito uuid;v_unidad uuid;v_inicial numeric;v_costo numeric;v_resueltas integer:=0;
begin
 if not public.tiene_capacidad_aliados('revisor') then raise exception 'No autorizado para revisar Operaciones Retail';end if;
 if exists(select 1 from public.liquidations where id=p_liquidation_id and frozen_at is not null) then raise exception 'Liquidación aprobada inmutable';end if;
 for o in select * from public.liquidation_operations where liquidation_id=p_liquidation_id and tipo_establecimiento='propia' loop
  select count(*),min(v.id::text)::uuid,min(c.id::text)::uuid,min(u.id::text)::uuid,min(c.cuota_inicial),min(coalesce(u.costo_remision,u.precio_tienda))
  into v_count,v_venta,v_credito,v_unidad,v_inicial,v_costo
  from public.venta_items vi join public.ventas v on v.id=vi.venta_id
  join public.creditos c on c.venta_id=v.id join public.unidades u on u.id=vi.unidad_id
  where regexp_replace(coalesce(u.imei,''),'[^0-9A-Za-z]','','g')=regexp_replace(coalesce(o.imei,''),'[^0-9A-Za-z]','','g')
    and v.tienda_codigo=o.origen_codigo and not coalesce(v.anulada,false);
  delete from public.liquidation_incidents where liquidation_id=p_liquidation_id and operation_id=o.id and tipo in('imei_no_existe','imei_duplicado','imei_otra_tienda','diferencia_inicial_sin_revisar');
  if v_count=0 then
   if exists(select 1 from public.unidades u where regexp_replace(coalesce(u.imei,''),'[^0-9A-Za-z]','','g')=regexp_replace(coalesce(o.imei,''),'[^0-9A-Za-z]','','g')) then
    insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_liquidation_id,o.id,'imei_otra_tienda','El IMEI existe en KORA, pero no pertenece a la tienda reportada') on conflict do nothing;
   else
    insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_liquidation_id,o.id,'imei_no_existe','El IMEI no tiene una venta o crédito válido en KORA') on conflict do nothing;
   end if;continue;
  elsif v_count>1 then
   insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_liquidation_id,o.id,'imei_duplicado','El IMEI está asociado a más de una venta o crédito') on conflict do nothing;continue;
  end if;
  update public.liquidation_operations set venta_id=v_venta,credito_id=v_credito,unidad_id=v_unidad,inicial_kora=v_inicial,
   diferencia_inicial=case when plataforma='payjoy' then v_inicial-inicial else inicial-v_inicial end,costo_equipo=v_costo,snapshot_tienda_at=now()
  where id=o.id;
  if v_inicial is distinct from o.inicial then
   insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion)
   values(p_liquidation_id,o.id,'diferencia_inicial_sin_revisar','La inicial registrada en KORA difiere de la reportada por la plataforma') on conflict do nothing;
  end if;v_resueltas:=v_resueltas+1;
 end loop;
 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),'aliados_tiendas_resueltas','liquidations',p_liquidation_id,jsonb_build_object('operaciones',v_resueltas));
 return v_resueltas;
end; $$;

create or replace function public.aliados_reportar_novedad(p_id uuid,p_operation_id uuid,p_descripcion text)
returns public.liquidation_incidents language plpgsql security definer set search_path=public,pg_temp as $$
declare i public.liquidation_incidents%rowtype;
begin
 if not public.tiene_capacidad_aliados('revisor') then raise exception 'No autorizado para reportar novedades';end if;
 if nullif(btrim(p_descripcion),'') is null then raise exception 'La descripción es obligatoria';end if;
 if exists(select 1 from public.liquidations where id=p_id and frozen_at is not null) then raise exception 'Liquidación aprobada inmutable';end if;
 insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion)
 values(p_id,p_operation_id,'novedad_administrativa',btrim(p_descripcion)) returning * into i;
 update public.liquidations set estado='con_novedades',updated_at=now() where id=p_id and estado<>'con_novedades';
 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),'aliados_novedad_reportada','liquidations',p_id,jsonb_build_object('descripcion',p_descripcion));return i;
end; $$;

create or replace function public.aliados_resolver_novedad(p_incident_id uuid,p_justificacion text)
returns public.liquidation_incidents language plpgsql security definer set search_path=public,pg_temp as $$
declare i public.liquidation_incidents%rowtype;
begin
 if not public.tiene_capacidad_aliados('revisor') then raise exception 'Solo Maite/revisor puede resolver novedades';end if;
 if nullif(btrim(p_justificacion),'') is null then raise exception 'La justificación es obligatoria';end if;
 select * into i from public.liquidation_incidents where id=p_incident_id for update;if not found then raise exception 'Novedad no encontrada';end if;
 if exists(select 1 from public.liquidations where id=i.liquidation_id and frozen_at is not null) then raise exception 'Liquidación aprobada inmutable';end if;
 update public.liquidation_incidents set estado='resuelta',resolution=btrim(p_justificacion),resolved_by=auth.uid(),resolved_at=now() where id=i.id returning * into i;
 update public.liquidation_operations set diferencia_justificacion=btrim(p_justificacion),diferencia_revisada_por=auth.uid(),diferencia_revisada_at=now() where id=i.operation_id;
 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),'aliados_novedad_resuelta','liquidations',i.liquidation_id,jsonb_build_object('tipo',i.tipo,'justificacion',p_justificacion));return i;
end; $$;

create or replace function public.aliados_guardar_pagamos(p_operation_id uuid,p_pagamos numeric)
returns public.liquidation_operations language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.liquidation_operations%rowtype;v_diferencia numeric;v_total_real numeric;v_pago numeric;v_utilidad numeric;
begin
 if not public.tiene_capacidad_aliados('aprobador') then raise exception 'Solo Óscar/aprobador puede modificar Pagamos';end if;
 if p_pagamos is null or p_pagamos<=0 then raise exception 'Pagamos debe ser mayor que cero';end if;
 select * into o from public.liquidation_operations where id=p_operation_id for update;if not found or o.tipo_establecimiento<>'propia' then raise exception 'Operación de tienda no encontrada';end if;
 if exists(select 1 from public.liquidations where id=o.liquidation_id and frozen_at is not null) then raise exception 'Liquidación aprobada inmutable';end if;
 if o.inicial_kora is null or o.costo_equipo is null then raise exception 'Primero resuelva la venta, inicial y costo por IMEI';end if;
 v_diferencia:=case when o.plataforma='payjoy' then o.inicial_kora-o.inicial else o.inicial-o.inicial_kora end;
 v_total_real:=case when o.plataforma='payjoy' then coalesce(o.monto_credito,o.monto_base)-o.inicial_kora else o.monto_base-o.inicial_kora end;
 v_pago:=case when o.plataforma='payjoy' then p_pagamos-o.inicial_kora-v_diferencia else p_pagamos-v_diferencia-o.inicial end;
 v_utilidad:=case when o.plataforma='payjoy' then v_total_real-v_pago else o.monto_base-v_pago end;
 update public.liquidation_operations set pagamos=p_pagamos,diferencia_inicial=v_diferencia,pago_neto_tienda=v_pago,
  utilidad_creditek_tienda=v_utilidad,utilidad_tienda=p_pagamos-o.costo_equipo,snapshot_tienda_at=now() where id=o.id returning * into o;
 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),'aliados_pagamos_actualizado','liquidations',o.liquidation_id,jsonb_build_object('operation_id',o.id,'pagamos',p_pagamos));return o;
end; $$;

create or replace function public.aliados_cambiar_estado_pago(p_id uuid,p_estado text,p_soporte_path text default null)
returns public.payment_orders language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.payment_orders%rowtype;v_anterior text;v_event text;
begin
 if not public.tiene_capacidad_aliados('revisor') then raise exception 'No autorizado para gestionar pagos';end if;
 select * into v from public.payment_orders where id=p_id for update;if not found then raise exception 'Pago no encontrado';end if;
 v_anterior:=v.estado;
 if (v.estado,p_estado) not in (('pendiente','programado'),('programado','pagado'),('pagado','conciliado')) then
  raise exception 'Transición de pago inválida';
 end if;
 if p_estado in('pagado','conciliado') and not public.tiene_capacidad_aliados('aprobador') then
  raise exception 'Solo Óscar/aprobador puede confirmar el pago';
 end if;
 update public.payment_orders set estado=p_estado,
  fecha_programada=case when p_estado='programado' then current_date else fecha_programada end,
  fecha_pagada=case when p_estado='pagado' then now() else fecha_pagada end,
  soporte_path=coalesce(nullif(btrim(p_soporte_path),''),soporte_path),updated_at=now()
 where id=p_id returning * into v;
 v_event:=case p_estado when 'programado' then 'payment.scheduled' when 'pagado' then 'payment.completed' else null end;
 if v_event is not null then
  insert into public.liquidation_domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
  values(v_event,'payment',p_id,jsonb_build_object('payment_id',p_id,'liquidation_id',v.liquidation_id),p_id||':'||p_estado)
  on conflict(idempotency_key) do nothing;
 end if;
 if not exists(select 1 from public.payment_orders where liquidation_id=v.liquidation_id and estado<>p_estado) then
  update public.liquidations set estado=case p_estado when 'programado' then 'programada' when 'pagado' then 'pagada' when 'conciliado' then 'conciliada' end,updated_at=now() where id=v.liquidation_id;
 end if;
 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
 values(auth.uid(),'aliados_pago_'||p_estado,'payment_orders',p_id,jsonb_build_object('anterior',v_anterior,'nuevo',p_estado,'soporte_path',v.soporte_path));
 return v;
end; $$;

create or replace function public.aliados_impedir_cambio_aprobado() returns trigger language plpgsql as $$
begin
 if old.frozen_at is not null and (old.plataforma,old.periodo_desde,old.periodo_hasta,old.fecha_corte,old.total_operaciones,old.total_pago_aliados,old.total_bonos,old.total_utilidad_creditek,old.total_pagar)
   is distinct from (new.plataforma,new.periodo_desde,new.periodo_hasta,new.fecha_corte,new.total_operaciones,new.total_pago_aliados,new.total_bonos,new.total_utilidad_creditek,new.total_pagar)
 then raise exception 'Liquidación aprobada inmutable; use ajuste o reversión formal'; end if;return new;
end; $$;
drop trigger if exists liquidation_immutable_after_approval on public.liquidations;
create trigger liquidation_immutable_after_approval before update on public.liquidations for each row when(old.frozen_at is not null) execute function public.aliados_impedir_cambio_aprobado();

create or replace function public.aliados_impedir_cambio_operacion_aprobada() returns trigger language plpgsql as $$
begin
 if exists(select 1 from public.liquidations where id=old.liquidation_id and frozen_at is not null) then raise exception 'Liquidación aprobada inmutable; los snapshots no pueden cambiar';end if;return new;
end; $$;
drop trigger if exists liquidation_operation_immutable_after_approval on public.liquidation_operations;
create trigger liquidation_operation_immutable_after_approval before update or delete on public.liquidation_operations for each row execute function public.aliados_impedir_cambio_operacion_aprobada();

do $rls$ declare t text;begin
 foreach t in array array['aliados_operadores','liquidations','liquidation_imported_files','liquidation_source_rows','liquidation_operations','settlement_policy_versions','liquidation_calculations','liquidation_beneficiaries','beneficiary_bank_accounts','liquidation_bonuses','liquidation_incidents','payment_orders','payment_items','liquidation_approvals','liquidation_adjustments','liquidation_domain_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('drop policy if exists aliados_select on public.%I',t);
  execute format('create policy aliados_select on public.%I for select to authenticated using(public.tiene_capacidad_aliados(''revisor''))',t);
  execute format('revoke all on public.%I from public,anon',t);
  execute format('revoke insert,update,delete on public.%I from authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end;$rls$;
drop policy if exists soportes_aliados_insert on storage.objects;
create policy soportes_aliados_insert on storage.objects for insert to authenticated with check(bucket_id='soportes' and public.tiene_capacidad_aliados('revisor') and name ~ '^aliados/(originales|pagos)/[0-9a-f-]{36}\.(xlsx|xls|pdf|jpg|jpeg|png)$');
drop policy if exists soportes_aliados_select on storage.objects;
create policy soportes_aliados_select on storage.objects for select to authenticated using(bucket_id='soportes' and public.tiene_capacidad_aliados('revisor') and name ~ '^aliados/(originales|pagos)/');
drop policy if exists audit_log_aliados_select on public.audit_log;
create policy audit_log_aliados_select on public.audit_log for select to authenticated
using(public.tiene_capacidad_aliados('revisor') and tabla in('liquidations','liquidation_bonuses','payment_orders'));
grant select on public.audit_log to authenticated;
revoke all on function public.aliados_seed_politica_inicial(date),public.aliados_importar_liquidacion(text,text,text,text,bigint,text,date,date,date,jsonb,jsonb,jsonb,uuid),public.aliados_calcular_liquidacion(uuid),public.aliados_guardar_bono(uuid,uuid,uuid,text,numeric,text,uuid),public.aliados_cambiar_estado(uuid,text,text),public.aliados_cambiar_estado_pago(uuid,text,text),public.aliados_resolver_operaciones_propias(uuid),public.aliados_resolver_novedad(uuid,text),public.aliados_guardar_pagamos(uuid,numeric),public.aliados_reportar_novedad(uuid,uuid,text) from public,anon;
grant execute on function public.aliados_seed_politica_inicial(date),public.aliados_importar_liquidacion(text,text,text,text,bigint,text,date,date,date,jsonb,jsonb,jsonb,uuid),public.aliados_calcular_liquidacion(uuid),public.aliados_guardar_bono(uuid,uuid,uuid,text,numeric,text,uuid),public.aliados_cambiar_estado(uuid,text,text),public.aliados_cambiar_estado_pago(uuid,text,text),public.aliados_resolver_operaciones_propias(uuid),public.aliados_resolver_novedad(uuid,text),public.aliados_guardar_pagamos(uuid,numeric),public.aliados_reportar_novedad(uuid,uuid,text) to authenticated;
commit;
