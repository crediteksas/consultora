-- KORA-2026-000014 · Instrucciones de consignación y destino bancario.
-- Aditiva: conserva abonos históricos y reutiliza las entidades contables.
begin;

do $preflight$
begin
  if to_regclass('public.abonos') is null
     or to_regclass('public.cuenta_corriente') is null
     or to_regclass('public.movimientos_caja_tienda') is null
     or to_regclass('public.movimientos_tesoreria_central') is null
     or to_regclass('public.facturas_proveedor') is null
     or to_regclass('public.pagos_proveedor') is null
     or to_regclass('public.proveedores') is null
     or to_regclass('public.perfiles') is null
     or to_regprocedure('public.calcular_efectivo_esperado_tienda(text,date)') is null
     or to_regprocedure('public.registrar_pago_proveedor(uuid,numeric,date,text,text,text,text,uuid)') is null then
    raise exception 'Faltan dependencias para KORA-2026-000014';
  end if;
end;
$preflight$;

create table if not exists public.instrucciones_consignacion (
  id uuid primary key default gen_random_uuid(),
  tienda_codigo text not null
    references public.origenes(codigo) on update cascade on delete restrict,
  fecha date not null,
  banco text not null check (length(btrim(banco)) > 0),
  numero_cuenta text not null check (length(btrim(numero_cuenta)) > 0),
  valor_esperado numeric not null check (valor_esperado > 0),
  tipo_destino text not null check (tipo_destino in ('PROVEEDOR', 'OSCAR')),
  proveedor_id uuid references public.proveedores(id) on delete restrict,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'en_validacion', 'validado', 'rechazado')),
  observacion text,
  creada_por uuid not null default auth.uid(),
  decidida_por uuid,
  decidida_at timestamptz,
  motivo_decision text,
  decision_idempotency_key uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (tipo_destino = 'PROVEEDOR' and proveedor_id is not null)
    or (tipo_destino = 'OSCAR' and proveedor_id is null)
  )
);

create index if not exists instrucciones_consignacion_tienda_fecha_idx
  on public.instrucciones_consignacion(tienda_codigo, fecha, created_at);
create unique index if not exists instrucciones_consignacion_decision_uidx
  on public.instrucciones_consignacion(decision_idempotency_key)
  where decision_idempotency_key is not null;

create table if not exists public.comprobantes_consignacion (
  id uuid primary key default gen_random_uuid(),
  instruccion_id uuid not null
    references public.instrucciones_consignacion(id) on delete restrict,
  version integer not null check (version > 0),
  valor_confirmado numeric not null check (valor_confirmado > 0),
  soporte_path text not null check (length(btrim(soporte_path)) > 0),
  estado text not null default 'enviado'
    check (estado in ('enviado', 'validado', 'rechazado')),
  enviado_por uuid not null default auth.uid(),
  enviado_at timestamptz not null default now(),
  decidido_por uuid,
  decidido_at timestamptz,
  motivo_decision text,
  idempotency_key uuid not null unique,
  unique(instruccion_id, version)
);

create table if not exists public.aplicaciones_consignacion_proveedor (
  id uuid primary key default gen_random_uuid(),
  instruccion_id uuid not null
    references public.instrucciones_consignacion(id) on delete restrict,
  factura_id uuid not null
    references public.facturas_proveedor(id) on delete restrict,
  pago_id uuid not null
    references public.pagos_proveedor(id) on delete restrict,
  monto_aplicado numeric not null check (monto_aplicado > 0),
  orden_fifo integer not null check (orden_fifo > 0),
  created_at timestamptz not null default now(),
  unique(instruccion_id, factura_id),
  unique(pago_id)
);

alter table public.abonos
  add column if not exists instruccion_id uuid
    references public.instrucciones_consignacion(id) on delete restrict;
create unique index if not exists abonos_instruccion_id_uidx
  on public.abonos(instruccion_id)
  where instruccion_id is not null;

-- El movimiento OSCAR reutiliza Tesorería Central y queda identificado como
-- salida B2B financiada con el efectivo consignado por la tienda.
alter table public.movimientos_tesoreria_central
  drop constraint if exists movimientos_tesoreria_central_tipo_check;
alter table public.movimientos_tesoreria_central
  add constraint movimientos_tesoreria_central_tipo_check check (
    tipo in ('compra_contado', 'reverso_compra_contado', 'salida_oscar')
  );
