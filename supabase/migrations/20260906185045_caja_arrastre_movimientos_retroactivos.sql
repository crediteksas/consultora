-- Recalcula el arrastre sin reescribir cierres ni volver a registrar abonos.
-- Cada cierre nuevo guarda la corrección acumulada que ya incorporó:
-- apertura = contado anterior + diferencia acumulada actual - incorporada.
alter table public.caja_diaria
  add column if not exists arrastre_movimientos_incorporado numeric not null default 0;

comment on column public.caja_diaria.arrastre_movimientos_incorporado is
  'Diferencia acumulada de movimientos de fechas cerradas ya incluida en la apertura de este cierre. No es un movimiento de dinero.';

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
  v_anterior public.caja_diaria%rowtype;
  v_apertura_original numeric := 0;
  v_arrastre_total numeric := 0;
  v_ajuste_arrastre numeric := 0;
  v_apertura numeric := 0;
  v_contado numeric := 0;
  v_financiado_recibido numeric := 0;
  v_saldo_por_cobrar numeric := 0;
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

  select * into v_perfil from public.perfiles
  where id = auth.uid() and activo = true;
  if not found or not (
    v_perfil.rol in ('gerencia', 'auditoria')
    or (v_perfil.rol = 'admin_tienda' and v_perfil.tienda_codigo = p_tienda_codigo)
  ) then
    raise exception 'No autorizado para consultar esta caja';
  end if;

  select * into v_anterior from public.caja_diaria cd
  where cd.tienda_codigo = p_tienda_codigo
    and cd.fecha < p_fecha and cd.estado = 'cerrada'
  order by cd.fecha desc limit 1;

  if found then
    v_apertura_original := coalesce(v_anterior.efectivo_contado, 0);
    -- Compara los movimientos reales con los componentes guardados al cerrar
    -- su fecha. No depende de created_at: funciona también con validaciones
    -- concurrentes y timestamps de transacciones iniciadas antes del cierre.
    select coalesce(sum(
      coalesce(m.neto, 0) - (coalesce(cd.otros_ingresos, 0) - coalesce(cd.salidas_explicitas, 0))
    ), 0) into v_arrastre_total
    from public.caja_diaria cd
    left join lateral (
      select coalesce(sum(case
        when mc.tipo in ('abono', 'otro_ingreso') then mc.monto
        when mc.tipo in ('transferencia_central', 'pago_directo_central', 'retiro', 'consignacion', 'devolucion_efectivo') then -mc.monto
        else 0 end), 0) as neto
      from public.movimientos_caja_tienda mc
      where mc.tienda_codigo = cd.tienda_codigo and mc.fecha = cd.fecha
    ) m on true
    where cd.tienda_codigo = p_tienda_codigo
      and cd.estado = 'cerrada' and cd.fecha <= v_anterior.fecha;

    v_ajuste_arrastre := v_arrastre_total - v_anterior.arrastre_movimientos_incorporado;
    v_apertura := v_apertura_original + v_ajuste_arrastre;
  end if;

  select
    coalesce(sum(v.total) filter (where v.tipo = 'contado'), 0),
    coalesce(sum(c.valor_esperado_financiera) filter (where v.tipo = 'credito'), 0),
    coalesce(sum(c.cuota_inicial) filter (where v.tipo = 'credito'), 0)
  into v_contado, v_saldo_por_cobrar, v_iniciales
  from public.ventas v
  left join public.creditos c on c.venta_id = v.id
  where v.tienda_codigo = p_tienda_codigo and v.fecha = p_fecha
    and not coalesce(v.anulada, false);

  select coalesce(sum(g.monto), 0) into v_gastos
  from public.gastos g join public.conceptos_gasto cg on cg.id = g.concepto_id
  where g.tienda_codigo = p_tienda_codigo and g.fecha = p_fecha
    and (cg.preautorizado = true or g.estado = 'aprobado');

  select
    coalesce(sum(m.monto) filter (where m.tipo in ('abono', 'otro_ingreso')), 0),
    coalesce(sum(m.monto) filter (where m.tipo in (
      'transferencia_central', 'pago_directo_central', 'retiro', 'consignacion', 'devolucion_efectivo'
    )), 0)
  into v_otros_ingresos, v_salidas
  from public.movimientos_caja_tienda m
  where m.tienda_codigo = p_tienda_codigo and m.fecha = p_fecha;

  -- El financiado permanece en cartera; no es efectivo recibido en tienda.
  v_esperado := v_apertura + v_contado + v_financiado_recibido + v_iniciales
    + v_otros_ingresos - v_gastos - v_salidas;

  select to_jsonb(cd) into v_caja from public.caja_diaria cd
  where cd.tienda_codigo = p_tienda_codigo and cd.fecha = p_fecha;

  return jsonb_build_object(
    'ok', true, 'tienda_codigo', p_tienda_codigo, 'fecha', p_fecha,
    'apertura', v_apertura,
    'apertura_cierre_anterior', v_apertura_original,
    'ajuste_arrastre_movimientos', v_ajuste_arrastre,
    'arrastre_movimientos_total', v_arrastre_total,
    'contado_ventas', v_contado,
    'financiado_ventas', v_financiado_recibido,
    'saldo_por_cobrar', v_saldo_por_cobrar,
    'iniciales', v_iniciales, 'otros_ingresos', v_otros_ingresos,
    'gastos_efectivo', v_gastos, 'salidas_explicitas', v_salidas,
    'esperado', v_esperado, 'caja', v_caja
  );
