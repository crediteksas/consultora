-- Saldos a favor de Creditek en proveedores. No se cambian saldos existentes.
-- Giro: pago completo, aplicación FIFO + anticipo por excedente.
-- Descuento/garantía: ajuste Maite -> Óscar, sin otro movimiento bancario.
begin;
alter table public.proveedores_ajustes_solicitudes
  drop constraint proveedores_ajustes_solicitudes_saldo_base_check,
  drop constraint proveedores_ajustes_solicitudes_saldo_objetivo_check,
  add constraint proveedores_ajustes_solicitudes_saldo_base_check check (saldo_base>-1000000000000000 and saldo_base<1000000000000000),
  add constraint proveedores_ajustes_solicitudes_saldo_objetivo_check check (saldo_objetivo>-1000000000000000 and saldo_objetivo<1000000000000000 and saldo_objetivo=trunc(saldo_objetivo));
alter table public.proveedores_ajustes_detalle
  drop constraint proveedores_ajustes_detalle_saldo_nuevo_check,
  add constraint proveedores_ajustes_detalle_saldo_nuevo_check check (saldo_nuevo>-1000000000000000 and saldo_nuevo<1000000000000000);
alter table public.banco_creditek_pagos_proveedor add column saldo_favor_generado numeric(18,2) not null default 0
  check (saldo_favor_generado>=0 and saldo_favor_generado<=monto);

CREATE OR REPLACE FUNCTION proveedores_control_private.registrar_pago_proveedor(p_factura_id uuid, p_monto numeric, p_fecha date, p_metodo text DEFAULT NULL::text, p_referencia text DEFAULT NULL::text, p_soporte_path text DEFAULT NULL::text, p_nota text DEFAULT NULL::text, p_idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_factura public.facturas_proveedor%rowtype;
  v_pago public.pagos_proveedor%rowtype;
begin
  if auth.uid() is null or not exists(select 1 from public.perfiles p where p.id=auth.uid() and p.activo and p.rol in ('gerencia','auditoria')) then
    raise exception 'Solo gerencia o auditoría pueden registrar pagos';
  end if;
  if p_idempotency_key is null then
    raise exception 'La llave de idempotencia es requerida';
  end if;
  if p_monto is null or not(p_monto > 0 and p_monto < 1000000000000000) then
    raise exception 'El pago debe ser mayor que cero';
  end if;
  if p_fecha is null then
    raise exception 'La fecha del pago es requerida';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('pago-proveedor:'||p_idempotency_key::text,0));
  perform 1 from public.proveedores where id=(select proveedor_id from public.facturas_proveedor where id=p_factura_id) and activo for update;
  if not found then raise exception 'Proveedor no activo o factura no encontrada'; end if;
  select *
  into v_factura
  from public.facturas_proveedor
  where id = p_factura_id
  for update;

  if not found then
    raise exception 'Factura de proveedor no encontrada';
  end if;

  select *
  into v_pago
  from public.pagos_proveedor
  where idempotency_key = p_idempotency_key;

  if found then
    if v_pago.factura_id <> p_factura_id or v_pago.monto <> p_monto then
      raise exception 'La llave de idempotencia ya fue usada con otro pago';
    end if;
    return jsonb_build_object(
      'ok', true,
      'reutilizado', true,
      'pago_id', v_pago.id,
      'saldo', v_factura.saldo
    );
  end if;

  -- El saldo negativo conserva el pago excedente completo.
  if p_monto > greatest(v_factura.saldo,0) and
    (nullif(btrim(coalesce(p_referencia,'')),'') is null or length(btrim(coalesce(p_nota,'')))<8)
  then raise exception 'Para registrar un excedente indica referencia y motivo del saldo a favor'; end if;

  insert into public.pagos_proveedor (
    factura_id,
    proveedor_id,
    monto,
    fecha,
    metodo,
    referencia,
    soporte_path,
    nota,
    registrado_por,
    idempotency_key
  )
  values (
    p_factura_id,
    v_factura.proveedor_id,
    p_monto,
    p_fecha,
    nullif(trim(p_metodo), ''),
    nullif(trim(p_referencia), ''),
    nullif(trim(p_soporte_path), ''),
    nullif(trim(p_nota), ''),
    auth.uid(),
    p_idempotency_key
  )
  returning * into v_pago;

  update public.facturas_proveedor
  set saldo = saldo - p_monto
  where id = p_factura_id
  returning * into v_factura;

  return jsonb_build_object(
    'ok', true,
    'reutilizado', false,
    'pago_id', v_pago.id,
    'saldo', v_factura.saldo
  );
end;
$function$;

CREATE OR REPLACE FUNCTION proveedores_control_private.banco_creditek_solicitar_pago_proveedor(p_id uuid, p_proveedor_id uuid, p_monto numeric, p_concepto text)
 RETURNS public.banco_creditek_pagos_proveedor
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.banco_creditek_pagos_proveedor%rowtype;
  v_cuenta uuid; v_deuda numeric;
