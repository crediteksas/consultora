-- Retiro Retail: aprobación -> instrucciones SOCIO -> soporte de tienda -> caja.
-- No ejecuta transferencias, no modifica cierres ni genera gastos/abonos/B2B.
begin;
alter table public.financial_entries add column retail_funding jsonb;
alter table public.financial_entries add column retail_request_id uuid unique;
alter table public.comprobantes_consignacion add column fecha_pago date;
alter table public.instrucciones_consignacion
  add column financial_entry_id uuid references public.financial_entries(id),
  add column beneficiario_socio text,
  add column movimiento_retiro_id uuid unique references public.movimientos_caja_tienda(id);
create unique index retiro_instruccion_tienda_unique on public.instrucciones_consignacion(financial_entry_id,tienda_codigo)
  where financial_entry_id is not null;
-- Replace only the two legacy destination checks; preserve all other checks.
do $$ declare c record; begin
  for c in select conname from pg_constraint where conrelid='public.instrucciones_consignacion'::regclass
    and contype='c' and pg_get_constraintdef(oid) like '%tipo_destino%'
  loop execute format('alter table public.instrucciones_consignacion drop constraint %I',c.conname); end loop;
end $$;
alter table public.instrucciones_consignacion add constraint instrucciones_destino_retail_check check (
  (tipo_destino='PROVEEDOR' and proveedor_id is not null and financial_entry_id is null and beneficiario_socio is null) or
  (tipo_destino='OSCAR' and proveedor_id is null and financial_entry_id is null and beneficiario_socio is null) or
  (tipo_destino='SOCIO' and proveedor_id is null and financial_entry_id is not null and beneficiario_socio is not null and length(btrim(beneficiario_socio))>=3)
);

create or replace function kora_private.preparar_retiro_retail(p_datos jsonb,p_request_id uuid)
returns public.financial_entries language plpgsql security definer set search_path='' as $$
declare v public.financial_entries%rowtype; a jsonb; total numeric:=0; codes text[]:='{}'; bank text; account text;
begin
  if auth.uid() is null or not public.es_controlador_financiero() then raise exception 'Solo Maite u Oscar pueden preparar retiros'; end if;
  if p_request_id is null then raise exception 'La solicitud requiere idempotencia'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  select * into v from public.financial_entries where retail_request_id=p_request_id;
  if found then
    if v.retail_funding->'request' is distinct from p_datos then raise exception 'La solicitud ya existe con otros datos'; end if;
    return v;
  end if;
  if jsonb_typeof(p_datos->'stores') is distinct from 'array' then raise exception 'Selecciona las tiendas que entregan el dinero'; end if;
  if jsonb_array_length(p_datos->'stores') not between 1 and 50 then raise exception 'Selecciona entre 1 y 50 tiendas'; end if;
  bank:=btrim(p_datos->>'bank'); account:=btrim(p_datos->>'account');
  if coalesce(length(bank),0)<2 or account is null or account !~ '^[0-9]{6,20}$'
    or coalesce(p_datos->>'account_type','') not in ('Ahorros','Corriente','Billetera digital') then raise exception 'Completa banco, tipo y número de cuenta del socio'; end if;
  if coalesce(length(btrim(p_datos->>'document')),0)<3 then raise exception 'Identifica al socio beneficiario'; end if;
  for a in select value from jsonb_array_elements(p_datos->'stores') loop
    if coalesce(a->>'store','')=any(codes) then raise exception 'No repitas una tienda'; end if;
    if not exists(select 1 from public.origenes where codigo=a->>'store' and tipo='propia' and activo) then raise exception 'La tienda debe ser propia y activa'; end if;
    if (a->>'amount') is null or (a->>'amount') !~ '^[0-9]+(\.[0-9]{1,2})?$' or (a->>'amount')::numeric<=0 then raise exception 'Monto inválido por tienda'; end if;
    total:=total+(a->>'amount')::numeric; codes:=array_append(codes,a->>'store');
  end loop;
  if total is distinct from (p_datos->>'amount')::numeric then raise exception 'La suma de tiendas no coincide con el retiro'; end if;
  v:=kora_private.finanzas_registrar_movimiento('retiro_utilidad','retail',(p_datos->>'date')::date,'retiro',
    p_datos->>'concept',p_datos->>'beneficiary',p_datos->>'document',bank||' · '||(p_datos->>'account_type')||' · '||account,
    total,(p_datos->>'from')::date,(p_datos->>'to')::date,p_datos->>'note');
  update public.financial_entries set retail_funding=jsonb_build_object('request',p_datos),retail_request_id=p_request_id where id=v.id returning * into v;
  return v;