end;
$$;

create or replace function public.cerrar_caja_piloto(
  p_tienda_codigo text, p_fecha date, p_efectivo_contado numeric,
  p_idempotency_key uuid, p_nota text default null
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
  v_arrastre_total numeric;
begin
  if p_tienda_codigo is null or p_fecha is null or p_efectivo_contado is null
     or p_efectivo_contado < 0 or p_idempotency_key is null then
    raise exception 'Tienda, fecha, efectivo e idempotencia son obligatorios';
  end if;
  select * into v_perfil from public.perfiles where id = auth.uid() and activo = true;
  if not found or not (
    v_perfil.rol in ('gerencia', 'auditoria')
    or (v_perfil.rol = 'admin_tienda' and v_perfil.tienda_codigo = p_tienda_codigo)
  ) then
    raise exception 'No autorizado para cerrar esta caja';
  end if;

  -- Serializa cierres de una misma tienda para que compartan el mismo arrastre.
  perform pg_advisory_xact_lock(hashtextextended('caja-arrastre:' || p_tienda_codigo, 0));
  perform pg_advisory_xact_lock(hashtextextended(p_tienda_codigo || ':' || p_fecha::text, 0));

  select * into v_existente from public.caja_diaria
  where tienda_codigo = p_tienda_codigo and fecha = p_fecha for update;
  if found and v_existente.estado = 'cerrada' then
    if v_existente.cierre_idempotency_key = p_idempotency_key then
      return jsonb_build_object('ok', true, 'esperado', v_existente.efectivo_esperado,
        'efectivo_contado', v_existente.efectivo_contado, 'diferencia', v_existente.diferencia);
    end if;
    raise exception 'La caja de esta fecha ya está cerrada';
  end if;

  v_cuadre := public.calcular_efectivo_esperado_tienda(p_tienda_codigo, p_fecha);
  v_apertura := coalesce((v_cuadre->>'apertura')::numeric, 0);
  v_contado := coalesce((v_cuadre->>'contado_ventas')::numeric, 0);
  v_financiado := coalesce((v_cuadre->>'financiado_ventas')::numeric, 0);
  v_iniciales := coalesce((v_cuadre->>'iniciales')::numeric, 0);
  v_otros_ingresos := coalesce((v_cuadre->>'otros_ingresos')::numeric, 0);
  v_gastos := coalesce((v_cuadre->>'gastos_efectivo')::numeric, 0);
  v_salidas := coalesce((v_cuadre->>'salidas_explicitas')::numeric, 0);
  v_esperado := coalesce((v_cuadre->>'esperado')::numeric, 0);
  v_arrastre_total := coalesce((v_cuadre->>'arrastre_movimientos_total')::numeric, 0);
  v_diferencia := p_efectivo_contado - v_esperado;
  if v_diferencia <> 0 then
    raise exception 'No se puede cerrar: diferencia de caja %', v_diferencia;
  end if;

  insert into public.caja_diaria (
    tienda_codigo, fecha, estado, apertura, contado_ventas, financiado_ventas,
    iniciales, otros_ingresos, gastos_efectivo, salidas_explicitas,
    efectivo_esperado, efectivo_contado, diferencia, cerrada_por, cerrada_at,
    nota, cierre_idempotency_key, arrastre_movimientos_incorporado
  ) values (
    p_tienda_codigo, p_fecha, 'cerrada', v_apertura, v_contado, v_financiado,
    v_iniciales, v_otros_ingresos, v_gastos, v_salidas,
    v_esperado, p_efectivo_contado, v_diferencia, auth.uid(), now(),
    nullif(trim(p_nota), ''), p_idempotency_key, v_arrastre_total
  )
  on conflict (tienda_codigo, fecha) do update set
    estado = excluded.estado, apertura = excluded.apertura,
    contado_ventas = excluded.contado_ventas, financiado_ventas = excluded.financiado_ventas,
    iniciales = excluded.iniciales, otros_ingresos = excluded.otros_ingresos,
    gastos_efectivo = excluded.gastos_efectivo, salidas_explicitas = excluded.salidas_explicitas,
    efectivo_esperado = excluded.efectivo_esperado, efectivo_contado = excluded.efectivo_contado,
    diferencia = excluded.diferencia, cerrada_por = excluded.cerrada_por,
    cerrada_at = excluded.cerrada_at, nota = excluded.nota,
    cierre_idempotency_key = excluded.cierre_idempotency_key,
    arrastre_movimientos_incorporado = excluded.arrastre_movimientos_incorporado;

  return jsonb_build_object('ok', true, 'esperado', v_esperado,
    'efectivo_contado', p_efectivo_contado, 'diferencia', v_diferencia);
end;
$$;

revoke all on function public.calcular_efectivo_esperado_tienda(text, date) from public, anon;
grant execute on function public.calcular_efectivo_esperado_tienda(text, date) to authenticated;
revoke all on function public.cerrar_caja_piloto(text, date, numeric, uuid, text) from public, anon;
grant execute on function public.cerrar_caja_piloto(text, date, numeric, uuid, text) to authenticated;