begin
  if auth.uid() is distinct from 'd1782db6-bacc-4caf-af6f-ce1b8d1c0391'::uuid
    or not exists(select 1 from public.perfiles p where p.id=auth.uid() and p.activo and p.rol='auditoria')
    then raise exception 'Solo Maite puede solicitar pagos a proveedores'; end if;
  if p_id is null or p_proveedor_id is null or p_monto is null or not(p_monto>0 and p_monto<1000000000000000)
    or p_monto<>trunc(p_monto) or length(btrim(coalesce(p_concepto,'')))<8
    then raise exception 'Completa proveedor, monto en pesos y concepto'; end if;
  select * into v from public.banco_creditek_pagos_proveedor where id=p_id;
  if found then
    if (v.proveedor_id,v.monto,v.concepto) is distinct from
       (p_proveedor_id,p_monto,btrim(p_concepto)) then
      raise exception 'El identificador ya corresponde a otra solicitud'; end if;
    return v;
  end if;
  select id into v_cuenta from public.banco_creditek_cuentas
    where numero_cuenta='87600004006' and activa;
  if v_cuenta is null then raise exception 'Cuenta bancaria Creditek no disponible'; end if;
  perform 1 from public.proveedores where id=p_proveedor_id and activo for update;
  if not found then raise exception 'Proveedor no activo'; end if;
  select coalesce(sum(saldo),0) into v_deuda from public.facturas_proveedor
    where proveedor_id=p_proveedor_id and saldo>0;
  -- Se permite anticipo/excedente; Óscar autoriza el monto completo.
  insert into public.banco_creditek_pagos_proveedor(id,cuenta_id,proveedor_id,monto,concepto,solicitado_por)
    values(p_id,v_cuenta,p_proveedor_id,p_monto,btrim(p_concepto),auth.uid()) returning * into v;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(auth.uid()::text,'banco_pago_proveedor_solicitado','banco_creditek_pagos_proveedor',v.id::text,
      jsonb_build_object('proveedor_id',v.proveedor_id,'monto',v.monto));
  return v;
end $function$;

CREATE OR REPLACE FUNCTION proveedores_control_private.banco_creditek_decidir_pago_proveedor(p_id uuid, p_aprobar boolean, p_motivo_rechazo text DEFAULT NULL::text)
 RETURNS public.banco_creditek_pagos_proveedor
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.banco_creditek_pagos_proveedor%rowtype; v_deuda numeric;
begin
  if auth.uid() is distinct from '6de0ad26-64af-4966-8cd9-d468880af627'::uuid
    or not exists(select 1 from public.perfiles p where p.id=auth.uid() and p.activo and p.rol='gerencia')
    then raise exception 'Solo Óscar puede autorizar pagos a proveedores'; end if;
  select * into v from public.banco_creditek_pagos_proveedor where id=p_id for update;
  if not found or v.estado<>'pendiente' then raise exception 'Solicitud no disponible para decisión'; end if;
  if p_aprobar is null then raise exception 'Indica la decisión'; end if;
  if p_aprobar then
    perform 1 from public.proveedores where id=v.proveedor_id and activo for update;
    if not found then raise exception 'Proveedor no activo'; end if;
    select coalesce(sum(saldo),0) into v_deuda from public.facturas_proveedor
      where proveedor_id=v.proveedor_id and saldo>0;
    -- Una deuda menor no invalida el giro aprobado: el excedente queda a favor.
    update public.banco_creditek_pagos_proveedor set estado='autorizado',
      autorizado_por=auth.uid(),autorizado_at=now() where id=p_id returning * into v;
  else
    if length(btrim(coalesce(p_motivo_rechazo,'')))<10 then raise exception 'Explica el rechazo'; end if;
    update public.banco_creditek_pagos_proveedor set estado='rechazado',
      autorizado_por=auth.uid(),autorizado_at=now(),motivo_rechazo=btrim(p_motivo_rechazo)
      where id=p_id returning * into v;
  end if;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(auth.uid()::text,case when p_aprobar then 'banco_pago_proveedor_autorizado' else 'banco_pago_proveedor_rechazado' end,
      'banco_creditek_pagos_proveedor',v.id::text,jsonb_build_object('monto',v.monto,'motivo',v.motivo_rechazo));
  return v;
end $function$;

CREATE OR REPLACE FUNCTION proveedores_control_private.banco_creditek_registrar_giro_proveedor(p_id uuid, p_fecha_pago date, p_referencia_bancaria text, p_soporte_path text)
 RETURNS public.banco_creditek_pagos_proveedor
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.banco_creditek_pagos_proveedor%rowtype;
  v_cuenta public.banco_creditek_cuentas%rowtype;
  v_factura public.facturas_proveedor%rowtype;
  v_deuda numeric; v_restante numeric; v_aplicar numeric; v_pago jsonb; v_orden integer:=0;
