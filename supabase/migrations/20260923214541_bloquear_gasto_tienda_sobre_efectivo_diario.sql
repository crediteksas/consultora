-- Un gasto operativo de tienda no puede consumir más que las ventas de contado
-- de esa misma tienda y fecha. CENTRAL conserva su flujo de gastos generales.
CREATE FUNCTION public.saldo_gastos_tienda(p_tienda text, p_fecha date, p_excluir uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_ventas numeric; v_gastos numeric;
BEGIN
  IF p_tienda IS NULL OR p_fecha IS NULL THEN
    RAISE EXCEPTION 'Selecciona tienda y fecha';
  END IF;
  IF NOT (public.es_central() OR public.tienda_actual() = p_tienda) THEN
    RAISE EXCEPTION 'No puedes consultar los gastos de otra tienda';
  END IF;
  SELECT coalesce(sum(v.total), 0) INTO v_ventas
  FROM public.ventas v
  WHERE v.tienda_codigo = p_tienda AND v.fecha = p_fecha
    AND v.tipo = 'contado' AND NOT coalesce(v.anulada, false);
  SELECT coalesce(sum(g.monto), 0) INTO v_gastos
  FROM public.gastos g
  WHERE g.tienda_codigo = p_tienda AND g.fecha = p_fecha
    AND g.estado IN ('registrado', 'aprobado')
    AND (p_excluir IS NULL OR g.id <> p_excluir);
  RETURN pg_catalog.jsonb_build_object(
    'ventas_contado', v_ventas,
    'gastos_registrados', v_gastos,
    'disponible', greatest(v_ventas - v_gastos, 0)
  );
END $$;
REVOKE ALL ON FUNCTION public.saldo_gastos_tienda(text, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.saldo_gastos_tienda(text, date, uuid) TO authenticated;

CREATE FUNCTION public.validar_gasto_efectivo_diario()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_ventas numeric; v_gastos numeric; v_excluir uuid;
BEGIN
  IF NEW.tienda_codigo = 'CENTRAL' OR NEW.estado NOT IN ('registrado', 'aprobado') THEN
    RETURN NEW;
  END IF;
  IF NEW.monto IS NULL OR NEW.monto <= 0 THEN
    RAISE EXCEPTION 'El gasto debe tener un monto positivo';
  END IF;

  -- Serializa gastos simultáneos de la misma tienda y día.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(NEW.tienda_codigo),
    (NEW.fecha - DATE '2000-01-01')::integer
  );
  IF TG_OP = 'UPDATE' THEN v_excluir := OLD.id; END IF;
  SELECT coalesce(sum(v.total), 0) INTO v_ventas
  FROM public.ventas v
  WHERE v.tienda_codigo = NEW.tienda_codigo AND v.fecha = NEW.fecha
    AND v.tipo = 'contado' AND NOT coalesce(v.anulada, false);
  SELECT coalesce(sum(g.monto), 0) INTO v_gastos
  FROM public.gastos g
  WHERE g.tienda_codigo = NEW.tienda_codigo AND g.fecha = NEW.fecha
    AND g.estado IN ('registrado', 'aprobado')
    AND (v_excluir IS NULL OR g.id <> v_excluir);
  IF v_gastos + NEW.monto > v_ventas THEN
    RAISE EXCEPTION 'Gasto supera el efectivo disponible: ventas de contado %, gastos registrados %, disponible %, gasto solicitado %',
      v_ventas, v_gastos, greatest(v_ventas - v_gastos, 0), NEW.monto;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validar_gasto_efectivo_diario() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER gastos_limite_efectivo_diario
BEFORE INSERT OR UPDATE OF monto, fecha, tienda_codigo, estado ON public.gastos
FOR EACH ROW EXECUTE FUNCTION public.validar_gasto_efectivo_diario();
