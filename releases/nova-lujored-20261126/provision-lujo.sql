-- General business link only. No personal identity, login member or auth account is created.
DO $provision$
DECLARE target_code constant text := 'ALIADO-5D608D3F-BDE6-45FB-B736-F5040577C63B'; v_hash text; v_link_id uuid;
BEGIN
 PERFORM set_config('lock_timeout','5s',true);
 PERFORM 1 FROM public.origenes WHERE codigo=target_code AND activo IS TRUE AND tipo='aliado' AND public.normalizar_nombre_aliado(nombre)=public.normalizar_nombre_aliado('LUJO RED SAS') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ALLIED_ORIGIN_MISMATCH'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.origenes o JOIN public.ejecutivos e ON e.id=o.ejecutivo_id WHERE o.codigo=target_code AND e.id='64c8305b-43e0-42f4-8575-3458c1cb2ec9' AND e.activo) THEN RAISE EXCEPTION 'EXECUTIVE_MISMATCH'; END IF;
 IF (SELECT count(*) FROM public.enlaces_registro WHERE origen_codigo=target_code AND activo AND revoked_at IS NULL)>1 THEN RAISE EXCEPTION 'AMBIGUOUS_ACTIVE_LINKS';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.captadores WHERE origen_codigo=target_code AND activo IS TRUE) THEN
  INSERT INTO public.captadores(origen_codigo,nombre,tipo,activo) VALUES(target_code,'LUJO RED SAS','tercero',true);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.enlaces_registro WHERE origen_codigo=target_code AND activo IS TRUE AND revoked_at IS NULL) THEN
  v_hash:=rtrim(translate(encode(extensions.gen_random_bytes(32),'base64'),'+/','-_'),'=');
  INSERT INTO public.enlaces_registro(token_hash,token_sufijo,origen_codigo,captador_id,activo) VALUES(v_hash,right(v_hash,8),target_code,NULL,true) RETURNING id INTO v_link_id;
  INSERT INTO public.audit_log(usuario,accion,tabla,registro_id,detalle) VALUES('aura.owner','enlace_registro_creado','enlaces_registro',v_link_id::text,jsonb_build_object('origen_codigo',target_code,'captador_id',NULL,'provisioning','nova-lujored-20261126')); 
 END IF;
END $provision$;