begin
  if auth.uid() is distinct from 'd1782db6-bacc-4caf-af6f-ce1b8d1c0391'::uuid
    or not exists(select 1 from public.perfiles p where p.id=auth.uid() and p.activo and p.rol='auditoria')
    then raise exception 'Solo Maite puede registrar el giro autorizado'; end if;
  if p_fecha_pago is null or p_fecha_pago>(now() at time zone 'America/Bogota')::date
    or length(btrim(coalesce(p_referencia_bancaria,'')))<3
    or nullif(btrim(coalesce(p_soporte_path,'')),'') is null
    then raise exception 'Fecha real, referencia bancaria y soporte son obligatorios'; end if;
  select * into v from public.banco_creditek_pagos_proveedor where id=p_id for update;
  if not found then raise exception 'Solicitud no encontrada'; end if;
  if v.estado='pagado' then
    if (v.fecha_pago,v.referencia_bancaria,v.soporte_path) is distinct from
       (p_fecha_pago,btrim(p_referencia_bancaria),p_soporte_path) then
      raise exception 'El giro ya fue registrado con otra evidencia'; end if;
    return v;
  end if;
  if v.estado<>'autorizado' or v.autorizado_por is null then
    raise exception 'El pago requiere autorización previa de Óscar'; end if;
  if not exists(select 1 from storage.objects
    where bucket_id='soportes' and name=p_soporte_path
      and name like 'aliados/tesoreria/%') then
    raise exception 'El comprobante bancario no existe en el almacenamiento'; end if;
  select * into v_cuenta from public.banco_creditek_cuentas where id=v.cuenta_id for update;
  if not found or not v_cuenta.activa or v_cuenta.saldo_actual is null then
    raise exception 'Primero sincroniza el saldo real del banco'; end if;
  if p_fecha_pago<v_cuenta.fecha_corte then
    raise exception 'El giro es anterior al saldo inicial del banco'; end if;
  if v.monto>v_cuenta.saldo_actual then raise exception 'Saldo bancario insuficiente'; end if;
  perform 1 from public.proveedores where id=v.proveedor_id and activo for update;
  if not found then raise exception 'Proveedor no activo'; end if;
  select coalesce(sum(saldo),0) into v_deuda from public.facturas_proveedor
    where proveedor_id=v.proveedor_id and saldo>0;
  -- Pagar más de la deuda crea un anticipo trazado.
  v_restante:=v.monto;
  for v_factura in select * from public.facturas_proveedor
    where proveedor_id=v.proveedor_id and saldo>0
    order by fecha,created_at,id for update loop
    exit when v_restante=0;
    v_aplicar:=least(v_restante,v_factura.saldo);
    v_pago:=public.registrar_pago_proveedor(v_factura.id,v_aplicar,p_fecha_pago,
      'banco_creditek',btrim(p_referencia_bancaria),p_soporte_path,v.concepto,
      md5(v.id::text||':factura:'||v_factura.id::text)::uuid);
    if coalesce((v_pago->>'reutilizado')::boolean,false) then
      raise exception 'Aplicación duplicada fuera de la solicitud'; end if;
    v_orden:=v_orden+1;
    insert into public.banco_creditek_aplicaciones_proveedor(solicitud_id,factura_id,pago_id,monto,orden)
      values(v.id,v_factura.id,(v_pago->>'pago_id')::uuid,v_aplicar,v_orden);
    v_restante:=v_restante-v_aplicar;
  end loop;
  if v_restante>0 then
    v_pago:=proveedores_control_private.registrar_excedente(
      v.proveedor_id,v_restante,p_fecha_pago,'banco_creditek',btrim(p_referencia_bancaria),
      p_soporte_path,v.concepto,md5(v.id::text||':excedente')::uuid);
    v_orden:=v_orden+1;
    insert into public.banco_creditek_aplicaciones_proveedor(solicitud_id,factura_id,pago_id,monto,orden)
      values(v.id,(v_pago->>'factura_id')::uuid,(v_pago->>'pago_id')::uuid,v_restante,v_orden);
  end if;
  update public.banco_creditek_cuentas set saldo_actual=saldo_actual-v.monto where id=v_cuenta.id;
  insert into public.banco_creditek_movimientos(cuenta_id,solicitud_id,tipo,monto,saldo_antes,
    saldo_despues,fecha,referencia,soporte_path,registrado_por)
    values(v_cuenta.id,v.id,'pago_proveedor',v.monto,v_cuenta.saldo_actual,
      v_cuenta.saldo_actual-v.monto,p_fecha_pago,btrim(p_referencia_bancaria),p_soporte_path,auth.uid());
  update public.banco_creditek_pagos_proveedor set estado='pagado',pagado_por=auth.uid(),
    pagado_at=now(),fecha_pago=p_fecha_pago,referencia_bancaria=btrim(p_referencia_bancaria),
    soporte_path=p_soporte_path,saldo_favor_generado=v_restante,saldo_banco_antes=v_cuenta.saldo_actual,
    saldo_banco_despues=v_cuenta.saldo_actual-v.monto where id=v.id returning * into v;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(auth.uid()::text,'banco_pago_proveedor_girado','banco_creditek_pagos_proveedor',v.id::text,
      jsonb_build_object('monto',v.monto,'facturas_aplicadas',v_orden,'saldo_favor_generado',v_restante,
        'saldo_antes',v.saldo_banco_antes,'saldo_despues',v.saldo_banco_despues,
        'referencia',v.referencia_bancaria,'soporte',v.soporte_path));
  return v;
