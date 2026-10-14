-- Un abono externo baja cartera y acredita Banco en la misma transacción.
-- No reaplicar abonos históricos: pueden formar parte del saldo inicial.
begin;

alter table public.banco_creditek_movimientos
  drop constraint banco_creditek_movimientos_tipo_check,
  drop constraint banco_creditek_movimientos_check,
  add constraint banco_creditek_movimientos_tipo_check check
    (tipo in ('saldo_inicial','pago_proveedor','ingreso_plataforma','pago_aliado',
      'pago_ejecutivo','gasto','reverso_ingreso_plataforma','ingreso_cliente_b2b')),
  add constraint banco_creditek_movimientos_check check (
    (tipo='saldo_inicial' and solicitud_id is null and saldo_despues=saldo_antes+monto)
    or (tipo='pago_proveedor' and solicitud_id is not null and saldo_despues=saldo_antes-monto)
    or (tipo='ingreso_plataforma' and solicitud_id is null and fuente_tabla='cobros_deposits'
      and fuente_id is not null and saldo_despues=saldo_antes+monto)
    or (tipo in ('pago_aliado','pago_ejecutivo','gasto') and solicitud_id is null
      and fuente_id is not null and saldo_despues=saldo_antes-monto)
    or (tipo='reverso_ingreso_plataforma' and solicitud_id is null
      and fuente_tabla='banco_creditek_movimientos' and fuente_id is not null
      and saldo_despues=saldo_antes-monto)
    or (tipo='ingreso_cliente_b2b' and solicitud_id is null
      and fuente_tabla='abonos_clientes_b2b_destino' and fuente_id is not null
      and saldo_despues=saldo_antes+monto));

-- Privada: la RPC existente conserva sus permisos e idempotencia. El trigger
-- se vincula al abono externo, no a créditos internos genéricos de Tesorería.
create function kora_private.banco_creditek_abono_b2b_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
declare c public.banco_creditek_cuentas%rowtype; v_corte date;
begin
  if new.destino<>'creditek' then return new; end if;
  if auth.uid() is null or new.registrado_por is distinct from auth.uid() then
    raise exception 'El ingreso bancario requiere el responsable del abono autorizado';
  end if;
  if not exists(select 1 from public.treasury_movements t
    where t.id=new.movimiento_tesoreria_id and t.unit='b2b'
      and t.type='abono_cliente_b2b' and t.direction='credit' and t.status='pagado'
      and t.amount=new.monto and t.movement_date=new.fecha
      and t.support_path=new.soporte_path and t.paid_by=new.registrado_por
      and t.idempotency_key='b2b-client-receipt:'||new.id::text) then
    raise exception 'El abono no coincide con su ingreso autorizado de Tesorería';
  end if;
  -- Mismo candado que los demás ingresos/egresos; evita perder movimientos.
  select * into c from public.banco_creditek_cuentas
    where numero_cuenta='87600004006' and activa for update;
  if not found or c.saldo_actual is null then
    raise exception 'Primero registra el saldo inicial de Banco Creditek; no se aplicó el abono';
  end if;
  v_corte:=coalesce((c.fecha_corte_at at time zone 'America/Bogota')::date,c.fecha_corte);
  if v_corte is null then
    raise exception 'Banco Creditek no tiene fecha de corte; concilia antes de registrar el abono';
  end if;
  -- El formulario solo conoce el día, no la hora del ingreso. No inferir si
  -- un abono del mismo día del corte ya estaba incluido en la apertura.
  if new.fecha<=v_corte then
    raise exception 'La fecha del abono debe ser posterior al corte de Banco (%). Concilia este abono para no duplicar el saldo inicial',v_corte;
  end if;
  if new.fecha>(now() at time zone 'America/Bogota')::date then
    raise exception 'La fecha del abono no puede ser futura; confirma el ingreso real';
  end if;
  -- La fuente única existente y el ID de la RPC protegen los reintentos.
  insert into public.banco_creditek_movimientos
    (cuenta_id,tipo,monto,saldo_antes,saldo_despues,fecha,referencia,soporte_path,
     registrado_por,fuente_tabla,fuente_id,ocurrido_at)
  values(c.id,'ingreso_cliente_b2b',new.monto,c.saldo_actual,c.saldo_actual+new.monto,
    new.fecha,'Abono cliente B2B · '||new.cliente_codigo||' · '||new.referencia_bancaria,
    new.soporte_path,new.registrado_por,'abonos_clientes_b2b_destino',new.id,
    new.fecha::timestamp at time zone 'America/Bogota');
  update public.banco_creditek_cuentas set saldo_actual=c.saldo_actual+new.monto where id=c.id;
  return new;
end $$;
revoke all on function kora_private.banco_creditek_abono_b2b_trigger() from public,anon,authenticated;

create trigger banco_creditek_abono_b2b_real
  after insert on public.abonos_clientes_b2b_destino
  for each row when (new.destino='creditek')
  execute function kora_private.banco_creditek_abono_b2b_trigger();

-- La fila de Tesorería conserva trazabilidad, sin incrementar treasury_unit_balances.
CREATE OR REPLACE FUNCTION proveedores_control_private.registrar_abono_cliente_b2b_destino(p_id uuid, p_cliente_codigo text, p_fecha date, p_monto numeric, p_destino text, p_proveedor_id uuid, p_referencia_bancaria text, p_soporte_path text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.abonos_clientes_b2b_destino%rowtype;
  v_cuenta uuid; v_cliente text; v_saldo numeric; v_mov uuid; v_tes uuid;
  v_banco public.banco_creditek_cuentas%rowtype; v_factura public.facturas_proveedor%rowtype;
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
    -- B2B identifica el origen del recaudo; el dinero pertenece a Banco único.
    select * into v_banco from public.banco_creditek_cuentas
      where numero_cuenta='87600004006' and activa for update;
    if not found or v_banco.saldo_actual is null then
      raise exception 'Primero registra el saldo inicial de Banco Creditek; no se aplicó el abono';
    end if;
    insert into public.treasury_movements(unit,direction,type,beneficiary,concept,amount,
      destination_account,movement_date,support_path,balance_before,balance_after,status,
      requested_by,authorized_by,paid_by,idempotency_key)
    values('b2b','credit','abono_cliente_b2b',v_cliente,
      'Abono cliente B2B · '||btrim(p_referencia_bancaria),p_monto,'Banco Creditek',
      p_fecha,p_soporte_path,v_banco.saldo_actual,v_banco.saldo_actual+p_monto,
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

commit;
