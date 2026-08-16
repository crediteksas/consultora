begin;

do $$
begin
  if to_regclass('public.caja_diaria') is null
     or to_regclass('public.ventas') is null
     or to_regclass('public.creditos') is null
     or to_regclass('public.gastos') is null
     or to_regclass('public.perfiles') is null then
    raise exception 'Faltan tablas requeridas para calcular el efectivo esperado';
  end if;
end;
$$;

alter table public.caja_diaria
  add column if not exists apertura numeric not null default 0,
  add column if not exists contado_ventas numeric not null default 0,
  add column if not exists financiado_ventas numeric not null default 0,
  add column if not exists iniciales numeric not null default 0,
  add column if not exists otros_ingresos numeric not null default 0,
  add column if not exists gastos_efectivo numeric not null default 0,
  add column if not exists salidas_explicitas numeric not null default 0;

create table if not exists public.movimientos_caja_tienda (
  id uuid primary key default gen_random_uuid(),
  tienda_codigo text not null
    references public.origenes(codigo) on update cascade on delete restrict,
  fecha date not null,
  tipo text not null check (
    tipo in (
      'abono',
      'otro_ingreso',
      'transferencia_central',
      'pago_directo_central',
      'retiro',
      'consignacion',
      'devolucion_efectivo'
    )
  ),
  monto numeric not null check (monto > 0),
  soporte_path text not null,
  observacion text not null check (length(trim(observacion)) > 0),
  autorizado_por uuid not null,
  creado_por uuid not null default auth.uid(),
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now()
);

create index if not exists movimientos_caja_tienda_fecha_idx
  on public.movimientos_caja_tienda (tienda_codigo, fecha, created_at);

create or replace function public.impedir_edicion_movimiento_caja_tienda()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Los movimientos de caja son inmutables; registra un reverso';
end;
$$;

drop trigger if exists movimientos_caja_tienda_inmutables
  on public.movimientos_caja_tienda;
create trigger movimientos_caja_tienda_inmutables
before update or delete on public.movimientos_caja_tienda
for each row execute function public.impedir_edicion_movimiento_caja_tienda();

alter table public.movimientos_caja_tienda enable row level security;

drop policy if exists movimientos_caja_tienda_lectura
  on public.movimientos_caja_tienda;
create policy movimientos_caja_tienda_lectura
on public.movimientos_caja_tienda
for select
to authenticated
using (
  exists (
    select 1
    from public.perfiles p
    where p.id = auth.uid()
      and p.activo = true
      and (
        p.rol in ('gerencia', 'auditoria')
        or (
          p.rol = 'admin_tienda'
          and p.tienda_codigo = movimientos_caja_tienda.tienda_codigo
        )
      )
  )
);

revoke all on public.movimientos_caja_tienda from anon;
revoke insert, update, delete on public.movimientos_caja_tienda from authenticated;
grant select on public.movimientos_caja_tienda to authenticated;