end $$;
revoke all on function kora_private.preparar_retiro_retail(jsonb,uuid) from public,anon;
grant execute on function kora_private.preparar_retiro_retail(jsonb,uuid) to authenticated;
create function public.finanzas_preparar_retiro_retail(p_datos jsonb,p_request_id uuid)
returns public.financial_entries language sql security invoker set search_path='' as $$select kora_private.preparar_retiro_retail($1,$2)$$;
revoke all on function public.finanzas_preparar_retiro_retail(jsonb,uuid) from public,anon;
grant execute on function public.finanzas_preparar_retiro_retail(jsonb,uuid) to authenticated;

create function kora_private.retiro_retail_guardar_estado() returns trigger language plpgsql security definer set search_path='' as $$
declare a jsonb; req jsonb; disponible numeric; reservado numeric; total numeric;
begin
  if old.entry_type<>'retiro_utilidad' or old.business_unit<>'retail' then return new; end if;
  if old.retail_funding is not null and (new.retail_funding is distinct from old.retail_funding or new.retail_request_id is distinct from old.retail_request_id
    or new.amount is distinct from old.amount or new.beneficiary is distinct from old.beneficiary or new.beneficiary_document is distinct from old.beneficiary_document
    or new.destination_account is distinct from old.destination_account or new.due_date is distinct from old.due_date
    or new.source_period_from is distinct from old.source_period_from or new.source_period_to is distinct from old.source_period_to) then
    raise exception 'El retiro y su distribución son inmutables; rechaza y crea uno nuevo';
  end if;
  if new.status=old.status then return new; end if;
  if new.status='aprobado' then
    if auth.uid() is distinct from '6de0ad26-64af-4966-8cd9-d468880af627'::uuid or not public.es_controlador_financiero() or public.rol_actual()<>'gerencia' then raise exception 'Solo Oscar puede aprobar'; end if;
    req:=new.retail_funding->'request';
    if req is null then raise exception 'Falta distribuir este retiro entre las cajas de las tiendas'; end if;
    if new.due_date<>(now() at time zone 'America/Bogota')::date then raise exception 'La instrucción debe aprobarse para la fecha de hoy'; end if;
    select sum((value->>'amount')::numeric) into total from jsonb_array_elements(req->'stores');
    if total is distinct from new.amount then raise exception 'La distribución no coincide con el retiro aprobado'; end if;
    -- Same lock key as legacy instructions, sorted to prevent cross-store deadlocks.
    for a in select value from jsonb_array_elements(req->'stores') order by value->>'store' loop
      if not exists(select 1 from public.origenes where codigo=a->>'store' and tipo='propia' and activo) then raise exception 'Tienda no activa'; end if;
      perform pg_advisory_xact_lock(hashtextextended('retiro-caja:'||(a->>'store'),0));
      disponible:=coalesce((public.calcular_efectivo_esperado_tienda(a->>'store',new.due_date)->>'esperado')::numeric,0);
      select coalesce(sum(valor_esperado),0) into reservado from public.instrucciones_consignacion
        where tienda_codigo=a->>'store' and (estado in ('pendiente','en_validacion') or (tipo_destino='SOCIO' and estado='rechazado'));
      if (a->>'amount')::numeric>disponible-reservado then raise exception 'Efectivo insuficiente en tienda %',a->>'store'; end if;
      insert into public.instrucciones_consignacion(tienda_codigo,fecha,banco,numero_cuenta,valor_esperado,tipo_destino,
        financial_entry_id,beneficiario_socio,observacion,creada_por)
      values(a->>'store',new.due_date,(req->>'bank')||' · '||(req->>'account_type'),req->>'account',(a->>'amount')::numeric,'SOCIO',
        new.id,new.beneficiary,'Retiro de utilidad Retail · '||new.id::text,auth.uid());
    end loop;
  elsif new.status='pagado' then
    select sum(valor_esperado) into total from public.instrucciones_consignacion
      where financial_entry_id=new.id and estado='validado' and movimiento_retiro_id is not null;
    if total is distinct from new.amount then raise exception 'El retiro se paga únicamente validando los comprobantes de las tiendas'; end if;
  elsif old.status='aprobado' then
    raise exception 'No cambies el estado de un retiro con instrucciones emitidas';
  end if;
  return new;
