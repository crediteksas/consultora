CREATE OR REPLACE FUNCTION public.decidir_instruccion_consignacion(p_instruccion_id uuid, p_decision text, p_motivo text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_perfil public.perfiles%rowtype;
  v_instruccion public.instrucciones_consignacion%rowtype;
  v_comprobante public.comprobantes_consignacion%rowtype;
  v_abono_id uuid;
  v_movimiento_caja_id uuid;
  v_movimiento_b2b_id uuid;
  v_factura public.facturas_proveedor%rowtype;
  v_pago jsonb;
  v_pago_id uuid;
  v_restante numeric;
  v_aplicar numeric;
  v_orden integer := 0;
  v_child_key uuid;
begin
  select * into v_perfil
  from public.perfiles
  where id = auth.uid() and activo = true;
  if not found or v_perfil.rol not in ('gerencia', 'auditoria') then
    raise exception 'Solo Oscar o Maythe pueden decidir instrucciones';
  end if;
  if p_decision not in ('validado', 'rechazado') or p_request_id is null then
    raise exception 'Decisión e idempotencia son obligatorias';
  end if;
  if p_decision = 'rechazado'
     and nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'El motivo de rechazo es obligatorio';
  end if;

  select * into v_instruccion
  from public.instrucciones_consignacion
  where id = p_instruccion_id
  for update;
  if not found then
    raise exception 'Instrucción no encontrada';
  end if;
  if v_instruccion.decision_idempotency_key = p_request_id then
    return jsonb_build_object(
      'ok', true, 'reutilizado', true, 'estado', v_instruccion.estado
    );
  end if;
  if v_instruccion.estado <> 'en_validacion' then
    raise exception 'La instrucción no está pendiente de validación';
  end if;

  select * into v_comprobante
  from public.comprobantes_consignacion
  where instruccion_id = p_instruccion_id
    and estado = 'enviado'
  order by version desc
  limit 1
  for update;
  if not found then
    raise exception 'No existe comprobante pendiente';
  end if;

  if p_decision = 'rechazado' then
    update public.comprobantes_consignacion
    set estado = 'rechazado', decidido_por = auth.uid(),
        decidido_at = now(), motivo_decision = btrim(p_motivo)
    where id = v_comprobante.id;
    update public.instrucciones_consignacion
    set estado = 'rechazado', decidida_por = auth.uid(), decidida_at = now(),
        motivo_decision = btrim(p_motivo), decision_idempotency_key = p_request_id
    where id = p_instruccion_id;
    return jsonb_build_object('ok', true, 'reutilizado', false, 'estado', 'rechazado');
  end if;

  if v_comprobante.valor_confirmado <> v_instruccion.valor_esperado then
    raise exception 'El valor confirmado no coincide con el valor esperado';
  end if;

  insert into public.abonos(
    tienda_codigo, monto, soporte_path, registrado_por, fecha,
    tipo_movimiento, tercero, concepto, fuente_fondos, observacion,
    idempotency_key, instruccion_id
  ) values (
    v_instruccion.tienda_codigo, v_instruccion.valor_esperado,
    v_comprobante.soporte_path, v_comprobante.enviado_por, v_instruccion.fecha,
    'abono_tienda', null, 'Consignación instruida por Creditek',
    'efectivo_tienda', 'KORA-2026-000014', p_request_id, v_instruccion.id
  )
  returning id into v_abono_id;

  insert into public.cuenta_corriente(
    tienda_codigo, tipo, concepto, monto,
    referencia_tipo, referencia_id, usuario
  ) values (
    v_instruccion.tienda_codigo, 'abono', 'Consignación validada',
    v_instruccion.valor_esperado, 'abono', v_abono_id, auth.uid()
  );

  v_child_key := md5(p_request_id::text || ':caja')::uuid;
  insert into public.movimientos_caja_tienda(
    tienda_codigo, fecha, tipo, monto, soporte_path, observacion,
    autorizado_por, creado_por, idempotency_key
  ) values (
    v_instruccion.tienda_codigo, v_instruccion.fecha, 'consignacion',
    v_instruccion.valor_esperado, v_comprobante.soporte_path,
    'Consignación instrucción ' || v_instruccion.id::text,
    auth.uid(), auth.uid(), v_child_key
  )
  returning id into v_movimiento_caja_id;

  update public.abonos
  set movimiento_caja_id = v_movimiento_caja_id
  where id = v_abono_id;

  if v_instruccion.tipo_destino = 'PROVEEDOR' then
    v_restante := v_instruccion.valor_esperado;
    for v_factura in
      select *
      from public.facturas_proveedor
      where proveedor_id = v_instruccion.proveedor_id
        and saldo > 0
      order by fecha, created_at, id
      for update
    loop
      exit when v_restante <= 0;
      v_aplicar := least(v_restante, v_factura.saldo);
      v_orden := v_orden + 1;
      v_child_key := md5(
        p_request_id::text || ':factura:' || v_factura.id::text
      )::uuid;
      v_pago := public.registrar_pago_proveedor(
        v_factura.id, v_aplicar, v_instruccion.fecha, 'consignacion_tienda',
        v_instruccion.id::text, v_comprobante.soporte_path,
        'Aplicación FIFO KORA-2026-000014', v_child_key
      );
      v_pago_id := (v_pago->>'pago_id')::uuid;
      insert into public.aplicaciones_consignacion_proveedor(
        instruccion_id, factura_id, pago_id, monto_aplicado, orden_fifo
      ) values (
        v_instruccion.id, v_factura.id, v_pago_id, v_aplicar, v_orden
      );
      v_restante := v_restante - v_aplicar;
    end loop;
    if v_restante > 0 then
      raise exception 'La cartera del proveedor no cubre el valor de la instrucción';
    end if;
  elsif v_instruccion.tipo_destino = 'OSCAR' then
    v_child_key := md5(p_request_id::text || ':b2b')::uuid;
    insert into public.movimientos_tesoreria_central(
      fecha, tipo, fuente_fondos, monto, referencia_tipo, referencia_id,
      soporte_path, observacion, creado_por, idempotency_key
    ) values (
      v_instruccion.fecha, 'salida_oscar', 'efectivo_tienda',
      v_instruccion.valor_esperado, 'instruccion_consignacion',
      v_instruccion.id, v_comprobante.soporte_path,
      'Salida interna Creditek B2B · OSCAR', auth.uid(), v_child_key
    )
    returning id into v_movimiento_b2b_id;
  end if;

  update public.comprobantes_consignacion
  set estado = 'validado', decidido_por = auth.uid(),
      decidido_at = now(), motivo_decision = null
  where id = v_comprobante.id;
  update public.instrucciones_consignacion
  set estado = 'validado', decidida_por = auth.uid(), decidida_at = now(),
      motivo_decision = null, decision_idempotency_key = p_request_id
  where id = p_instruccion_id;

  return jsonb_build_object(
    'ok', true, 'reutilizado', false, 'estado', 'validado',
    'abono_id', v_abono_id, 'movimiento_caja_id', v_movimiento_caja_id,
    'movimiento_b2b_id', v_movimiento_b2b_id, 'facturas_aplicadas', v_orden
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enviar_comprobante_consignacion(p_instruccion_id uuid, p_valor_confirmado numeric, p_soporte_path text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_perfil public.perfiles%rowtype;
  v_instruccion public.instrucciones_consignacion%rowtype;
  v_comprobante public.comprobantes_consignacion%rowtype;
  v_version integer;
begin
  select * into v_perfil
  from public.perfiles
  where id = auth.uid() and activo = true;
  if not found or v_perfil.rol in ('gerencia', 'auditoria') then
    raise exception 'La tienda debe enviar el comprobante';
  end if;

  select * into v_comprobante
  from public.comprobantes_consignacion
  where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object(
      'ok', true, 'reutilizado', true, 'comprobante_id', v_comprobante.id
    );
  end if;

  select * into v_instruccion
  from public.instrucciones_consignacion
  where id = p_instruccion_id
  for update;
  if not found then
    raise exception 'Instrucción no encontrada';
  end if;
  if v_instruccion.tienda_codigo <> v_perfil.tienda_codigo then
    raise exception 'No autorizado para esta instrucción';
  end if;
  if v_instruccion.estado not in ('pendiente', 'rechazado') then
    raise exception 'La instrucción no admite un nuevo comprobante';
  end if;
  if p_valor_confirmado is null or p_valor_confirmado <= 0
     or nullif(btrim(coalesce(p_soporte_path, '')), '') is null
     or p_idempotency_key is null then
    raise exception 'Valor, comprobante e idempotencia son obligatorios';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
  from public.comprobantes_consignacion
  where instruccion_id = p_instruccion_id;

  insert into public.comprobantes_consignacion(
    instruccion_id, version, valor_confirmado, soporte_path,
    enviado_por, idempotency_key
  ) values (
    p_instruccion_id, v_version, p_valor_confirmado, btrim(p_soporte_path),
    auth.uid(), p_idempotency_key
  )
  returning * into v_comprobante;

  update public.instrucciones_consignacion
  set estado = 'en_validacion',
      decidida_por = null,
      decidida_at = null,
      motivo_decision = null,
      decision_idempotency_key = null
  where id = p_instruccion_id;

  return jsonb_build_object(
    'ok', true, 'reutilizado', false, 'comprobante_id', v_comprobante.id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finanzas_decidir_movimiento(p_id uuid, p_decision text, p_amount numeric DEFAULT NULL::numeric, p_note text DEFAULT NULL::text)
 RETURNS financial_entries
 LANGUAGE sql
 SET search_path TO ''
AS $function$select kora_private.finanzas_decidir_movimiento($1,$2,$3,$4)$function$
;

CREATE OR REPLACE FUNCTION kora_private.finanzas_decidir_movimiento(p_id uuid, p_decision text, p_amount numeric DEFAULT NULL::numeric, p_note text DEFAULT NULL::text)
 RETURNS financial_entries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.financial_entries%rowtype;
begin
  if auth.uid() is distinct from '6de0ad26-64af-4966-8cd9-d468880af627'::uuid
    or (select public.rol_actual()) is distinct from 'gerencia' or not (select public.es_controlador_financiero()) then
    raise exception 'Solo Oscar puede aprobar o rechazar movimientos';
  end if;
  if p_decision not in ('aprobado','rechazado') then raise exception 'Decisión no permitida'; end if;
  select * into v from public.financial_entries where id=p_id for update;
  if v.id is null or v.status<>'pendiente_aprobacion' then raise exception 'Movimiento no encontrado o ya decidido'; end if;
  if p_decision='aprobado' and coalesce(p_amount,v.amount,0)<=0 then raise exception 'Confirma el valor antes de aprobar'; end if;
  update public.financial_entries set
    amount=case when p_decision='aprobado' then coalesce(p_amount,amount) else amount end,
    status=p_decision,approved_by=auth.uid(),approved_at=now(),
    note=coalesce(nullif(btrim(coalesce(p_note,'')),''),note),updated_at=now()
  where id=p_id returning * into v;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
  values(auth.uid(),'finanzas_movimiento_'||p_decision,'financial_entries',v.id,jsonb_build_object('entry_type',v.entry_type,'business_unit',v.business_unit,'amount',v.amount));
  return v;
end
$function$
;

CREATE OR REPLACE FUNCTION public.finanzas_registrar_pago(p_id uuid, p_support_path text)
 RETURNS financial_entries
 LANGUAGE sql
 SET search_path TO ''
AS $function$select kora_private.finanzas_registrar_pago($1,$2)$function$
;

CREATE OR REPLACE FUNCTION kora_private.finanzas_registrar_pago(p_id uuid, p_support_path text)
 RETURNS financial_entries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.financial_entries%rowtype;
begin
  if not (select public.es_controlador_financiero()) then raise exception 'Solo Maite u Oscar pueden registrar el pago'; end if;
  if nullif(btrim(coalesce(p_support_path,'')),'') is null then raise exception 'Adjunta el soporte del pago'; end if;
  if p_support_path !~ '^finanzas/[0-9a-f-]{36}\.(pdf|jpg|jpeg|png)$'
    or not exists (select 1 from storage.objects where bucket_id='soportes' and name=p_support_path) then
    raise exception 'El soporte del pago no está cargado en Finanzas';
  end if;
  update public.financial_entries set status='pagado',paid_by=auth.uid(),paid_at=now(),support_path=btrim(p_support_path),updated_at=now()
  where id=p_id and status='aprobado' returning * into v;
  if v.id is null then raise exception 'El movimiento no está aprobado o ya fue pagado'; end if;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
  values(auth.uid(),'finanzas_pago_registrado','financial_entries',v.id,jsonb_build_object('entry_type',v.entry_type,'business_unit',v.business_unit,'amount',v.amount,'support_path',v.support_path));
  return v;
end
$function$
;

CREATE OR REPLACE FUNCTION public.listar_instrucciones_consignacion()
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_perfil public.perfiles%rowtype;
begin
  select * into v_perfil
  from public.perfiles
  where id = auth.uid() and activo = true;
  if not found then
    raise exception 'Perfil activo requerido';
  end if;

  return query
  select
    jsonb_build_object(
      'id', i.id,
      'tienda_codigo', i.tienda_codigo,
      'fecha', i.fecha,
      'banco', i.banco,
      'numero_cuenta', i.numero_cuenta,
      'valor_esperado', i.valor_esperado,
      'estado', i.estado,
      'created_at', i.created_at,
      'comprobante_id', c.id,
      'comprobante_version', c.version,
      'valor_confirmado', c.valor_confirmado,
      'soporte_path', c.soporte_path,
      'motivo_decision', c.motivo_decision
    )
    || case when v_perfil.rol in ('gerencia', 'auditoria') then
      jsonb_build_object(
        'proveedor_id', i.proveedor_id,
        'proveedor_nombre', p.nombre,
        'tipo_destino', i.tipo_destino,
        'observacion', i.observacion,
        'creada_por', i.creada_por,
        'decidida_por', i.decidida_por,
        'decidida_at', i.decidida_at
      )
    else '{}'::jsonb end
  from public.instrucciones_consignacion i
  left join public.proveedores p on p.id = i.proveedor_id
  left join lateral (
    select cc.*
    from public.comprobantes_consignacion cc
    where cc.instruccion_id = i.id
    order by cc.version desc
    limit 1
  ) c on true
  where v_perfil.rol in ('gerencia', 'auditoria')
     or i.tienda_codigo = v_perfil.tienda_codigo
  order by i.fecha desc, i.created_at desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.proteger_snapshot_instruccion_consignacion()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.tienda_codigo is distinct from old.tienda_codigo
     or new.fecha is distinct from old.fecha
     or new.banco is distinct from old.banco
     or new.numero_cuenta is distinct from old.numero_cuenta
     or new.valor_esperado is distinct from old.valor_esperado
     or new.tipo_destino is distinct from old.tipo_destino
     or new.proveedor_id is distinct from old.proveedor_id
     or new.creada_por is distinct from old.creada_por
     or new.created_at is distinct from old.created_at then
    raise exception 'El snapshot bancario de la instrucción es inmutable';
  end if;
  new.updated_at := now();
  return new;
end;
$function$
;