create or replace function public.registrar_movimiento_caja_tienda(
  p_tienda_codigo text,
  p_fecha date,
  p_tipo text,
  p_monto numeric,
  p_soporte_path text,
  p_observacion text,
  p_autorizado_por uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if not exists (
    select 1
    from public.perfiles p
    where p.id = auth.uid()
      and p.activo = true
      and p.rol in ('gerencia', 'auditoria')
  ) then
    raise exception 'Solo Gerencia o Auditoría pueden registrar excepciones de caja';
  end if;
  if not exists (
    select 1
    from public.perfiles p
    where p.id = p_autorizado_por
      and p.activo = true
      and p.rol in ('gerencia', 'auditoria')
  ) then
    raise exception 'La autorización central no es válida';
  end if;
  if p_monto is null or p_monto <= 0
     or nullif(trim(p_soporte_path), '') is null
     or nullif(trim(p_observacion), '') is null
     or p_idempotency_key is null then
    raise exception 'Monto, soporte, observación e idempotencia son obligatorios';
  end if;

  insert into public.movimientos_caja_tienda (
    tienda_codigo,
    fecha,
    tipo,
    monto,
    soporte_path,
    observacion,
    autorizado_por,
    idempotency_key
  )
  values (
    p_tienda_codigo,
    p_fecha,
    p_tipo,
    p_monto,
    trim(p_soporte_path),
    trim(p_observacion),
    p_autorizado_por,
    p_idempotency_key
  )
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then
    select id
    into v_id
    from public.movimientos_caja_tienda
    where idempotency_key = p_idempotency_key;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.calcular_efectivo_esperado_tienda(
  p_tienda_codigo text,
  p_fecha date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_perfil public.perfiles%rowtype;
  v_apertura numeric := 0;
  v_contado numeric := 0;
  v_financiado numeric := 0;
  v_iniciales numeric := 0;
  v_otros_ingresos numeric := 0;
  v_gastos numeric := 0;
  v_salidas numeric := 0;
  v_esperado numeric := 0;
  v_caja jsonb;
begin
  if p_tienda_codigo is null or p_fecha is null then
    raise exception 'Tienda y fecha son obligatorias';
  end if;

  select *
  into v_perfil
  from public.perfiles
  where id = auth.uid()
    and activo = true;

  if not found or not (
    v_perfil.rol in ('gerencia', 'auditoria')
    or (
      v_perfil.rol = 'admin_tienda'
      and v_perfil.tienda_codigo = p_tienda_codigo
    )
  ) then
    raise exception 'No autorizado para consultar esta caja';
  end if;

  select coalesce(cd.efectivo_contado, 0)
  into v_apertura
  from public.caja_diaria cd
  where cd.tienda_codigo = p_tienda_codigo
    and cd.fecha < p_fecha
    and cd.estado = 'cerrada'
  order by cd.fecha desc
  limit 1;
  v_apertura := coalesce(v_apertura, 0);

  select
    coalesce(sum(v.total) filter (where v.tipo = 'contado'), 0),
    coalesce(sum(c.valor_esperado_financiera) filter (where v.tipo = 'credito'), 0),
    coalesce(sum(c.cuota_inicial) filter (where v.tipo = 'credito'), 0)
  into v_contado, v_financiado, v_iniciales
  from public.ventas v
  left join public.creditos c on c.venta_id = v.id
  where v.tienda_codigo = p_tienda_codigo
    and v.fecha = p_fecha
    and not coalesce(v.anulada, false);

  select coalesce(sum(g.monto), 0)
  into v_gastos
  from public.gastos g
  join public.conceptos_gasto cg on cg.id = g.concepto_id
  where g.tienda_codigo = p_tienda_codigo
    and g.fecha = p_fecha
    and (cg.preautorizado = true or g.estado = 'aprobado');

  select
    coalesce(sum(m.monto) filter (
      where m.tipo in ('abono', 'otro_ingreso')
    ), 0),
    coalesce(sum(m.monto) filter (
      where m.tipo in (
        'transferencia_central',
        'pago_directo_central',
        'retiro',
        'consignacion',
        'devolucion_efectivo'
      )
    ), 0)
  into v_otros_ingresos, v_salidas
  from public.movimientos_caja_tienda m
  where m.tienda_codigo = p_tienda_codigo
    and m.fecha = p_fecha;

  v_esperado := v_apertura + v_contado + v_financiado + v_iniciales
    + v_otros_ingresos - v_gastos - v_salidas;

  select to_jsonb(cd)
  into v_caja
  from public.caja_diaria cd
  where cd.tienda_codigo = p_tienda_codigo
    and cd.fecha = p_fecha;

  return jsonb_build_object(
    'ok', true,
    'tienda_codigo', p_tienda_codigo,
    'fecha', p_fecha,
    'apertura', v_apertura,
    'contado_ventas', v_contado,
    'financiado_ventas', v_financiado,
    'iniciales', v_iniciales,
    'otros_ingresos', v_otros_ingresos,
    'gastos_efectivo', v_gastos,
    'salidas_explicitas', v_salidas,
    'esperado', v_esperado,
    'caja', v_caja
  );
end;
$$;

revoke all on function public.calcular_efectivo_esperado_tienda(text, date)
  from public, anon;
grant execute on function public.calcular_efectivo_esperado_tienda(text, date)
  to authenticated;
revoke all on function public.registrar_movimiento_caja_tienda(
  text, date, text, numeric, text, text, uuid, uuid
) from public, anon;
grant execute on function public.registrar_movimiento_caja_tienda(
  text, date, text, numeric, text, text, uuid, uuid
) to authenticated;
revoke all on function public.impedir_edicion_movimiento_caja_tienda()
  from public, anon, authenticated;

commit;