end $function$;
CREATE OR REPLACE FUNCTION proveedores_control_private.preparar_ajuste(p_id uuid, p_proveedor_id uuid, p_saldo_base numeric, p_saldo_objetivo numeric, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.proveedores_ajustes_solicitudes%rowtype;
  v_actual numeric; v_huella jsonb; v_plan jsonb:='[]'; v_f jsonb; v_resta numeric; v_reduccion numeric;
begin
  if auth.uid() is distinct from 'd1782db6-bacc-4caf-af6f-ce1b8d1c0391'::uuid or not exists(
    select 1 from public.perfiles p where p.id=auth.uid() and p.activo and p.rol='auditoria'
  ) then raise exception 'Solo Maite puede preparar ajustes de proveedores'; end if;
  if p_id is null or p_proveedor_id is null or length(btrim(coalesce(p_motivo,''))) not between 20 and 1000
    or p_saldo_base is null or not(p_saldo_base>-1000000000000000 and p_saldo_base<1000000000000000)
    or p_saldo_objetivo is null or not(p_saldo_objetivo>-1000000000000000 and p_saldo_objetivo<1000000000000000)
    or p_saldo_objetivo<>trunc(p_saldo_objetivo) or p_saldo_objetivo=p_saldo_base
  then raise exception 'Indica proveedor, saldo comprobado, nuevo saldo entero diferente y motivo de auditoría'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ajuste-proveedor:'||p_id::text,0));
  select * into s from public.proveedores_ajustes_solicitudes where id=p_id;
  if found then
    if s.proveedor_id<>p_proveedor_id or s.saldo_base<>p_saldo_base or s.saldo_objetivo<>p_saldo_objetivo
      or s.motivo<>btrim(p_motivo) or s.preparado_por<>auth.uid()
    then raise exception 'El identificador ya corresponde a otra solicitud'; end if;
    return to_jsonb(s)||jsonb_build_object('ya_registrado',true);
  end if;
  perform 1 from public.proveedores where id=p_proveedor_id and activo for update;
  if not found then raise exception 'Proveedor no activo'; end if;
  if exists(select 1 from public.proveedores_ajustes_solicitudes where proveedor_id=p_proveedor_id and estado='pendiente')
  then raise exception 'Este proveedor ya tiene un ajuste pendiente: debe decidirse antes de preparar otro'; end if;
  perform 1 from public.facturas_proveedor where proveedor_id=p_proveedor_id order by id for update;
  if exists(select 1 from public.facturas_proveedor where proveedor_id=p_proveedor_id and
    (saldo is null or not(saldo>-1000000000000000 and saldo<1000000000000000)))
  then raise exception 'Hay facturas con saldo inválido; revisa el detalle antes de ajustar'; end if;
  select coalesce(sum(saldo),0) into v_actual from public.facturas_proveedor where proveedor_id=p_proveedor_id;
  if v_actual is distinct from p_saldo_base then raise exception 'El saldo cambió: actual %. Actualiza antes de preparar',v_actual; end if;
  v_huella:=proveedores_control_private.huella(p_proveedor_id);
  if p_saldo_objetivo>v_actual then
    v_plan:=jsonb_build_array(jsonb_build_object('factura_id',null,'numero','Ajuste autorizado de saldo (no es compra)',
      'saldo_anterior',0,'saldo_nuevo',p_saldo_objetivo-v_actual,'diferencia',p_saldo_objetivo-v_actual));
  else
    v_resta:=v_actual-p_saldo_objetivo;
    for v_f in select value from jsonb_array_elements(v_huella) loop
      exit when v_resta=0;
      v_reduccion:=least(v_resta,(v_f->>'saldo')::numeric);
      if v_reduccion>0 then
        v_plan:=v_plan||jsonb_build_array(jsonb_build_object('factura_id',v_f->>'id','numero',v_f->>'numero',
          'saldo_anterior',(v_f->>'saldo')::numeric,'saldo_nuevo',(v_f->>'saldo')::numeric-v_reduccion,'diferencia',-v_reduccion));
        v_resta:=v_resta-v_reduccion;
      end if;
    end loop;
    -- Un descuento/garantía puede agotar la deuda y dejar un saldo a favor.
    if v_resta>0 then
      v_plan:=v_plan||jsonb_build_array(jsonb_build_object('factura_id',null,
        'numero','Saldo a favor por ajuste autorizado (no es compra)',
        'saldo_anterior',0,'saldo_nuevo',-v_resta,'diferencia',-v_resta));
    end if;
  end if;
  insert into public.proveedores_ajustes_solicitudes(id,proveedor_id,saldo_base,saldo_objetivo,motivo,facturas_base,plan,preparado_por)
    values(p_id,p_proveedor_id,v_actual,p_saldo_objetivo,btrim(p_motivo),v_huella,v_plan,auth.uid()) returning * into s;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(auth.uid()::text,'ajuste_proveedor_preparado','proveedores_ajustes_solicitudes',p_id::text,
      jsonb_build_object('proveedor_id',p_proveedor_id,'base',v_actual,'objetivo',p_saldo_objetivo,'plan',v_plan));
  return to_jsonb(s)||jsonb_build_object('ya_registrado',false);
end $function$;

CREATE OR REPLACE FUNCTION proveedores_control_private.decidir_ajuste(p_id uuid, p_aprobar boolean, p_motivo_rechazo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.proveedores_ajustes_solicitudes%rowtype; v_linea jsonb; v_factura uuid; v_actual numeric;
begin
  if auth.uid() is distinct from '6de0ad26-64af-4966-8cd9-d468880af627'::uuid or not exists(
    select 1 from public.perfiles p where p.id=auth.uid() and p.activo and p.rol='gerencia'
  ) then raise exception 'Solo Óscar puede autorizar o rechazar ajustes de proveedores'; end if;
  if p_aprobar is null then raise exception 'Indica aprobar o rechazar'; end if;
  select * into s from public.proveedores_ajustes_solicitudes where id=p_id;
  if not found then raise exception 'Solicitud no encontrada'; end if;
  perform 1 from public.proveedores where id=s.proveedor_id for update;
  select * into s from public.proveedores_ajustes_solicitudes where id=p_id for update;
  if s.estado<>'pendiente' then return jsonb_build_object('id',s.id,'estado',s.estado,'ya_decidido',true); end if;
  if not p_aprobar then
    if length(btrim(coalesce(p_motivo_rechazo,'')))<10 then raise exception 'Indica un motivo de rechazo de al menos 10 caracteres'; end if;
    update public.proveedores_ajustes_solicitudes set estado='rechazado',decidido_por=auth.uid(),decidido_at=now(),
      motivo_rechazo=btrim(p_motivo_rechazo) where id=p_id;
  else
    if not exists(select 1 from public.proveedores where id=s.proveedor_id and activo) then raise exception 'Proveedor no activo'; end if;
    perform 1 from public.facturas_proveedor where proveedor_id=s.proveedor_id order by id for update;
    if proveedores_control_private.huella(s.proveedor_id) is distinct from s.facturas_base then
      raise exception 'Las facturas cambiaron desde la solicitud. Rechaza esta propuesta y pide a Maite una nueva'; end if;
    for v_linea in select value from jsonb_array_elements(s.plan) loop
      v_factura:=(v_linea->>'factura_id')::uuid;
      if v_factura is null then
        -- Total cero: no incrementa compras ni inventario. El saldo nace del ajuste trazado abajo.
        insert into public.facturas_proveedor(proveedor_id,numero,fecha,total,saldo,nota,origen_registro,registrado_por)
          values(s.proveedor_id,'AJG-'||s.id::text,(now() at time zone 'America/Bogota')::date,0,
            (v_linea->>'saldo_nuevo')::numeric,'Ajuste de saldo autorizado: '||s.motivo,'ajuste_gerencia',auth.uid())
          returning id into v_factura;
      else
        update public.facturas_proveedor set saldo=(v_linea->>'saldo_nuevo')::numeric
          where id=v_factura and proveedor_id=s.proveedor_id;
      end if;
      insert into public.proveedores_ajustes_detalle(solicitud_id,factura_id,saldo_anterior,saldo_nuevo,diferencia)
        values(s.id,v_factura,(v_linea->>'saldo_anterior')::numeric,(v_linea->>'saldo_nuevo')::numeric,(v_linea->>'diferencia')::numeric);
    end loop;
    select coalesce(sum(saldo),0) into v_actual from public.facturas_proveedor where proveedor_id=s.proveedor_id;
    if v_actual is distinct from s.saldo_objetivo then raise exception 'El detalle no cuadra con el saldo objetivo; no se aplicó el ajuste'; end if;
    update public.proveedores_ajustes_solicitudes set estado='aplicado',decidido_por=auth.uid(),decidido_at=now() where id=p_id;
  end if;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(auth.uid()::text,case when p_aprobar then 'ajuste_proveedor_aprobado' else 'ajuste_proveedor_rechazado' end,
      'proveedores_ajustes_solicitudes',p_id::text,jsonb_build_object('proveedor_id',s.proveedor_id,
        'base',s.saldo_base,'objetivo',s.saldo_objetivo,'plan',s.plan,'preparado_por',s.preparado_por));
  return jsonb_build_object('id',p_id,'estado',case when p_aprobar then 'aplicado' else 'rechazado' end,'ya_decidido',false);
end $function$;

-- Documento financiero de total cero: NO incrementa compras ni inventario ni utilidad.
create function proveedores_control_private.registrar_excedente(
  p_proveedor uuid,p_monto numeric,p_fecha date,p_metodo text,p_referencia text,
  p_soporte text,p_motivo text,p_key uuid
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_factura uuid; v_pago jsonb;
begin
  if p_monto is null or not(p_monto>0 and p_monto<1000000000000000) or p_key is null
    then raise exception 'Excedente inválido'; end if;
  insert into public.facturas_proveedor(proveedor_id,numero,fecha,total,saldo,nota,soporte_path,origen_registro,registrado_por)
    values(p_proveedor,'ANT-'||p_key::text,p_fecha,0,0,
      'Anticipo/excedente a favor de Creditek: '||coalesce(p_motivo,''),p_soporte,'anticipo_proveedor',auth.uid())
    returning id into v_factura;
  v_pago:=public.registrar_pago_proveedor(v_factura,p_monto,p_fecha,p_metodo,p_referencia,
    p_soporte,'Anticipo/excedente: '||coalesce(p_motivo,''),p_key);
  if coalesce((v_pago->>'reutilizado')::boolean,false) then
    raise exception 'El excedente ya existe fuera de este movimiento'; end if;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(auth.uid()::text,'saldo_favor_proveedor_por_pago','facturas_proveedor',v_factura::text,
      jsonb_build_object('proveedor_id',p_proveedor,'monto',p_monto,'pago_id',v_pago->>'pago_id','referencia',p_referencia));
  return v_pago||jsonb_build_object('factura_id',v_factura);
end $$;
revoke all on function proveedores_control_private.registrar_excedente(uuid,numeric,date,text,text,text,text,uuid) from public,anon,authenticated;

create or replace function public.registrar_pago_proveedor(p_factura_id uuid,p_monto numeric,p_fecha date,p_metodo text default null,p_referencia text default null,p_soporte_path text default null,p_nota text default null,p_idempotency_key uuid default null)
returns jsonb language sql security invoker set search_path='' as $$
  select proveedores_control_private.registrar_pago_proveedor(p_factura_id,p_monto,p_fecha,p_metodo,p_referencia,p_soporte_path,p_nota,p_idempotency_key);
$$;
revoke all on function proveedores_control_private.registrar_pago_proveedor(uuid,numeric,date,text,text,text,text,uuid),public.registrar_pago_proveedor(uuid,numeric,date,text,text,text,text,uuid) from public,anon;
grant execute on function proveedores_control_private.registrar_pago_proveedor(uuid,numeric,date,text,text,text,text,uuid),public.registrar_pago_proveedor(uuid,numeric,date,text,text,text,text,uuid) to authenticated;

create or replace function public.banco_creditek_solicitar_pago_proveedor(p_id uuid,p_proveedor_id uuid,p_monto numeric,p_concepto text)
returns public.banco_creditek_pagos_proveedor language sql security invoker set search_path='' as $$
  select proveedores_control_private.banco_creditek_solicitar_pago_proveedor(p_id,p_proveedor_id,p_monto,p_concepto);
$$;
revoke all on function proveedores_control_private.banco_creditek_solicitar_pago_proveedor(uuid,uuid,numeric,text),public.banco_creditek_solicitar_pago_proveedor(uuid,uuid,numeric,text) from public,anon;
grant execute on function proveedores_control_private.banco_creditek_solicitar_pago_proveedor(uuid,uuid,numeric,text),public.banco_creditek_solicitar_pago_proveedor(uuid,uuid,numeric,text) to authenticated;

create or replace function public.banco_creditek_decidir_pago_proveedor(p_id uuid,p_aprobar boolean,p_motivo_rechazo text default null)
returns public.banco_creditek_pagos_proveedor language sql security invoker set search_path='' as $$
  select proveedores_control_private.banco_creditek_decidir_pago_proveedor(p_id,p_aprobar,p_motivo_rechazo);
$$;
revoke all on function proveedores_control_private.banco_creditek_decidir_pago_proveedor(uuid,boolean,text),public.banco_creditek_decidir_pago_proveedor(uuid,boolean,text) from public,anon;
grant execute on function proveedores_control_private.banco_creditek_decidir_pago_proveedor(uuid,boolean,text),public.banco_creditek_decidir_pago_proveedor(uuid,boolean,text) to authenticated;

create or replace function public.banco_creditek_registrar_giro_proveedor(p_id uuid,p_fecha_pago date,p_referencia_bancaria text,p_soporte_path text)
returns public.banco_creditek_pagos_proveedor language sql security invoker set search_path='' as $$
  select proveedores_control_private.banco_creditek_registrar_giro_proveedor(p_id,p_fecha_pago,p_referencia_bancaria,p_soporte_path);
$$;
revoke all on function proveedores_control_private.banco_creditek_registrar_giro_proveedor(uuid,date,text,text),public.banco_creditek_registrar_giro_proveedor(uuid,date,text,text) from public,anon;
grant execute on function proveedores_control_private.banco_creditek_registrar_giro_proveedor(uuid,date,text,text),public.banco_creditek_registrar_giro_proveedor(uuid,date,text,text) to authenticated;

-- Los demás canales conservan sus controles de autorización/cartera/fondos.
CREATE OR REPLACE FUNCTION proveedores_control_private.registrar_pago_proveedor_desde_saldo_b2b(p_id uuid, p_factura_id uuid, p_monto numeric, p_fecha date, p_metodo text, p_referencia text, p_soporte_path text, p_nota text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_factura public.facturas_proveedor%rowtype; v_pago jsonb; v_balance jsonb;
  v_mov uuid; v_previo public.treasury_movements%rowtype; v_nombre text;
begin
  if auth.uid() is null or not exists(select 1 from public.perfiles p where p.id=auth.uid()
    and p.activo and p.rol in ('gerencia','auditoria')) then raise exception 'No autorizado'; end if;
  if p_id is null or p_factura_id is null or p_fecha is null or p_monto is null
    or p_monto<=0 or p_monto<>trunc(p_monto)
    or nullif(btrim(coalesce(p_referencia,'')),'') is null
    or nullif(btrim(coalesce(p_soporte_path,'')),'') is null then
    raise exception 'Factura, pesos enteros, referencia y soporte son obligatorios'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  select * into v_previo from public.treasury_movements where idempotency_key='b2b-supplier-payment:'||p_id;
  if found then
    if v_previo.supplier_invoice_id is distinct from p_factura_id or v_previo.amount is distinct from p_monto then
      raise exception 'El identificador ya corresponde a otro pago'; end if;
    return jsonb_build_object('ok',true,'reutilizado',true,'movimiento_tesoreria_id',v_previo.id);
  end if;
  if exists(select 1 from public.pagos_proveedor where idempotency_key=p_id) then
    raise exception 'El identificador ya fue usado por un pago de proveedor sin esta salida B2B'; end if;
  perform 1 from public.proveedores where id=(select proveedor_id from public.facturas_proveedor where id=p_factura_id) and activo for update;
  if not found then raise exception 'Proveedor no activo o factura no encontrada'; end if;
  select * into v_factura from public.facturas_proveedor where id=p_factura_id for update;
  if not found then raise exception 'Factura de proveedor no encontrada'; end if;
  -- Puede dejar saldo a favor; se mantiene el control de fondos B2B.
  select nombre into v_nombre from public.proveedores where id=v_factura.proveedor_id;
  -- El pago a proveedor y el débito de Tesorería revierten juntos si falla cualquiera.
  v_balance:=public.tesoreria_aplicar_saldo('b2b','debit',p_monto,'b2b-supplier-payment:'||p_id);
  v_pago:=public.registrar_pago_proveedor(p_factura_id,p_monto,p_fecha,
    coalesce(nullif(btrim(p_metodo),''),'transferencia'),btrim(p_referencia),
    p_soporte_path,p_nota,p_id);
  if coalesce((v_pago->>'reutilizado')::boolean,false) then
    raise exception 'El pago ya existía sin esta salida B2B'; end if;
  insert into public.treasury_movements(unit,direction,type,beneficiary,concept,amount,
    destination_account,movement_date,support_path,supplier_id,supplier_invoice_id,
    balance_before,balance_after,status,requested_by,authorized_by,paid_by,idempotency_key)
  values('b2b','debit','pago_proveedor',coalesce(v_nombre,'Proveedor'),
    'Pago factura · '||btrim(p_referencia),p_monto,'Proveedor · '||btrim(p_referencia),
    p_fecha,p_soporte_path,v_factura.proveedor_id,p_factura_id,
    (v_balance->>'before')::numeric,(v_balance->>'after')::numeric,
    'pagado',auth.uid(),auth.uid(),auth.uid(),'b2b-supplier-payment:'||p_id)
  returning id into v_mov;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(auth.uid()::text,'pago_proveedor_saldo_b2b','treasury_movements',v_mov::text,
      jsonb_build_object('factura_id',p_factura_id,'monto',p_monto,
        'pago_id',v_pago->>'pago_id','saldo_antes',v_balance->>'before','saldo_despues',v_balance->>'after'));
  return jsonb_build_object('ok',true,'reutilizado',false,'movimiento_tesoreria_id',v_mov,
    'pago_id',v_pago->>'pago_id','saldo_b2b',v_balance->>'after');
end $function$;

CREATE OR REPLACE FUNCTION proveedores_control_private.registrar_abono_cliente_b2b_destino(p_id uuid, p_cliente_codigo text, p_fecha date, p_monto numeric, p_destino text, p_proveedor_id uuid, p_referencia_bancaria text, p_soporte_path text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.abonos_clientes_b2b_destino%rowtype;
  v_cuenta uuid; v_cliente text; v_saldo numeric; v_mov uuid; v_tes uuid;
  v_balance jsonb; v_factura public.facturas_proveedor%rowtype;
  v_restante numeric; v_aplicar numeric; v_pago jsonb; v_orden integer:=0;
begin
  if auth.uid() is null or not exists(select 1 from public.perfiles p
    where p.id=auth.uid() and p.activo and p.rol in ('gerencia','auditoria')) then
    raise exception 'Solo Gestión o Gerencia puede registrar abonos B2B'; end if;
  if p_id is null or p_fecha is null or p_monto is null or p_monto<=0 or p_monto<>trunc(p_monto)
    or p_destino not in ('creditek','proveedor')
    or (p_destino='proveedor' and p_proveedor_id is null)
    or (p_destino='creditek' and p_proveedor_id is not null)
    or length(btrim(coalesce(p_referencia_bancaria,'')))<3
    or nullif(btrim(coalesce(p_soporte_path,'')),'') is null then
    raise exception 'Completa destino, fecha, pesos enteros, referencia y soporte'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  select * into v from public.abonos_clientes_b2b_destino where id=p_id;
  if found then
    if (v.cliente_codigo,v.fecha,v.monto,v.destino,v.proveedor_id,v.referencia_bancaria,v.soporte_path)
       is distinct from (p_cliente_codigo,p_fecha,p_monto,p_destino,p_proveedor_id,btrim(p_referencia_bancaria),p_soporte_path)
      then raise exception 'El identificador ya corresponde a otro abono'; end if;
    return jsonb_build_object('ok',true,'reutilizado',true,'id',v.id);
  end if;
  select c.id,o.nombre into v_cuenta,v_cliente from public.cuentas_cartera c
    join public.origenes o on o.codigo=c.tienda_codigo
    where c.tienda_codigo=p_cliente_codigo and c.tipo_cuenta='cliente_b2b'
      and c.activo and o.tipo='cliente_b2b' and o.activo for update of c;
  if v_cuenta is null then raise exception 'Cliente B2B sin cartera activa'; end if;
  -- Mismo orden de bloqueo para todas las aplicaciones; no se permite sobregirar cartera.
  lock table public.movimientos_cartera in share row exclusive mode;
  select coalesce(sum(case when efecto='debito' then monto else -monto end),0)
    into v_saldo from public.movimientos_cartera where cuenta_id=v_cuenta;
  if p_monto>v_saldo then raise exception 'El abono supera la deuda actual del cliente (%)',v_saldo; end if;
  if p_destino='proveedor' then
    perform 1 from public.proveedores where id=p_proveedor_id and activo for update;
    if not found then raise exception 'Proveedor no activo'; end if;
    select coalesce(sum(saldo),0) into v_saldo from public.facturas_proveedor
      where proveedor_id=p_proveedor_id and saldo>0;
    -- El cliente puede consignar más que la deuda del proveedor; el sobrante es anticipo.
  end if;
  insert into public.movimientos_cartera(cuenta_id,tienda_codigo,efecto,monto,concepto,
    referencia_tipo,referencia_id,fecha_efectiva,metadatos,creado_por)
  values(v_cuenta,p_cliente_codigo,'credito',p_monto,
    case when p_destino='proveedor' then 'Consignación directa a proveedor' else 'Abono recibido por Creditek' end,
    'abono_cliente_b2b_destino',p_id::text,p_fecha,
    jsonb_build_object('destino',p_destino,'proveedor_id',p_proveedor_id,
      'referencia_bancaria',btrim(p_referencia_bancaria),'soporte_path',p_soporte_path),auth.uid())
  returning id into v_mov;
  if p_destino='creditek' then
    v_balance:=public.tesoreria_aplicar_saldo('b2b','credit',p_monto,'b2b-client-receipt:'||p_id);
    insert into public.treasury_movements(unit,direction,type,beneficiary,concept,amount,
      destination_account,movement_date,support_path,balance_before,balance_after,status,
      requested_by,authorized_by,paid_by,idempotency_key)
    values('b2b','credit','abono_cliente_b2b',v_cliente,
      'Abono cliente B2B · '||btrim(p_referencia_bancaria),p_monto,'Creditek B2B',
      p_fecha,p_soporte_path,(v_balance->>'before')::numeric,(v_balance->>'after')::numeric,
      'pagado',auth.uid(),auth.uid(),auth.uid(),'b2b-client-receipt:'||p_id)
    returning id into v_tes;
  end if;
  insert into public.abonos_clientes_b2b_destino(id,cliente_codigo,fecha,monto,destino,
    proveedor_id,referencia_bancaria,soporte_path,movimiento_cartera_id,movimiento_tesoreria_id,registrado_por)
  values(p_id,p_cliente_codigo,p_fecha,p_monto,p_destino,p_proveedor_id,btrim(p_referencia_bancaria),
    p_soporte_path,v_mov,v_tes,auth.uid());
  if p_destino='proveedor' then
    v_restante:=p_monto;
    for v_factura in select * from public.facturas_proveedor
      where proveedor_id=p_proveedor_id and saldo>0 order by fecha,created_at,id for update loop
      exit when v_restante<=0;
      v_aplicar:=least(v_restante,v_factura.saldo);
      v_pago:=public.registrar_pago_proveedor(v_factura.id,v_aplicar,p_fecha,
        'consignacion_cliente_b2b',btrim(p_referencia_bancaria),p_soporte_path,
        'Abono de cliente '||p_cliente_codigo||' · '||p_id,
        md5(p_id::text||':factura:'||v_factura.id::text)::uuid);
      if coalesce((v_pago->>'reutilizado')::boolean,false) then
        raise exception 'La aplicación del comprobante ya existe fuera de este abono'; end if;
      v_orden:=v_orden+1;
      insert into public.aplicaciones_abono_cliente_b2b_proveedor(abono_id,factura_id,pago_id,monto,orden)
      values(p_id,v_factura.id,(v_pago->>'pago_id')::uuid,v_aplicar,v_orden);
      v_restante:=v_restante-v_aplicar;
    end loop;
    if v_restante>0 then
      v_pago:=proveedores_control_private.registrar_excedente(
        p_proveedor_id,v_restante,p_fecha,'consignacion_cliente_b2b',btrim(p_referencia_bancaria),
        p_soporte_path,'Abono de cliente '||p_cliente_codigo||' · '||p_id,
        md5(p_id::text||':excedente')::uuid);
      v_orden:=v_orden+1;
      insert into public.aplicaciones_abono_cliente_b2b_proveedor(abono_id,factura_id,pago_id,monto,orden)
        values(p_id,(v_pago->>'factura_id')::uuid,(v_pago->>'pago_id')::uuid,v_restante,v_orden);
    end if;
  end if;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(auth.uid()::text,'abono_cliente_b2b_destino','abonos_clientes_b2b_destino',p_id::text,
      jsonb_build_object('cliente',p_cliente_codigo,'destino',p_destino,'monto',p_monto,
        'proveedor_id',p_proveedor_id,'movimiento_cartera',v_mov,'movimiento_tesoreria',v_tes,
        'facturas_aplicadas',v_orden));
  return jsonb_build_object('ok',true,'reutilizado',false,'id',p_id,
    'movimiento_cartera_id',v_mov,'movimiento_tesoreria_id',v_tes,'facturas_aplicadas',v_orden);
end $function$;

CREATE OR REPLACE FUNCTION proveedores_control_private.decidir_instruccion_consignacion(p_instruccion_id uuid, p_decision text, p_motivo text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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
    perform 1 from public.proveedores where id=v_instruccion.proveedor_id and activo for update;
    if not found then raise exception 'Proveedor no activo'; end if;
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
      v_pago:=proveedores_control_private.registrar_excedente(
        v_instruccion.proveedor_id,v_restante,v_instruccion.fecha,'consignacion_tienda',
        v_instruccion.id::text,v_comprobante.soporte_path,'Consignación de tienda '||v_instruccion.tienda_codigo,
        md5(p_request_id::text||':excedente')::uuid);
      v_orden:=v_orden+1;
      insert into public.aplicaciones_consignacion_proveedor(instruccion_id,factura_id,pago_id,monto_aplicado,orden_fifo)
        values(v_instruccion.id,(v_pago->>'factura_id')::uuid,(v_pago->>'pago_id')::uuid,v_restante,v_orden);
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
$function$;

create or replace function public.registrar_pago_proveedor_desde_saldo_b2b(p_id uuid,p_factura_id uuid,p_monto numeric,p_fecha date,p_metodo text,p_referencia text,p_soporte_path text,p_nota text)
returns jsonb language sql security invoker set search_path='' as $$
  select proveedores_control_private.registrar_pago_proveedor_desde_saldo_b2b(p_id,p_factura_id,p_monto,p_fecha,p_metodo,p_referencia,p_soporte_path,p_nota);
$$;
revoke all on function proveedores_control_private.registrar_pago_proveedor_desde_saldo_b2b(uuid,uuid,numeric,date,text,text,text,text),public.registrar_pago_proveedor_desde_saldo_b2b(uuid,uuid,numeric,date,text,text,text,text) from public,anon;
grant execute on function proveedores_control_private.registrar_pago_proveedor_desde_saldo_b2b(uuid,uuid,numeric,date,text,text,text,text),public.registrar_pago_proveedor_desde_saldo_b2b(uuid,uuid,numeric,date,text,text,text,text) to authenticated;

create or replace function public.registrar_abono_cliente_b2b_destino(p_id uuid,p_cliente_codigo text,p_fecha date,p_monto numeric,p_destino text,p_proveedor_id uuid,p_referencia_bancaria text,p_soporte_path text)
returns jsonb language sql security invoker set search_path='' as $$
  select proveedores_control_private.registrar_abono_cliente_b2b_destino(p_id,p_cliente_codigo,p_fecha,p_monto,p_destino,p_proveedor_id,p_referencia_bancaria,p_soporte_path);
$$;
revoke all on function proveedores_control_private.registrar_abono_cliente_b2b_destino(uuid,text,date,numeric,text,uuid,text,text),public.registrar_abono_cliente_b2b_destino(uuid,text,date,numeric,text,uuid,text,text) from public,anon;
grant execute on function proveedores_control_private.registrar_abono_cliente_b2b_destino(uuid,text,date,numeric,text,uuid,text,text),public.registrar_abono_cliente_b2b_destino(uuid,text,date,numeric,text,uuid,text,text) to authenticated;

create or replace function public.decidir_instruccion_consignacion(p_instruccion_id uuid,p_decision text,p_motivo text,p_request_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select proveedores_control_private.decidir_instruccion_consignacion(p_instruccion_id,p_decision,p_motivo,p_request_id);
$$;
revoke all on function proveedores_control_private.decidir_instruccion_consignacion(uuid,text,text,uuid),public.decidir_instruccion_consignacion(uuid,text,text,uuid) from public,anon;
grant execute on function proveedores_control_private.decidir_instruccion_consignacion(uuid,text,text,uuid),public.decidir_instruccion_consignacion(uuid,text,text,uuid) to authenticated;

commit;
