-- Corrección administrativa auditada: un gasto aprobado vuelve a revisión.
ALTER TABLE public.gastos ADD COLUMN motivo_correccion_administrativa text;

CREATE FUNCTION gastos_correccion_private.editar_administrativo(
  p_id uuid, p_revision integer, p_datos jsonb
) RETURNS public.gastos LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  g public.gastos;
  perfil public.perfiles;
  f date;
  c uuid;
  m numeric;
  d text;
  motivo text;
BEGIN
  SELECT * INTO perfil FROM public.perfiles WHERE id = auth.uid() AND activo;
  IF auth.uid() IS NULL OR perfil.id IS NULL OR perfil.rol NOT IN ('gerencia', 'auditoria') THEN
    RAISE EXCEPTION 'Solo gerencia o auditoría puede editar gastos';
  END IF;
  SELECT * INTO g FROM public.gastos WHERE id = p_id FOR UPDATE;
  IF g.id IS NULL THEN RAISE EXCEPTION 'Gasto no disponible'; END IF;
  IF g.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'El gasto cambió. Actualiza la pantalla'; END IF;
  IF g.estado NOT IN ('registrado', 'aprobado') OR g.correccion_pendiente THEN
    RAISE EXCEPTION 'Este gasto no admite edición administrativa';
  END IF;

  f := (p_datos->>'fecha')::date;
  c := (p_datos->>'concepto_id')::uuid;
  m := (p_datos->>'monto')::numeric;
  d := nullif(trim(p_datos->>'descripcion'), '');
  motivo := nullif(trim(p_datos->>'motivo'), '');
  IF f IS NULL OR c IS NULL OR m IS NULL OR m <= 0
     OR m::text IN ('NaN', 'Infinity', '-Infinity') OR motivo IS NULL THEN
    RAISE EXCEPTION 'Completa fecha, concepto, monto positivo y motivo de corrección';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.conceptos_gasto WHERE id = c AND activo) THEN
    RAISE EXCEPTION 'Concepto no disponible';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.periodos
    WHERE tienda_codigo = g.tienda_codigo
      AND (g.fecha BETWEEN fecha_inicio AND fecha_fin OR f BETWEEN fecha_inicio AND fecha_fin)
  ) THEN RAISE EXCEPTION 'No se puede editar un período cerrado'; END IF;

  UPDATE public.gastos SET fecha = f, concepto_id = c, monto = m,
    descripcion = d, estado = 'registrado', aprobado_por = NULL,
    aprobado_at = NULL, motivo_correccion_administrativa = motivo,
    revision = revision + 1
  WHERE id = g.id RETURNING * INTO g;
  RETURN g;
END $$;
REVOKE ALL ON FUNCTION gastos_correccion_private.editar_administrativo(uuid, integer, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION gastos_correccion_private.editar_administrativo(uuid, integer, jsonb)
  TO authenticated;

CREATE FUNCTION public.editar_gasto_administrativo(
  p_id uuid, p_revision integer, p_datos jsonb
) RETURNS public.gastos LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT gastos_correccion_private.editar_administrativo(p_id, p_revision, p_datos)
$$;
REVOKE ALL ON FUNCTION public.editar_gasto_administrativo(uuid, integer, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.editar_gasto_administrativo(uuid, integer, jsonb)
  TO authenticated;