end $$;
revoke all on function kora_private.retiro_retail_guardar_estado() from public,anon,authenticated;
create trigger retiro_retail_estado before update on public.financial_entries for each row execute function kora_private.retiro_retail_guardar_estado();

create function kora_private.validar_retiro_tienda(p_id uuid,p_decision text,p_motivo text,p_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.instrucciones_consignacion%rowtype; c public.comprobantes_consignacion%rowtype; e public.financial_entries%rowtype; mov uuid; total numeric;
begin
  if auth.uid() is null or not public.es_controlador_financiero() then raise exception 'Solo Maite u Oscar validan soportes de retiro'; end if;
  if p_request is null or p_decision is null or p_decision not in ('validado','rechazado') then raise exception 'Decisión inválida'; end if;
  select * into i from public.instrucciones_consignacion where id=p_id and tipo_destino='SOCIO' for update;
  if not found then raise exception 'Instrucción de socio no encontrada'; end if;
  if i.decision_idempotency_key=p_request then return jsonb_build_object('ok',true,'reutilizado',true,'estado',i.estado); end if;
  if i.estado<>'en_validacion' then raise exception 'La instrucción no está pendiente de validación'; end if;
  select * into e from public.financial_entries where id=i.financial_entry_id for update;
  if e.status<>'aprobado' or e.approved_by is distinct from '6de0ad26-64af-4966-8cd9-d468880af627'::uuid then raise exception 'Retiro sin aprobación de Oscar'; end if;
  select * into c from public.comprobantes_consignacion where instruccion_id=i.id and estado='enviado' order by version desc limit 1 for update;
  if not found then raise exception 'No existe comprobante pendiente'; end if;
  if p_decision='rechazado' then
    if coalesce(length(btrim(p_motivo)),0)=0 then raise exception 'Indica motivo de rechazo'; end if;
  else
    if c.fecha_pago is null or c.fecha_pago<i.fecha or c.fecha_pago>(now() at time zone 'America/Bogota')::date then
      raise exception 'Confirma la fecha real del pago en el comprobante de retiro';
    end if;
    if c.valor_confirmado is distinct from i.valor_esperado then raise exception 'El comprobante no coincide con el valor autorizado'; end if;
    if c.soporte_path not like i.tienda_codigo||'/consignaciones/'||i.id::text||'/%'
      or not exists(select 1 from storage.objects where bucket_id='soportes' and name=c.soporte_path) then raise exception 'El soporte no está cargado para esta instrucción'; end if;
    insert into public.movimientos_caja_tienda(tienda_codigo,fecha,tipo,monto,soporte_path,observacion,autorizado_por,creado_por,idempotency_key)
    values(i.tienda_codigo,c.fecha_pago,'retiro',i.valor_esperado,c.soporte_path,'Retiro Retail '||e.id::text||' · instrucción '||i.id::text,
      e.approved_by,auth.uid(),md5('retiro-retail:'||i.id::text)::uuid) returning id into mov;
  end if;
  update public.comprobantes_consignacion set estado=p_decision,decidido_por=auth.uid(),decidido_at=now(),
    motivo_decision=case when p_decision='rechazado' then btrim(p_motivo) end where id=c.id;
  update public.instrucciones_consignacion set estado=p_decision,decidida_por=auth.uid(),decidida_at=now(),
    motivo_decision=case when p_decision='rechazado' then btrim(p_motivo) end,decision_idempotency_key=p_request,movimiento_retiro_id=mov where id=i.id;
  if p_decision='validado' then
    select sum(valor_esperado) into total from public.instrucciones_consignacion where financial_entry_id=e.id and estado='validado' and movimiento_retiro_id is not null;
    if total=e.amount then
      update public.financial_entries set status='pagado',paid_by=auth.uid(),paid_at=now(),support_path=c.soporte_path,updated_at=now() where id=e.id;
    end if;
  end if;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),'retiro_retail_'||p_decision,'financial_entries',e.id,
    jsonb_build_object('instruction',i.id,'cash_movement',mov,'store',i.tienda_codigo,'amount',i.valor_esperado,'payment_date',c.fecha_pago));
  return jsonb_build_object('ok',true,'estado',p_decision,'movimiento_caja_id',mov);
