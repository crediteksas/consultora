-- Run inside a single transaction. Payload placeholder is replaced ONLY by decode(hex alphabet,hex)::UTF8::jsonb; no source text enters SQL syntax.
SET LOCAL lock_timeout = '8s';
DO $$ BEGIN PERFORM pg_advisory_xact_lock(hashtextextended('kora-reconstruccion-correo-2026',0)); END $$;
LOCK TABLE public.creditos_historicos_plataforma IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.liquidation_operations IN SHARE MODE;
CREATE TEMP TABLE hist_payload ON COMMIT DROP AS SELECT * FROM jsonb_to_recordset(:payload) AS x(
 plataforma text,codigo_credito text,fecha_credito timestamptz,cliente_documento text,
 cliente_nombre text,establecimiento text,vendedor text,imei text,referencia text,
 monto_credito numeric,cuota_inicial numeric,archivo_origen text,correo_origen_at timestamptz,
 pago_neto_historico numeric,datos_origen jsonb,pendiente_dato_obligatorio boolean);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.creditos_historicos_plataforma'::regclass AND NOT tgisinternal AND tgenabled<>'D') THEN RAISE EXCEPTION 'Historical table has enabled triggers'; END IF;
 IF EXISTS(SELECT 1 FROM hist_payload WHERE plataforma NOT IN ('alo','payjoy') OR plataforma IS NULL OR nullif(codigo_credito,'') IS NULL OR fecha_credito IS NULL OR fecha_credito<'2026-01-01 00:00:00-05' OR fecha_credito>='2026-09-01 00:00:00-05' OR pendiente_dato_obligatorio IS TRUE OR pago_neto_historico<0 OR datos_origen->'reconstruccion_correo_2026'->>'sha256' IS NULL) THEN RAISE EXCEPTION 'Invalid payload: abort entire batch'; END IF;
 IF EXISTS(SELECT 1 FROM hist_payload p WHERE (monto_credito IS NULL OR cuota_inicial IS NULL) AND NOT EXISTS(SELECT 1 FROM public.creditos_historicos_plataforma h WHERE h.plataforma=p.plataforma AND h.codigo_credito=p.codigo_credito)) THEN RAISE EXCEPTION 'Missing required data for new credit'; END IF;
 IF EXISTS(SELECT 1 FROM hist_payload GROUP BY plataforma,codigo_credito HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate source key'; END IF;
 IF EXISTS(SELECT 1 FROM hist_payload p JOIN public.liquidation_operations o ON o.plataforma=p.plataforma AND o.external_id=p.codigo_credito) THEN RAISE EXCEPTION 'Operational collision: abort entire batch'; END IF;
 IF EXISTS(SELECT 1 FROM hist_payload p JOIN public.creditos_historicos_plataforma h USING(plataforma,codigo_credito) WHERE NOT h.historico_inicial) THEN RAISE EXCEPTION 'Not a historical record'; END IF;
END $$;
CREATE TEMP TABLE protected_before(name text, fingerprint text) ON COMMIT DROP;
DO $$ DECLARE n text; h text; BEGIN FOREACH n IN ARRAY ARRAY['banco_creditek_cuentas','banco_creditek_movimientos','payment_orders','caja_diaria','movimientos_cartera','liquidation_operations','liquidations'] LOOP EXECUTE format('select md5(coalesce(string_agg(to_jsonb(t)::text,%L order by to_jsonb(t)::text),%L)) from public.%I t','','',n) INTO h; INSERT INTO protected_before VALUES(n,h); END LOOP; END $$;
CREATE TEMP TABLE hist_before ON COMMIT DROP AS SELECT plataforma,codigo_credito,to_jsonb(h)-'datos_origen' AS original FROM public.creditos_historicos_plataforma h;
CREATE TEMP TABLE hist_write_audit(kind text,platform text,code text) ON COMMIT DROP;
WITH inserted AS (
 INSERT INTO public.creditos_historicos_plataforma(plataforma,codigo_credito,fecha_credito,cliente_documento,cliente_nombre,establecimiento,vendedor,imei,referencia,monto_credito,cuota_inicial,archivo_origen,correo_origen_at,historico_inicial,pagado_antes_inicio,requiere_soporte,fecha_inicio_operacion,pago_neto_historico,calculo_historico_estado,datos_origen)
 SELECT plataforma,codigo_credito,fecha_credito,cliente_documento,cliente_nombre,establecimiento,vendedor,imei,referencia,monto_credito,cuota_inicial,archivo_origen,correo_origen_at,true,true,false,'2026-09-01',pago_neto_historico,
 'reconstruido_correo_pendiente_conciliacion',jsonb_build_object('reconstrucciones_correo_2026',jsonb_build_array(datos_origen->'reconstruccion_correo_2026'),'pago_declarado_por_gerencia',true,'conciliado_bancariamente',false,'fecha_real_pago',null)
 FROM hist_payload p WHERE NOT EXISTS(SELECT 1 FROM public.creditos_historicos_plataforma h WHERE h.plataforma=p.plataforma AND h.codigo_credito=p.codigo_credito) ON CONFLICT(plataforma,codigo_credito) DO NOTHING RETURNING plataforma,codigo_credito)
 INSERT INTO hist_write_audit SELECT 'insert',plataforma,codigo_credito FROM inserted;
WITH updated AS (
 UPDATE public.creditos_historicos_plataforma h SET datos_origen=h.datos_origen || jsonb_build_object('reconstrucciones_correo_2026',coalesce(h.datos_origen->'reconstrucciones_correo_2026','[]'::jsonb)||jsonb_build_array(p.datos_origen->'reconstruccion_correo_2026'))
 FROM hist_payload p WHERE h.plataforma=p.plataforma AND h.codigo_credito=p.codigo_credito AND h.historico_inicial
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(h.datos_origen->'reconstrucciones_correo_2026','[]'::jsonb)) e WHERE e->>'sha256'=p.datos_origen->'reconstruccion_correo_2026'->>'sha256')
 RETURNING h.plataforma,h.codigo_credito)
 INSERT INTO hist_write_audit SELECT 'evidence_append',plataforma,codigo_credito FROM updated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM hist_before b JOIN public.creditos_historicos_plataforma h USING(plataforma,codigo_credito) WHERE b.original IS DISTINCT FROM to_jsonb(h)-'datos_origen') THEN RAISE EXCEPTION 'Existing financial fields changed'; END IF;
END $$;
DO $$ DECLARE r record; h text; BEGIN FOR r IN SELECT * FROM protected_before LOOP EXECUTE format('select md5(coalesce(string_agg(to_jsonb(t)::text,%L order by to_jsonb(t)::text),%L)) from public.%I t','','',r.name) INTO h; IF h IS DISTINCT FROM r.fingerprint THEN RAISE EXCEPTION 'Protected table changed: %',r.name; END IF; END LOOP; END $$;
SELECT kind,count(*) FROM hist_write_audit GROUP BY kind;
