-- One-off, explicitly production-scoped data provisioning; not a schema migration.
-- New links use the existing nr1.id.HMAC active-link path in shareTokenFilter.
-- token_hash/suffix are opaque identifiers, not a recoverable legacy bearer token.
DO $provision$
DECLARE target record; v_nombre text; v_matches integer; v_hash text;
BEGIN
 PERFORM set_config('lock_timeout','5s',true);
 -- Validate and lock all origins/members before any write. Do not log hashes or names.
 FOR target IN SELECT * FROM (VALUES
  ('distritoys','Distritoys','Ailin'),
  ('club-seven','Club Seven BM','María Concord'),
  ('ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C','IZZY MOVIL','Mariajo')
 ) AS v(code,store_name,contact_name) ORDER BY code LOOP
  PERFORM 1 FROM public.origenes o WHERE o.codigo=target.code AND o.activo IS TRUE AND o.tipo='aliado'
   AND public.normalizar_nombre_aliado(o.nombre)=public.normalizar_nombre_aliado(target.store_name) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ALLIED_ORIGIN_MISMATCH';END IF;
  SELECT btrim(split_part(p.nombre,' · ',1)) INTO STRICT v_nombre
   FROM public.nova_allied_login_members m JOIN public.perfiles p ON p.id=m.actor_id
   WHERE m.store_code=target.code AND m.active AND p.activo AND p.tienda_codigo=m.store_code;
  IF public.normalizar_nombre_aliado(v_nombre) IS DISTINCT FROM public.normalizar_nombre_aliado(target.contact_name)
   THEN RAISE EXCEPTION 'ALLIED_CONTACT_MISMATCH';END IF;
  SELECT count(*) INTO v_matches FROM public.captadores c WHERE c.origen_codigo=target.code
   AND public.normalizar_nombre_aliado(c.nombre)=public.normalizar_nombre_aliado(target.contact_name);
  IF v_matches>1 THEN RAISE EXCEPTION 'AMBIGUOUS_ALLIED_SELLER';END IF;
 END LOOP;
 FOR target IN SELECT * FROM (VALUES
  ('distritoys','Ailin'),('club-seven','María Concord'),
  ('ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C','Mariajo')
 ) AS v(code,contact_name) ORDER BY code LOOP
  IF NOT EXISTS(SELECT 1 FROM public.captadores c WHERE c.origen_codigo=target.code
   AND public.normalizar_nombre_aliado(c.nombre)=public.normalizar_nombre_aliado(target.contact_name)) THEN
   INSERT INTO public.captadores(origen_codigo,nombre,tipo,activo) VALUES(target.code,target.contact_name,'tercero',true);
  ELSE
   UPDATE public.captadores c SET activo=true,updated_at=now() WHERE c.origen_codigo=target.code AND c.activo IS NOT TRUE
    AND public.normalizar_nombre_aliado(c.nombre)=public.normalizar_nombre_aliado(target.contact_name);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.enlaces_registro l WHERE l.origen_codigo=target.code AND l.activo IS TRUE AND l.revoked_at IS NULL) THEN
   v_hash:=rtrim(translate(encode(extensions.gen_random_bytes(32),'base64'),'+/','-_'),'=');
   INSERT INTO public.enlaces_registro(token_hash,token_sufijo,origen_codigo,captador_id,activo)
    VALUES(v_hash,right(v_hash,8),target.code,NULL,true);
  END IF;
 END LOOP;
END $provision$;