alter table public.movimientos_tesoreria_central
  drop constraint if exists movimientos_tesoreria_central_fuente_fondos_check;
alter table public.movimientos_tesoreria_central
  add constraint movimientos_tesoreria_central_fuente_fondos_check check (
    fuente_fondos in ('caja_central', 'banco_corporativo', 'efectivo_tienda')
  );

create or replace function public.proteger_snapshot_instruccion_consignacion()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.tienda_codigo is distinct from old.tienda_codigo
     or new.fecha is distinct from old.fecha
     or new.banco is distinct from old.banco
     or new.numero_cuenta is distinct from old.numero_cuenta
     or new.valor_esperado is distinct from old.valor_esperado
     or new.tipo_destino is distinct from old.tipo_destino
     or new.proveedor_id is distinct from old.proveedor_id
     or new.creada_por is distinct from old.creada_por
     or new.created_at is distinct from old.created_at then
    raise exception 'El snapshot bancario de la instrucción es inmutable';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists instrucciones_consignacion_snapshot_inmutable
  on public.instrucciones_consignacion;
create trigger instrucciones_consignacion_snapshot_inmutable
before update on public.instrucciones_consignacion
for each row execute function public.proteger_snapshot_instruccion_consignacion();

alter table public.instrucciones_consignacion enable row level security;
alter table public.comprobantes_consignacion enable row level security;
alter table public.aplicaciones_consignacion_proveedor enable row level security;

drop policy if exists instrucciones_consignacion_central_select
  on public.instrucciones_consignacion;
create policy instrucciones_consignacion_central_select
on public.instrucciones_consignacion for select to authenticated
using (coalesce(public.es_central(), false));

drop policy if exists comprobantes_consignacion_central_select
  on public.comprobantes_consignacion;
create policy comprobantes_consignacion_central_select
on public.comprobantes_consignacion for select to authenticated
using (coalesce(public.es_central(), false));

drop policy if exists aplicaciones_consignacion_central_select
  on public.aplicaciones_consignacion_proveedor;
create policy aplicaciones_consignacion_central_select
on public.aplicaciones_consignacion_proveedor for select to authenticated
using (coalesce(public.es_central(), false));

revoke all on public.instrucciones_consignacion from public, anon;
revoke insert, update, delete on public.instrucciones_consignacion from authenticated;
grant select on public.instrucciones_consignacion to authenticated;
revoke all on public.comprobantes_consignacion from public, anon;
revoke insert, update, delete on public.comprobantes_consignacion from authenticated;
grant select on public.comprobantes_consignacion to authenticated;
revoke all on public.aplicaciones_consignacion_proveedor from public, anon;
revoke insert, update, delete on public.aplicaciones_consignacion_proveedor from authenticated;
grant select on public.aplicaciones_consignacion_proveedor to authenticated;

create or replace function public.crear_instruccion_consignacion(
  p_tienda_codigo text,
  p_fecha date,
  p_banco text,
  p_numero_cuenta text,
  p_valor_esperado numeric,
  p_tipo_destino text,
  p_proveedor_id uuid default null,
  p_observacion text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_perfil public.perfiles%rowtype;
  v_efectivo numeric;
  v_reservado numeric;
  v_instruccion public.instrucciones_consignacion%rowtype;
begin
  select * into v_perfil
  from public.perfiles
  where id = auth.uid() and activo = true;
  if not found or v_perfil.rol not in ('gerencia', 'auditoria') then
    raise exception 'Solo Oscar o Maythe pueden crear instrucciones';
  end if;
  if p_fecha is null or p_valor_esperado is null or p_valor_esperado <= 0
     or nullif(btrim(coalesce(p_banco, '')), '') is null
     or nullif(btrim(coalesce(p_numero_cuenta, '')), '') is null
     or p_tipo_destino not in ('PROVEEDOR', 'OSCAR') then
    raise exception 'Tienda, fecha, banco, cuenta, valor y destino son obligatorios';
  end if;
  if (p_tipo_destino = 'PROVEEDOR' and p_proveedor_id is null)
     or (p_tipo_destino = 'OSCAR' and p_proveedor_id is not null) then
    raise exception 'El proveedor no corresponde al tipo de destino';
  end if;
  if p_tipo_destino = 'PROVEEDOR' and not exists (
    select 1 from public.proveedores
    where id = p_proveedor_id and activo = true
  ) then
    raise exception 'El proveedor debe estar activo';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_tienda_codigo || p_fecha::text, 0));
  v_efectivo := coalesce(
    (public.calcular_efectivo_esperado_tienda(p_tienda_codigo, p_fecha)->>'esperado')::numeric,
    0
  );
  select coalesce(sum(valor_esperado), 0) into v_reservado
  from public.instrucciones_consignacion
  where tienda_codigo = p_tienda_codigo
    and fecha = p_fecha
    and estado in ('pendiente', 'en_validacion');
  if p_valor_esperado > v_efectivo - v_reservado then
    raise exception 'El valor supera el efectivo disponible sin asignar';
  end if;

  insert into public.instrucciones_consignacion(
    tienda_codigo, fecha, banco, numero_cuenta, valor_esperado,
    tipo_destino, proveedor_id, observacion, creada_por
  ) values (
    p_tienda_codigo, p_fecha, btrim(p_banco), btrim(p_numero_cuenta),
    p_valor_esperado, p_tipo_destino, p_proveedor_id,
    nullif(btrim(coalesce(p_observacion, '')), ''), auth.uid()
  )
  returning * into v_instruccion;

  return jsonb_build_object('ok', true, 'instruccion_id', v_instruccion.id);
