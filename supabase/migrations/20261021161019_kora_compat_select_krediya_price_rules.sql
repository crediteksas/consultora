-- KORA only. Preserve the existing reviewer-only RLS and RPC-only writes.
-- Existing grants are not revoked or widened; a rebuild must not depend on
-- Supabase's automatic table grants to read the tariff configuration.
DO $compatibility$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='krediya_price_rules'
      AND c.relkind IN ('r','p') AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Compatibilidad: falta la tabla protegida del tarifario';
  END IF;
  IF (SELECT count(*) FROM pg_policy WHERE polrelid='public.krediya_price_rules'::regclass)<>2 OR NOT EXISTS (
    SELECT 1 FROM pg_policy p
    WHERE p.polrelid='public.krediya_price_rules'::regclass
      AND p.polname='krediya_price_rules_select' AND p.polcmd='r'
      AND p.polpermissive
      AND p.polroles=ARRAY[(SELECT oid FROM pg_roles WHERE rolname='authenticated')]
      AND p.polwithcheck IS NULL
      AND pg_get_expr(p.polqual,p.polrelid) IN (
        'tiene_capacidad_aliados(''revisor''::text)',
        'public.tiene_capacidad_aliados(''revisor''::text)'
      )
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policy p
    WHERE p.polrelid='public.krediya_price_rules'::regclass
      AND p.polname='krediya_price_rules_write' AND p.polcmd='*' AND p.polpermissive
      AND p.polroles=ARRAY[(SELECT oid FROM pg_roles WHERE rolname='authenticated')]
      AND pg_get_expr(p.polqual,p.polrelid) IN (
        'tiene_capacidad_aliados(''revisor''::text)',
        'public.tiene_capacidad_aliados(''revisor''::text)'
      )
      AND pg_get_expr(p.polwithcheck,p.polrelid) IN (
        'tiene_capacidad_aliados(''revisor''::text)',
        'public.tiene_capacidad_aliados(''revisor''::text)'
      )
  ) THEN
    RAISE EXCEPTION 'Compatibilidad: revisar la política de lectura del tarifario';
  END IF;
  IF NOT has_schema_privilege('authenticated','public','USAGE')
    OR NOT has_function_privilege('authenticated','public.tiene_capacidad_aliados(text)','EXECUTE') THEN
    RAISE EXCEPTION 'Compatibilidad: faltan permisos previos de esquema o autorización';
  END IF;
  GRANT SELECT ON TABLE public.krediya_price_rules TO authenticated;
END;
$compatibility$;