end $$;
revoke all on function kora_private.validar_retiro_tienda(uuid,text,text,uuid) from public,anon,authenticated;
-- Remaining reviewed legacy function definitions are appended below.
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

  if v_instruccion.tipo_destino = 'SOCIO' then
    return kora_private.validar_retiro_tienda(p_instruccion_id,p_decision,p_motivo,p_request_id);
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
CREATE OR REPLACE FUNCTION public.proteger_snapshot_instruccion_consignacion()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.financial_entry_id is distinct from old.financial_entry_id
     or new.beneficiario_socio is distinct from old.beneficiario_socio
     or new.tienda_codigo is distinct from old.tienda_codigo
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
      'beneficiario_socio', i.beneficiario_socio,
      'financial_entry_id', i.financial_entry_id,
      'tienda_codigo', i.tienda_codigo,
      'fecha', i.fecha,
      'banco', i.banco,
      'numero_cuenta', i.numero_cuenta,
      'valor_esperado', i.valor_esperado,
      'estado', i.estado,
      'created_at', i.created_at,
      'comprobante_id', c.id,
      'comprobante_version', c.version,
      'fecha_pago', c.fecha_pago,
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
CREATE OR REPLACE FUNCTION public.crear_instruccion_consignacion(p_tienda_codigo text, p_fecha date, p_banco text, p_numero_cuenta text, p_valor_esperado numeric, p_tipo_destino text, p_proveedor_id uuid DEFAULT NULL::uuid, p_observacion text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_perfil public.perfiles%rowtype;
  v_efectivo numeric;
  v_reservado numeric;
  v_instruccion public.instrucciones_consignacion%rowtype;
begin
  select * into v_perfil
  from public.perfiles
  where id = auth.uid() and activo = true;
  if not found or v_perfil.rol not in ('gerencia', 'auditoria') then
    raise exception 'Solo Oscar o Maythe pueden crear instrucciones';
  end if;
  if p_fecha is null or p_valor_esperado is null or p_valor_esperado <= 0
     or nullif(btrim(coalesce(p_banco, '')), '') is null
     or nullif(btrim(coalesce(p_numero_cuenta, '')), '') is null
     or p_tipo_destino not in ('PROVEEDOR', 'OSCAR') then
    raise exception 'Tienda, fecha, banco, cuenta, valor y destino son obligatorios';
  end if;
  if (p_tipo_destino = 'PROVEEDOR' and p_proveedor_id is null)
     or (p_tipo_destino = 'OSCAR' and p_proveedor_id is not null) then
    raise exception 'El proveedor no corresponde al tipo de destino';
  end if;
  if p_tipo_destino = 'PROVEEDOR' and not exists (
    select 1 from public.proveedores
    where id = p_proveedor_id and activo = true
  ) then
    raise exception 'El proveedor debe estar activo';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('retiro-caja:' || p_tienda_codigo, 0));
  v_efectivo := coalesce(
    (public.calcular_efectivo_esperado_tienda(p_tienda_codigo, p_fecha)->>'esperado')::numeric,
    0
  );
  select coalesce(sum(valor_esperado), 0) into v_reservado
  from public.instrucciones_consignacion
  where tienda_codigo = p_tienda_codigo
    and ((fecha = p_fecha and estado in ('pendiente', 'en_validacion'))
      or (tipo_destino='SOCIO' and estado in ('pendiente','en_validacion','rechazado')));
  if p_valor_esperado > v_efectivo - v_reservado then
    raise exception 'El valor supera el efectivo disponible sin asignar';
  end if;

  insert into public.instrucciones_consignacion(
    tienda_codigo, fecha, banco, numero_cuenta, valor_esperado,
    tipo_destino, proveedor_id, observacion, creada_por
  ) values (
    p_tienda_codigo, p_fecha, btrim(p_banco), btrim(p_numero_cuenta),
    p_valor_esperado, p_tipo_destino, p_proveedor_id,
    nullif(btrim(coalesce(p_observacion, '')), ''), auth.uid()
  )
  returning * into v_instruccion;

  return jsonb_build_object('ok', true, 'instruccion_id', v_instruccion.id);
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

  select * into v_instruccion from public.instrucciones_consignacion where id=p_instruccion_id;
  if v_instruccion.tipo_destino='SOCIO' then
    if v_perfil.tienda_codigo is distinct from v_instruccion.tienda_codigo then raise exception 'No autorizado para esta instrucción'; end if;
    if p_soporte_path is null or p_soporte_path not like v_instruccion.tienda_codigo||'/consignaciones/'||v_instruccion.id::text||'/%'
      or not exists(select 1 from storage.objects where bucket_id='soportes' and name=p_soporte_path) then raise exception 'El soporte no está cargado para esta instrucción'; end if;
  end if;
  select * into v_comprobante
  from public.comprobantes_consignacion
  where idempotency_key = p_idempotency_key;
  if found then
    if v_instruccion.tipo_destino='SOCIO' and (v_comprobante.instruccion_id is distinct from p_instruccion_id
      or v_comprobante.enviado_por is distinct from auth.uid() or v_comprobante.valor_confirmado is distinct from p_valor_confirmado
      or v_comprobante.soporte_path is distinct from p_soporte_path) then raise exception 'El reintento no coincide con el comprobante original'; end if;
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
create function kora_private.enviar_comprobante_retiro_retail(p_id uuid,p_valor numeric,p_soporte text,p_fecha_pago date,p_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.instrucciones_consignacion%rowtype; c public.comprobantes_consignacion%rowtype; r jsonb;
begin
  if auth.uid() is null then raise exception 'Inicia sesión como tienda'; end if;
  select * into i from public.instrucciones_consignacion where id=p_id and tipo_destino='SOCIO' for update;
  if not found or not exists(select 1 from public.perfiles where id=auth.uid() and activo and rol not in ('gerencia','auditoria') and tienda_codigo=i.tienda_codigo) then
    raise exception 'No autorizado para esta instrucción';
  end if;
  if p_fecha_pago is null or p_fecha_pago<i.fecha or p_fecha_pago>(now() at time zone 'America/Bogota')::date then raise exception 'Indica la fecha real del pago, desde la instrucción hasta hoy'; end if;
  select * into c from public.comprobantes_consignacion where idempotency_key=p_request;
  if found and c.fecha_pago is distinct from p_fecha_pago then raise exception 'El reintento cambia la fecha del comprobante original'; end if;
  r:=public.enviar_comprobante_consignacion(p_id,p_valor,p_soporte,p_request);
  if not coalesce((r->>'reutilizado')::boolean,false) then
    perform public.caja_exigir_apertura(i.tienda_codigo,p_fecha_pago,false);
    update public.comprobantes_consignacion set fecha_pago=p_fecha_pago where id=(r->>'comprobante_id')::uuid;
  end if;
  return r||jsonb_build_object('fecha_pago',p_fecha_pago);
end $$;
revoke all on function kora_private.enviar_comprobante_retiro_retail(uuid,numeric,text,date,uuid) from public,anon;
grant execute on function kora_private.enviar_comprobante_retiro_retail(uuid,numeric,text,date,uuid) to authenticated;
create function public.enviar_comprobante_retiro_retail(p_id uuid,p_valor numeric,p_soporte text,p_fecha_pago date,p_request uuid)
returns jsonb language sql security invoker set search_path='' as $$select kora_private.enviar_comprobante_retiro_retail($1,$2,$3,$4,$5)$$;
revoke all on function public.enviar_comprobante_retiro_retail(uuid,numeric,text,date,uuid) from public,anon;
grant execute on function public.enviar_comprobante_retiro_retail(uuid,numeric,text,date,uuid) to authenticated;
create function kora_private.retiro_retail_proteger_cierre() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.estado in ('validada','autorizada') and exists(
    select 1 from public.instrucciones_consignacion i join public.comprobantes_consignacion c on c.instruccion_id=i.id
    where i.tienda_codigo=new.tienda_codigo and i.tipo_destino='SOCIO' and i.estado in ('en_validacion','rechazado')
      and c.estado in ('enviado','rechazado') and c.fecha_pago<=new.fecha
  ) then raise exception 'Hay un retiro de socio con soporte pendiente. Mayte u Oscar deben validarlo antes de cerrar caja'; end if;
  return new;
end $$;
revoke all on function kora_private.retiro_retail_proteger_cierre() from public,anon,authenticated;
create trigger retiro_retail_cierre before insert or update on public.caja_cortes for each row execute function kora_private.retiro_retail_proteger_cierre();
commit;