end;
$$;

create or replace function public.listar_instrucciones_consignacion()
returns setof jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_perfil public.perfiles%rowtype;
begin
  select * into v_perfil
  from public.perfiles
  where id = auth.uid() and activo = true;
  if not found then
    raise exception 'Perfil activo requerido';
  end if;

  return query
  select
    jsonb_build_object(
      'id', i.id,
      'tienda_codigo', i.tienda_codigo,
      'fecha', i.fecha,
      'banco', i.banco,
      'numero_cuenta', i.numero_cuenta,
      'valor_esperado', i.valor_esperado,
      'estado', i.estado,
      'created_at', i.created_at,
      'comprobante_id', c.id,
      'comprobante_version', c.version,
      'valor_confirmado', c.valor_confirmado,
      'soporte_path', c.soporte_path,
      'motivo_decision', c.motivo_decision
    )
    || case when v_perfil.rol in ('gerencia', 'auditoria') then
      jsonb_build_object(
        'proveedor_id', i.proveedor_id,
        'proveedor_nombre', p.nombre,
        'tipo_destino', i.tipo_destino,
        'observacion', i.observacion,
        'creada_por', i.creada_por,
        'decidida_por', i.decidida_por,
        'decidida_at', i.decidida_at
      )
    else '{}'::jsonb end
  from public.instrucciones_consignacion i
  left join public.proveedores p on p.id = i.proveedor_id
  left join lateral (
    select cc.*
    from public.comprobantes_consignacion cc
    where cc.instruccion_id = i.id
    order by cc.version desc
    limit 1
  ) c on true
  where v_perfil.rol in ('gerencia', 'auditoria')
     or i.tienda_codigo = v_perfil.tienda_codigo
  order by i.fecha desc, i.created_at desc;
end;
$$;

