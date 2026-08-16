begin;

do $$
begin
  if to_regclass('public.caja_diaria') is null
     or to_regclass('public.ventas') is null
     or to_regclass('public.creditos') is null
     or to_regclass('public.gastos') is null
     or to_regclass('public.perfiles') is null
     or to_regclass('public.movimientos_caja_tienda') is null then
    raise exception 'Faltan tablas requeridas para corregir el efectivo esperado';
  end if;
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
  into v_contado, v_saldo_por_cobrar, v_iniciales
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

  -- El saldo financiado queda en cartera. Solo una cuota inicial o un abono
  -- efectivamente registrado entra a la caja física de la tienda.
  v_esperado := v_apertura + v_contado + v_financiado_recibido + v_iniciales
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
    'financiado_ventas', v_financiado_recibido,
    'saldo_por_cobrar', v_saldo_por_cobrar,
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

commit;
