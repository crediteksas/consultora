-- Un abono de cliente B2B tiene exactamente un destino: Creditek o proveedor.
-- La consignación directa a proveedor no toca Tesorería B2B.
begin;

create table public.abonos_clientes_b2b_destino (
  id uuid primary key,
  cliente_codigo text not null references public.origenes(codigo),
  fecha date not null,
  monto numeric(18,2) not null check (monto > 0 and monto = trunc(monto)),
  destino text not null check (destino in ('creditek','proveedor')),
  proveedor_id uuid references public.proveedores(id),
  referencia_bancaria text not null check (length(btrim(referencia_bancaria)) >= 3),
  soporte_path text not null check (length(btrim(soporte_path)) > 0),
  movimiento_cartera_id uuid not null unique references public.movimientos_cartera(id),
  movimiento_tesoreria_id uuid unique references public.treasury_movements(id),
  registrado_por uuid not null references public.perfiles(id),
  created_at timestamptz not null default now(),
  check ((destino = 'creditek' and proveedor_id is null and movimiento_tesoreria_id is not null)
      or (destino = 'proveedor' and proveedor_id is not null and movimiento_tesoreria_id is null))
);
create table public.aplicaciones_abono_cliente_b2b_proveedor (
  abono_id uuid not null references public.abonos_clientes_b2b_destino(id),
  factura_id uuid not null references public.facturas_proveedor(id),
  pago_id uuid not null unique references public.pagos_proveedor(id),
  monto numeric(18,2) not null check (monto > 0),
  orden integer not null check (orden > 0),
  primary key (abono_id,factura_id)
);
alter table public.abonos_clientes_b2b_destino enable row level security;
alter table public.aplicaciones_abono_cliente_b2b_proveedor enable row level security;
revoke all on public.abonos_clientes_b2b_destino, public.aplicaciones_abono_cliente_b2b_proveedor from public,anon,authenticated;
grant select on public.abonos_clientes_b2b_destino, public.aplicaciones_abono_cliente_b2b_proveedor to authenticated;
create policy abonos_b2b_control_lectura on public.abonos_clientes_b2b_destino
  for select to authenticated using (exists(select 1 from public.perfiles p
    where p.id=auth.uid() and p.activo and p.rol in ('gerencia','auditoria')));
create policy aplicaciones_b2b_control_lectura on public.aplicaciones_abono_cliente_b2b_proveedor
  for select to authenticated using (exists(select 1 from public.perfiles p
    where p.id=auth.uid() and p.activo and p.rol in ('gerencia','auditoria')));

alter table public.treasury_movements drop constraint if exists treasury_movements_type_check;
alter table public.treasury_movements add constraint treasury_movements_type_check check(type in(
  'compensacion_retail','comision_retail','comision_aliado','pago_ejecutivo','pago_proveedor',
  'otra_obligacion_b2b','gasto_administrativo','gasto_financiero','impuesto','retiro_socios',
  'otro_movimiento_autorizado','ajuste','reverso','abono_cliente_b2b'));

create function public.registrar_abono_cliente_b2b_destino(
  p_id uuid,p_cliente_codigo text,p_fecha date,p_monto numeric,p_destino text,
  p_proveedor_id uuid,p_referencia_bancaria text,p_soporte_path text
) returns jsonb language plpgsql security definer set search_path='' as $$
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
    if not exists(select 1 from public.proveedores where id=p_proveedor_id) then
      raise exception 'Proveedor no encontrado'; end if;
    select coalesce(sum(saldo),0) into v_saldo from public.facturas_proveedor
      where proveedor_id=p_proveedor_id and saldo>0;
    if p_monto>v_saldo then raise exception 'Las facturas del proveedor solo cubren %',v_saldo; end if;
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
    if v_restante<>0 then raise exception 'No se pudo aplicar el total al proveedor'; end if;
  end if;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(auth.uid()::text,'abono_cliente_b2b_destino','abonos_clientes_b2b_destino',p_id::text,
      jsonb_build_object('cliente',p_cliente_codigo,'destino',p_destino,'monto',p_monto,
        'proveedor_id',p_proveedor_id,'movimiento_cartera',v_mov,'movimiento_tesoreria',v_tes,
        'facturas_aplicadas',v_orden));
  return jsonb_build_object('ok',true,'reutilizado',false,'id',p_id,
    'movimiento_cartera_id',v_mov,'movimiento_tesoreria_id',v_tes,'facturas_aplicadas',v_orden);
