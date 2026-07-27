begin;

do $$
begin
  if to_regclass('public.caja_diaria') is null
     or to_regclass('public.perfiles') is null then
    raise exception 'Faltan tablas requeridas para cerrar caja';
  end if;

  if to_regprocedure(
    'public.calcular_efectivo_esperado_tienda(text,date)'
  ) is null then
    raise exception 'Falta calcular_efectivo_esperado_tienda(text,date)';
  end if;
end;
$$;

alter table public.caja_diaria
  add column if not exists cierre_idempotency_key uuid;

create unique index if not exists caja_diaria_tienda_fecha_uidx
  on public.caja_diaria (tienda_codigo, fecha);

create unique index if not exists caja_diaria_cierre_idempotency_uidx
  on public.caja_diaria (cierre_idempotency_key)
  where cierre_idempotency_key is not null;

create or replace function public.cerrar_caja_piloto(
  p_tienda_codigo text,
  p_fecha date,
  p_efectivo_contado numeric,
  p_idempotency_key uuid,
  p_nota text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_perfil public.perfiles%rowtype;
  v_existente public.caja_diaria%rowtype;
  v_cuadre jsonb;
  v_apertura numeric;
  v_contado numeric;
  v_financiado numeric;
  v_iniciales numeric;
  v_otros_ingresos numeric;
  v_gastos numeric;
  v_salidas numeric;
  v_esperado numeric;
  v_diferencia numeric;
begin
  if p_tienda_codigo is null
     or p_fecha is null
     or p_efectivo_contado is null
     or p_efectivo_contado < 0
     or p_idempotency_key is null then
    raise exception 'Tienda, fecha, efectivo e idempotencia son obligatorios';
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
    raise exception 'No autorizado para cerrar esta caja';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_tienda_codigo || ':' || p_fecha::text, 0)
  );

  select *
  into v_existente
  from public.caja_diaria
  where tienda_codigo = p_tienda_codigo
    and fecha = p_fecha
  for update;

  if found and v_existente.estado = 'cerrada' then
    if v_existente.cierre_idempotency_key = p_idempotency_key then
      return jsonb_build_object(
        'ok', true,
        'esperado', v_existente.efectivo_esperado,
        'efectivo_contado', v_existente.efectivo_contado,
        'diferencia', v_existente.diferencia
      );
    end if;
    raise exception 'La caja de esta fecha ya está cerrada';
  end if;

  v_cuadre := public.calcular_efectivo_esperado_tienda(
    p_tienda_codigo,
    p_fecha
  );
  v_apertura := coalesce((v_cuadre->>'apertura')::numeric, 0);
  v_contado := coalesce((v_cuadre->>'contado_ventas')::numeric, 0);
  v_financiado := coalesce((v_cuadre->>'financiado_ventas')::numeric, 0);
  v_iniciales := coalesce((v_cuadre->>'iniciales')::numeric, 0);
  v_otros_ingresos := coalesce((v_cuadre->>'otros_ingresos')::numeric, 0);
  v_gastos := coalesce((v_cuadre->>'gastos_efectivo')::numeric, 0);
  v_salidas := coalesce((v_cuadre->>'salidas_explicitas')::numeric, 0);
  v_esperado := coalesce((v_cuadre->>'esperado')::numeric, 0);
  v_diferencia := p_efectivo_contado - v_esperado;

  if v_diferencia <> 0 then
    raise exception
      'No se puede cerrar: diferencia de caja %',
      v_diferencia;
  end if;

  insert into public.caja_diaria (
    tienda_codigo,
    fecha,
    estado,
    apertura,
    contado_ventas,
    financiado_ventas,
    iniciales,
    otros_ingresos,
    gastos_efectivo,
    salidas_explicitas,
    efectivo_esperado,
    efectivo_contado,
    diferencia,
    cerrada_por,
    cerrada_at,
    nota,
    cierre_idempotency_key
  )
  values (
    p_tienda_codigo,
    p_fecha,
    'cerrada',
    v_apertura,
    v_contado,
    v_financiado,
    v_iniciales,
    v_otros_ingresos,
    v_gastos,
    v_salidas,
    v_esperado,
    p_efectivo_contado,
    v_diferencia,
    auth.uid(),
    now(),
    nullif(trim(p_nota), ''),
    p_idempotency_key
  )
  on conflict (tienda_codigo, fecha)
  do update set
    estado = excluded.estado,
    apertura = excluded.apertura,
    contado_ventas = excluded.contado_ventas,
    financiado_ventas = excluded.financiado_ventas,
    iniciales = excluded.iniciales,
    otros_ingresos = excluded.otros_ingresos,
    gastos_efectivo = excluded.gastos_efectivo,
    salidas_explicitas = excluded.salidas_explicitas,
    efectivo_esperado = excluded.efectivo_esperado,
    efectivo_contado = excluded.efectivo_contado,
    diferencia = excluded.diferencia,
    cerrada_por = excluded.cerrada_por,
    cerrada_at = excluded.cerrada_at,
    nota = excluded.nota,
    cierre_idempotency_key = excluded.cierre_idempotency_key;

  return jsonb_build_object(
    'ok', true,
    'esperado', v_esperado,
    'efectivo_contado', p_efectivo_contado,
    'diferencia', v_diferencia
  );
end;
$$;

revoke all on function public.cerrar_caja_piloto(
  text, date, numeric, uuid, text
) from public, anon;
grant execute on function public.cerrar_caja_piloto(
  text, date, numeric, uuid, text
) to authenticated;

commit;