create or replace function public.enviar_comprobante_consignacion(
  p_instruccion_id uuid,
  p_valor_confirmado numeric,
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
  v_instruccion public.instrucciones_consignacion%rowtype;
  v_comprobante public.comprobantes_consignacion%rowtype;
  v_version integer;
begin
  select * into v_perfil
  from public.perfiles
  where id = auth.uid() and activo = true;
  if not found or v_perfil.rol in ('gerencia', 'auditoria') then
    raise exception 'La tienda debe enviar el comprobante';
  end if;

  select * into v_comprobante
  from public.comprobantes_consignacion
  where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object(
      'ok', true, 'reutilizado', true, 'comprobante_id', v_comprobante.id
    );
  end if;

  select * into v_instruccion
  from public.instrucciones_consignacion
  where id = p_instruccion_id
  for update;
  if not found then
    raise exception 'Instrucción no encontrada';
  end if;
  if v_instruccion.tienda_codigo <> v_perfil.tienda_codigo then
    raise exception 'No autorizado para esta instrucción';
  end if;
  if v_instruccion.estado not in ('pendiente', 'rechazado') then
    raise exception 'La instrucción no admite un nuevo comprobante';
  end if;
  if p_valor_confirmado is null or p_valor_confirmado <= 0
     or nullif(btrim(coalesce(p_soporte_path, '')), '') is null
     or p_idempotency_key is null then
    raise exception 'Valor, comprobante e idempotencia son obligatorios';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
  from public.comprobantes_consignacion
  where instruccion_id = p_instruccion_id;

  insert into public.comprobantes_consignacion(
    instruccion_id, version, valor_confirmado, soporte_path,
    enviado_por, idempotency_key
  ) values (
    p_instruccion_id, v_version, p_valor_confirmado, btrim(p_soporte_path),
    auth.uid(), p_idempotency_key
  )
  returning * into v_comprobante;

  update public.instrucciones_consignacion
  set estado = 'en_validacion',
      decidida_por = null,
      decidida_at = null,
      motivo_decision = null,
      decision_idempotency_key = null
  where id = p_instruccion_id;

  return jsonb_build_object(
    'ok', true, 'reutilizado', false, 'comprobante_id', v_comprobante.id
  );
end;
$$;

create or replace function public.decidir_instruccion_consignacion(
  p_instruccion_id uuid,
  p_decision text,
  p_motivo text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_perfil public.perfiles%rowtype;
  v_instruccion public.instrucciones_consignacion%rowtype;
  v_comprobante public.comprobantes_consignacion%rowtype;
  v_abono_id uuid;
  v_movimiento_caja_id uuid;
  v_movimiento_b2b_id uuid;
  v_factura public.facturas_proveedor%rowtype;
  v_pago jsonb;
  v_pago_id uuid;
  v_restante numeric;
  v_aplicar numeric;
  v_orden integer := 0;
  v_child_key uuid;
begin
  select * into v_perfil
  from public.perfiles
  where id = auth.uid() and activo = true;
  if not found or v_perfil.rol not in ('gerencia', 'auditoria') then
    raise exception 'Solo Oscar o Maythe pueden decidir instrucciones';
  end if;
  if p_decision not in ('validado', 'rechazado') or p_request_id is null then
    raise exception 'Decisión e idempotencia son obligatorias';
  end if;
  if p_decision = 'rechazado'
     and nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'El motivo de rechazo es obligatorio';
  end if;

  select * into v_instruccion
  from public.instrucciones_consignacion
  where id = p_instruccion_id
  for update;
  if not found then
    raise exception 'Instrucción no encontrada';
  end if;
  if v_instruccion.decision_idempotency_key = p_request_id then
    return jsonb_build_object(
      'ok', true, 'reutilizado', true, 'estado', v_instruccion.estado
    );
  end if;
  if v_instruccion.estado <> 'en_validacion' then
    raise exception 'La instrucción no está pendiente de validación';
  end if;

  select * into v_comprobante
  from public.comprobantes_consignacion
  where instruccion_id = p_instruccion_id
    and estado = 'enviado'
  order by version desc
  limit 1
  for update;
  if not found then
    raise exception 'No existe comprobante pendiente';
  end if;

  if p_decision = 'rechazado' then
    update public.comprobantes_consignacion
    set estado = 'rechazado', decidido_por = auth.uid(),
        decidido_at = now(), motivo_decision = btrim(p_motivo)
    where id = v_comprobante.id;
    update public.instrucciones_consignacion
    set estado = 'rechazado', decidida_por = auth.uid(), decidida_at = now(),
        motivo_decision = btrim(p_motivo), decision_idempotency_key = p_request_id
    where id = p_instruccion_id;
    return jsonb_build_object('ok', true, 'reutilizado', false, 'estado', 'rechazado');
  end if;

  if v_comprobante.valor_confirmado <> v_instruccion.valor_esperado then
    raise exception 'El valor confirmado no coincide con el valor esperado';
  end if;

  insert into public.abonos(
    tienda_codigo, monto, soporte_path, registrado_por, fecha,
    tipo_movimiento, tercero, concepto, fuente_fondos, observacion,
    idempotency_key, instruccion_id
  ) values (
    v_instruccion.tienda_codigo, v_instruccion.valor_esperado,
    v_comprobante.soporte_path, v_comprobante.enviado_por, v_instruccion.fecha,
    'abono_tienda', null, 'Consignación instruida por Creditek',
    'efectivo_tienda', 'KORA-2026-000014', p_request_id, v_instruccion.id
  )
  returning id into v_abono_id;

  insert into public.cuenta_corriente(
    tienda_codigo, tipo, concepto, monto,
    referencia_tipo, referencia_id, usuario
  ) values (
    v_instruccion.tienda_codigo, 'abono', 'Consignación validada',
    v_instruccion.valor_esperado, 'abono', v_abono_id, auth.uid()
  );

  v_child_key := md5(p_request_id::text || ':caja')::uuid;
  insert into public.movimientos_caja_tienda(
    tienda_codigo, fecha, tipo, monto, soporte_path, observacion,
    autorizado_por, creado_por, idempotency_key
  ) values (
    v_instruccion.tienda_codigo, v_instruccion.fecha, 'consignacion',
    v_instruccion.valor_esperado, v_comprobante.soporte_path,
    'Consignación instrucción ' || v_instruccion.id::text,
    auth.uid(), auth.uid(), v_child_key
  )
  returning id into v_movimiento_caja_id;

  update public.abonos
  set movimiento_caja_id = v_movimiento_caja_id
  where id = v_abono_id;

  if v_instruccion.tipo_destino = 'PROVEEDOR' then
    v_restante := v_instruccion.valor_esperado;
    for v_factura in
      select *
      from public.facturas_proveedor
      where proveedor_id = v_instruccion.proveedor_id
        and saldo > 0
      order by fecha, created_at, id
      for update
    loop
      exit when v_restante <= 0;
      v_aplicar := least(v_restante, v_factura.saldo);
      v_orden := v_orden + 1;
      v_child_key := md5(
        p_request_id::text || ':factura:' || v_factura.id::text
      )::uuid;
      v_pago := public.registrar_pago_proveedor(
        v_factura.id, v_aplicar, v_instruccion.fecha, 'consignacion_tienda',
        v_instruccion.id::text, v_comprobante.soporte_path,
        'Aplicación FIFO KORA-2026-000014', v_child_key
      );
      v_pago_id := (v_pago->>'pago_id')::uuid;
      insert into public.aplicaciones_consignacion_proveedor(
        instruccion_id, factura_id, pago_id, monto_aplicado, orden_fifo
      ) values (
        v_instruccion.id, v_factura.id, v_pago_id, v_aplicar, v_orden
      );
      v_restante := v_restante - v_aplicar;
    end loop;
    if v_restante > 0 then
      raise exception 'La cartera del proveedor no cubre el valor de la instrucción';
    end if;
  elsif v_instruccion.tipo_destino = 'OSCAR' then
    v_child_key := md5(p_request_id::text || ':b2b')::uuid;
    insert into public.movimientos_tesoreria_central(
      fecha, tipo, fuente_fondos, monto, referencia_tipo, referencia_id,
      soporte_path, observacion, creado_por, idempotency_key
    ) values (
      v_instruccion.fecha, 'salida_oscar', 'efectivo_tienda',
      v_instruccion.valor_esperado, 'instruccion_consignacion',
      v_instruccion.id, v_comprobante.soporte_path,
      'Salida interna Creditek B2B · OSCAR', auth.uid(), v_child_key
    )
    returning id into v_movimiento_b2b_id;
  end if;

  update public.comprobantes_consignacion
  set estado = 'validado', decidido_por = auth.uid(),
      decidido_at = now(), motivo_decision = null
  where id = v_comprobante.id;
  update public.instrucciones_consignacion
  set estado = 'validado', decidida_por = auth.uid(), decidida_at = now(),
      motivo_decision = null, decision_idempotency_key = p_request_id
  where id = p_instruccion_id;

  return jsonb_build_object(
    'ok', true, 'reutilizado', false, 'estado', 'validado',
    'abono_id', v_abono_id, 'movimiento_caja_id', v_movimiento_caja_id,
    'movimiento_b2b_id', v_movimiento_b2b_id, 'facturas_aplicadas', v_orden
  );
end;
$$;

revoke all on function public.crear_instruccion_consignacion(
  text, date, text, text, numeric, text, uuid, text
) from public, anon;
grant execute on function public.crear_instruccion_consignacion(
  text, date, text, text, numeric, text, uuid, text
) to authenticated;
revoke all on function public.listar_instrucciones_consignacion()
  from public, anon;
grant execute on function public.listar_instrucciones_consignacion()
  to authenticated;
revoke all on function public.enviar_comprobante_consignacion(
  uuid, numeric, text, uuid
) from public, anon;
grant execute on function public.enviar_comprobante_consignacion(
  uuid, numeric, text, uuid
) to authenticated;
revoke all on function public.decidir_instruccion_consignacion(
  uuid, text, text, uuid
) from public, anon;
grant execute on function public.decidir_instruccion_consignacion(
  uuid, text, text, uuid
) to authenticated;
revoke all on function public.proteger_snapshot_instruccion_consignacion()
  from public, anon, authenticated;

commit;