end $$;
revoke all on function public.registrar_abono_cliente_b2b_destino(uuid,text,date,numeric,text,uuid,text,text) from public,anon;
grant execute on function public.registrar_abono_cliente_b2b_destino(uuid,text,date,numeric,text,uuid,text,text) to authenticated;

-- Pago con disponibilidad B2B ya existente: una sola transacción descuenta
-- Tesorería y la factura. No usar para consignaciones directas de clientes.
create function public.registrar_pago_proveedor_desde_saldo_b2b(
  p_id uuid,p_factura_id uuid,p_monto numeric,p_fecha date,p_metodo text,
  p_referencia text,p_soporte_path text,p_nota text
) returns jsonb language plpgsql security definer set search_path='' as $$
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
  select * into v_factura from public.facturas_proveedor where id=p_factura_id for update;
  if not found then raise exception 'Factura de proveedor no encontrada'; end if;
  if p_monto>v_factura.saldo then raise exception 'El pago supera el saldo de la factura'; end if;
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
end $$;
revoke all on function public.registrar_pago_proveedor_desde_saldo_b2b(uuid,uuid,numeric,date,text,text,text,text) from public,anon;
grant execute on function public.registrar_pago_proveedor_desde_saldo_b2b(uuid,uuid,numeric,date,text,text,text,text) to authenticated;

-- La ruta antigua de abonos no puede omitir el destino y dejar la otra mitad sin registrar.
create or replace function public.registrar_movimiento_cliente_b2b(
  p_cliente_codigo text,p_fecha date,p_efecto text,p_monto numeric,p_concepto text,
  p_soporte_path text,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_cuenta uuid; v_id uuid;
begin
  if auth.uid() is null or not exists(select 1 from public.perfiles p where p.id=auth.uid()
    and p.activo and p.rol in ('gerencia','auditoria')) then raise exception 'No autorizado'; end if;
  if p_efecto='credito' then raise exception 'Para abonar selecciona el destino del dinero en Cartera B2B'; end if;
  if p_efecto is distinct from 'debito' or p_request_id is null or p_fecha is null
    or p_monto is null or p_monto<=0 or p_monto<>trunc(p_monto)
    or nullif(btrim(coalesce(p_concepto,'')),'') is null
    or nullif(btrim(coalesce(p_soporte_path,'')),'') is null then raise exception 'Movimiento inválido'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  select id into v_id from public.movimientos_cartera where referencia_tipo='movimiento_cliente_b2b'
    and referencia_id=p_request_id::text;
  if found then return jsonb_build_object('ok',true,'reutilizado',true,'movimiento_id',v_id); end if;
  select c.id into v_cuenta from public.cuentas_cartera c join public.origenes o on o.codigo=c.tienda_codigo
    where o.codigo=p_cliente_codigo and o.tipo='cliente_b2b' and o.activo
      and c.tipo_cuenta='cliente_b2b' and c.activo;
  if v_cuenta is null then raise exception 'Cliente B2B sin libro activo'; end if;
  insert into public.movimientos_cartera(cuenta_id,tienda_codigo,efecto,monto,concepto,
    referencia_tipo,referencia_id,fecha_efectiva,metadatos,creado_por)
  values(v_cuenta,p_cliente_codigo,'debito',p_monto,btrim(p_concepto),
    'movimiento_cliente_b2b',p_request_id::text,p_fecha,
    jsonb_build_object('soporte_path',p_soporte_path,'unidad_negocio','b2b'),auth.uid())
  returning id into v_id;
  return jsonb_build_object('ok',true,'movimiento_id',v_id,'cuenta_id',v_cuenta);
end $$;
revoke all on function public.registrar_movimiento_cliente_b2b(text,date,text,numeric,text,text,uuid) from public,anon;
grant execute on function public.registrar_movimiento_cliente_b2b(text,date,text,numeric,text,text,uuid) to authenticated;
commit;
