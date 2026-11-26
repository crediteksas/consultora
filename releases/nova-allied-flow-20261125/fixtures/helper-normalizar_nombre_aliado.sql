CREATE OR REPLACE FUNCTION public.normalizar_nombre_aliado(p_nombre text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE STRICT
 SET search_path TO 'pg_catalog'
AS $function$
  select translate(
    lower(btrim(regexp_replace(p_nombre, '[[:space:]]+', ' ', 'g'))),
    'áàäâãåéèëêíìïîóòöôõúùüûñç',
    'aaaaaaeeeeiiiiooooouuuunc'
  );
$function$
