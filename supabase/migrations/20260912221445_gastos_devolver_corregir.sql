-- Devuelto conserva estado rechazado para no sumarse como gasto aprobado.
ALTER TABLE public.gastos ADD COLUMN correccion_pendiente boolean NOT NULL DEFAULT false;
ALTER TABLE public.gastos ADD COLUMN revision integer NOT NULL DEFAULT 0;
CREATE SCHEMA IF NOT EXISTS gastos_correccion_private;
REVOKE ALL ON SCHEMA gastos_correccion_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA gastos_correccion_private TO authenticated;
CREATE TABLE public.gastos_historial (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 gasto_id uuid NOT NULL REFERENCES public.gastos(id),
 usuario_id uuid, creado_at timestamptz NOT NULL DEFAULT now(),
 anterior jsonb NOT NULL, posterior jsonb NOT NULL
);
ALTER TABLE public.gastos_historial ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gastos_historial FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.gastos_historial TO authenticated;
CREATE POLICY consultar_historial ON public.gastos_historial FOR SELECT TO authenticated
 USING (EXISTS (
   SELECT 1 FROM public.gastos g JOIN public.perfiles p ON p.id=auth.uid()
   WHERE g.id=gasto_id AND p.activo
     AND (p.rol IN ('gerencia','auditoria') OR
       (p.rol='admin_tienda' AND p.tienda_codigo=g.tienda_codigo))
 ));
CREATE FUNCTION gastos_correccion_private.auditar() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN
 INSERT INTO public.gastos_historial(gasto_id,usuario_id,anterior,posterior)
 VALUES(NEW.id,auth.uid(),to_jsonb(OLD),to_jsonb(NEW));
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION gastos_correccion_private.auditar() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER gastos_historial_update AFTER UPDATE ON public.gastos
 FOR EACH ROW EXECUTE FUNCTION gastos_correccion_private.auditar();
CREATE FUNCTION gastos_correccion_private.procesar(p_id uuid,p_revision integer,p_accion text,p_datos jsonb)
 RETURNS public.gastos LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g public.gastos; perfil public.perfiles; f date; c uuid; m numeric; d text;
BEGIN
 SELECT * INTO perfil FROM public.perfiles WHERE id=auth.uid() AND activo;
 IF auth.uid() IS NULL OR perfil.id IS NULL THEN RAISE EXCEPTION 'Sesión no autorizada'; END IF;
 SELECT * INTO g FROM public.gastos WHERE id=p_id FOR UPDATE;
 IF g.id IS NULL THEN RAISE EXCEPTION 'Gasto no disponible'; END IF;
 IF g.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'El gasto cambió. Actualiza la pantalla'; END IF;
 IF p_accion='devolver' THEN
  IF perfil.rol NOT IN ('gerencia','auditoria') OR perfil.rol IS NULL THEN RAISE EXCEPTION 'Solo gestión o gerencia puede devolver'; END IF;
  IF g.estado<>'registrado' THEN RAISE EXCEPTION 'Solo se devuelve un gasto pendiente'; END IF;
  d:=nullif(trim(p_datos->>'motivo'),'');
  IF d IS NULL THEN RAISE EXCEPTION 'Indica el motivo de devolución'; END IF;
  UPDATE public.gastos SET estado='rechazado',correccion_pendiente=true,nota_rechazo=d,
   aprobado_por=auth.uid(),aprobado_at=now(),revision=revision+1 WHERE id=g.id RETURNING * INTO g;
 ELSIF p_accion='reenviar' THEN
  IF NOT coalesce((perfil.rol IN ('gerencia','auditoria') OR (perfil.rol='admin_tienda' AND perfil.tienda_codigo=g.tienda_codigo)),false) THEN RAISE EXCEPTION 'No puedes corregir gastos de otra tienda'; END IF;
  IF g.estado<>'rechazado' OR NOT g.correccion_pendiente THEN RAISE EXCEPTION 'El gasto no está devuelto para corrección'; END IF;
  f:=(p_datos->>'fecha')::date; c:=(p_datos->>'concepto_id')::uuid;
  m:=(p_datos->>'monto')::numeric; d:=nullif(trim(p_datos->>'descripcion'),'');
  IF f IS NULL OR c IS NULL OR m IS NULL OR m<=0 OR m::text IN ('NaN','Infinity','-Infinity') OR d IS NULL THEN RAISE EXCEPTION 'Completa fecha, concepto, monto positivo y descripción'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.conceptos_gasto WHERE id=c AND activo) THEN RAISE EXCEPTION 'Concepto no disponible'; END IF;
  IF EXISTS(SELECT 1 FROM public.periodos WHERE tienda_codigo=g.tienda_codigo AND
    (g.fecha BETWEEN fecha_inicio AND fecha_fin OR f BETWEEN fecha_inicio AND fecha_fin)) THEN RAISE EXCEPTION 'No se puede corregir un período cerrado'; END IF;
  UPDATE public.gastos SET fecha=f,concepto_id=c,monto=m,descripcion=d,
    estado='registrado',correccion_pendiente=false,nota_rechazo=null,aprobado_por=null,aprobado_at=null,
    revision=revision+1 WHERE id=g.id RETURNING * INTO g;
 ELSE RAISE EXCEPTION 'Acción no válida'; END IF;
 RETURN g;
END $$;
REVOKE ALL ON FUNCTION gastos_correccion_private.procesar(uuid,integer,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION gastos_correccion_private.procesar(uuid,integer,text,jsonb) TO authenticated;
CREATE FUNCTION public.corregir_gasto(p_id uuid,p_revision integer,p_accion text,p_datos jsonb)
 RETURNS public.gastos LANGUAGE sql SECURITY INVOKER SET search_path=''
 AS $$ SELECT gastos_correccion_private.procesar(p_id,p_revision,p_accion,p_datos) $$;
REVOKE ALL ON FUNCTION public.corregir_gasto(uuid,integer,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.corregir_gasto(uuid,integer,text,jsonb) TO authenticated;
