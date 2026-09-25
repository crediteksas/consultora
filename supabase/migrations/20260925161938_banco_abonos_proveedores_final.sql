-- Banco Creditek y solicitudes de pago a proveedores: solicitud -> autorización
-- -> giro comprobado -> aplicación FIFO. El saldo queda sin inicializar hasta
-- que Gerencia proporcione el saldo real y su fecha de corte.
begin;

create table public.banco_creditek_cuentas (
  id uuid primary key default gen_random_uuid(),
  titular text not null,
  numero_cuenta text not null unique,
  banco text,
  tipo_cuenta text check (tipo_cuenta in ('corriente','ahorros')),
  saldo_inicial numeric(18,2),
  fecha_corte date,
  saldo_actual numeric(18,2),
  sincronizado_por uuid references public.perfiles(id),
  sincronizado_at timestamptz,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  check (numero_cuenta ~ '^[0-9]{8,20}$'),
  check ((saldo_inicial is null and fecha_corte is null and saldo_actual is null
          and sincronizado_por is null and sincronizado_at is null)
      or (saldo_inicial is not null and fecha_corte is not null and saldo_actual is not null
          and sincronizado_por is not null and sincronizado_at is not null
          and banco is not null and tipo_cuenta is not null)),
  check (saldo_inicial is null or (saldo_inicial >= 0 and saldo_inicial = trunc(saldo_inicial))),
  check (saldo_actual is null or (saldo_actual >= 0 and saldo_actual = trunc(saldo_actual)))
);

-- La identidad bancaria ya existe en el catálogo privado de recaudo.
insert into public.banco_creditek_cuentas (titular, numero_cuenta, banco, tipo_cuenta)
select titular, numero_cuenta, banco, lower(tipo_cuenta)
from kora_private.cuenta_recaudo_creditek
where id=true and activa and numero_cuenta='87600004006'
  and nullif(btrim(coalesce(banco,'')),'') is not null
  and lower(tipo_cuenta) in ('corriente','ahorros')
on conflict (numero_cuenta) do nothing;
do $$ begin
  if not exists(select 1 from public.banco_creditek_cuentas where numero_cuenta='87600004006') then
    raise exception 'La cuenta Creditek 4006 no está identificada en el catálogo privado';
  end if;
end $$;

create table public.banco_creditek_pagos_proveedor (
  id uuid primary key,
  cuenta_id uuid not null references public.banco_creditek_cuentas(id),
  proveedor_id uuid not null references public.proveedores(id),
  monto numeric(18,2) not null check (monto > 0 and monto = trunc(monto)),
  concepto text not null check (length(btrim(concepto)) >= 8),
  estado text not null default 'pendiente' check (estado in ('pendiente','autorizado','rechazado','pagado')),
  solicitado_por uuid not null references public.perfiles(id),
  solicitado_at timestamptz not null default now(),
  autorizado_por uuid references public.perfiles(id),
  autorizado_at timestamptz,
  motivo_rechazo text,
  pagado_por uuid references public.perfiles(id),
  pagado_at timestamptz,
  fecha_pago date,
  referencia_bancaria text,
  soporte_path text,
  saldo_banco_antes numeric(18,2),
  saldo_banco_despues numeric(18,2),
  check (estado <> 'pagado' or
    (autorizado_por is not null and pagado_por is not null and pagado_at is not null
     and fecha_pago is not null and referencia_bancaria is not null and soporte_path is not null
     and saldo_banco_antes is not null and saldo_banco_despues is not null))
);
create index banco_pagos_proveedor_estado_idx on public.banco_creditek_pagos_proveedor(estado, solicitado_at desc);

create table public.banco_creditek_aplicaciones_proveedor (
  solicitud_id uuid not null references public.banco_creditek_pagos_proveedor(id),
  factura_id uuid not null references public.facturas_proveedor(id),
  pago_id uuid not null unique references public.pagos_proveedor(id),
  monto numeric(18,2) not null check (monto > 0 and monto = trunc(monto)),
  orden integer not null check (orden > 0),
  primary key (solicitud_id, factura_id),
  unique (solicitud_id, orden)
);

create table public.banco_creditek_movimientos (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.banco_creditek_cuentas(id),
  solicitud_id uuid unique references public.banco_creditek_pagos_proveedor(id),
  tipo text not null check (tipo in ('saldo_inicial','pago_proveedor')),
  monto numeric(18,2) not null check (monto >= 0 and monto = trunc(monto)),
  saldo_antes numeric(18,2) not null,
  saldo_despues numeric(18,2) not null,
  fecha date not null,
  referencia text not null,
  soporte_path text,
  registrado_por uuid not null references public.perfiles(id),
  created_at timestamptz not null default now(),
  check ((tipo='saldo_inicial' and solicitud_id is null and saldo_despues=saldo_antes+monto)
      or (tipo='pago_proveedor' and solicitud_id is not null and saldo_despues=saldo_antes-monto))
);
create unique index banco_creditek_apertura_unica on public.banco_creditek_movimientos(cuenta_id)
  where tipo='saldo_inicial';

alter table public.banco_creditek_cuentas enable row level security;
alter table public.banco_creditek_pagos_proveedor enable row level security;
alter table public.banco_creditek_aplicaciones_proveedor enable row level security;
alter table public.banco_creditek_movimientos enable row level security;
revoke all on public.banco_creditek_cuentas, public.banco_creditek_pagos_proveedor,
  public.banco_creditek_aplicaciones_proveedor, public.banco_creditek_movimientos
  from public, anon, authenticated;
grant select on public.banco_creditek_cuentas, public.banco_creditek_pagos_proveedor,
  public.banco_creditek_aplicaciones_proveedor, public.banco_creditek_movimientos to authenticated;

create policy banco_cuentas_control_lectura on public.banco_creditek_cuentas
  for select to authenticated using (exists(select 1 from public.perfiles p
    where p.id=auth.uid() and p.activo and
      ((p.id='d1782db6-bacc-4caf-af6f-ce1b8d1c0391'::uuid and p.rol='auditoria')
       or (p.id='6de0ad26-64af-4966-8cd9-d468880af627'::uuid and p.rol='gerencia'))));
create policy banco_pagos_control_lectura on public.banco_creditek_pagos_proveedor
  for select to authenticated using (exists(select 1 from public.perfiles p
    where p.id=auth.uid() and p.activo and
      ((p.id='d1782db6-bacc-4caf-af6f-ce1b8d1c0391'::uuid and p.rol='auditoria')
       or (p.id='6de0ad26-64af-4966-8cd9-d468880af627'::uuid and p.rol='gerencia'))));
create policy banco_aplicaciones_control_lectura on public.banco_creditek_aplicaciones_proveedor
  for select to authenticated using (exists(select 1 from public.perfiles p
    where p.id=auth.uid() and p.activo and
      ((p.id='d1782db6-bacc-4caf-af6f-ce1b8d1c0391'::uuid and p.rol='auditoria')
       or (p.id='6de0ad26-64af-4966-8cd9-d468880af627'::uuid and p.rol='gerencia'))));
create policy banco_movimientos_control_lectura on public.banco_creditek_movimientos
  for select to authenticated using (exists(select 1 from public.perfiles p
    where p.id=auth.uid() and p.activo and
      ((p.id='d1782db6-bacc-4caf-af6f-ce1b8d1c0391'::uuid and p.rol='auditoria')
       or (p.id='6de0ad26-64af-4966-8cd9-d468880af627'::uuid and p.rol='gerencia'))));

create function public.banco_creditek_solicitar_pago_proveedor(
  p_id uuid, p_proveedor_id uuid, p_monto numeric, p_concepto text
) returns public.banco_creditek_pagos_proveedor
language plpgsql security definer set search_path='' as $$
declare v public.banco_creditek_pagos_proveedor%rowtype;
  v_cuenta uuid; v_deuda numeric;
begin
  if auth.uid() is distinct from 'd1782db6-bacc-4caf-af6f-ce1b8d1c0391'::uuid
    or not exists(select 1 from public.perfiles p where p.id=auth.uid() and p.activo and p.rol='auditoria')
    then raise exception 'Solo Maite puede solicitar pagos a proveedores'; end if;
  if p_id is null or p_proveedor_id is null or p_monto is null or p_monto<=0
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
  if p_monto>v_deuda then raise exception 'El valor supera la deuda documentada del proveedor (%)',v_deuda; end if;
  insert into public.banco_creditek_pagos_proveedor(id,cuenta_id,proveedor_id,monto,concepto,solicitado_por)
    values(p_id,v_cuenta,p_proveedor_id,p_monto,btrim(p_concepto),auth.uid()) returning * into v;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(auth.uid()::text,'banco_pago_proveedor_solicitado','banco_creditek_pagos_proveedor',v.id::text,
      jsonb_build_object('proveedor_id',v.proveedor_id,'monto',v.monto));
  return v;
end $$;

create function public.banco_creditek_decidir_pago_proveedor(
  p_id uuid, p_aprobar boolean, p_motivo_rechazo text default null
) returns public.banco_creditek_pagos_proveedor
language plpgsql security definer set search_path='' as $$
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
    if v.monto>v_deuda then raise exception 'La deuda documentada cambió; Maite debe preparar una nueva solicitud'; end if;
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
end $$;

create function public.banco_creditek_sincronizar_saldo(
  p_saldo numeric, p_fecha_corte date, p_motivo text
) returns public.banco_creditek_cuentas
language plpgsql security definer set search_path='' as $$
declare v public.banco_creditek_cuentas%rowtype;
begin
  if auth.uid() is distinct from '6de0ad26-64af-4966-8cd9-d468880af627'::uuid
    or not exists(select 1 from public.perfiles p where p.id=auth.uid() and p.activo and p.rol='gerencia')
    then raise exception 'Solo Óscar puede sincronizar el saldo bancario'; end if;
  if p_saldo is null or p_saldo<0 or p_saldo<>trunc(p_saldo)
    or p_fecha_corte is null or p_fecha_corte>(now() at time zone 'America/Bogota')::date
    or length(btrim(coalesce(p_motivo,'')))<10
    then raise exception 'Indica saldo entero, fecha de corte y motivo'; end if;
  select * into v from public.banco_creditek_cuentas
    where numero_cuenta='87600004006' for update;
  if not found or not v.activa or v.banco is null or v.tipo_cuenta is null
    then raise exception 'Cuenta Creditek no identificada'; end if;
  if v.saldo_actual is not null then raise exception 'La apertura ya existe; usa conciliación auditada para cambios posteriores'; end if;
  update public.banco_creditek_cuentas set saldo_inicial=p_saldo,fecha_corte=p_fecha_corte,saldo_actual=p_saldo,
    sincronizado_por=auth.uid(),sincronizado_at=now() where id=v.id returning * into v;
  insert into public.banco_creditek_movimientos(cuenta_id,tipo,monto,saldo_antes,saldo_despues,
    fecha,referencia,registrado_por)
    values(v.id,'saldo_inicial',p_saldo,0,p_saldo,p_fecha_corte,btrim(p_motivo),auth.uid());
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(auth.uid()::text,'banco_saldo_inicial_sincronizado','banco_creditek_cuentas',v.id::text,
      jsonb_build_object('saldo',p_saldo,'fecha_corte',p_fecha_corte,'banco',v.banco,'motivo',p_motivo));
  return v;
end $$;

create function public.banco_creditek_registrar_giro_proveedor(
  p_id uuid, p_fecha_pago date, p_referencia_bancaria text, p_soporte_path text
) returns public.banco_creditek_pagos_proveedor
language plpgsql security definer set search_path='' as $$
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
  if v.monto>v_deuda then raise exception 'La deuda cambió; no se hizo ningún descuento ni pago'; end if;
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
  if v_restante<>0 then raise exception 'No se pudo aplicar todo el pago; no se cambió ningún saldo'; end if;
  update public.banco_creditek_cuentas set saldo_actual=saldo_actual-v.monto where id=v_cuenta.id;
  insert into public.banco_creditek_movimientos(cuenta_id,solicitud_id,tipo,monto,saldo_antes,
    saldo_despues,fecha,referencia,soporte_path,registrado_por)
    values(v_cuenta.id,v.id,'pago_proveedor',v.monto,v_cuenta.saldo_actual,
      v_cuenta.saldo_actual-v.monto,p_fecha_pago,btrim(p_referencia_bancaria),p_soporte_path,auth.uid());
  update public.banco_creditek_pagos_proveedor set estado='pagado',pagado_por=auth.uid(),
    pagado_at=now(),fecha_pago=p_fecha_pago,referencia_bancaria=btrim(p_referencia_bancaria),
    soporte_path=p_soporte_path,saldo_banco_antes=v_cuenta.saldo_actual,
    saldo_banco_despues=v_cuenta.saldo_actual-v.monto where id=v.id returning * into v;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(auth.uid()::text,'banco_pago_proveedor_girado','banco_creditek_pagos_proveedor',v.id::text,
      jsonb_build_object('monto',v.monto,'facturas_aplicadas',v_orden,
        'saldo_antes',v.saldo_banco_antes,'saldo_despues',v.saldo_banco_despues,
        'referencia',v.referencia_bancaria,'soporte',v.soporte_path));
  return v;
end $$;

revoke all on function public.banco_creditek_solicitar_pago_proveedor(uuid,uuid,numeric,text),
  public.banco_creditek_decidir_pago_proveedor(uuid,boolean,text),
  public.banco_creditek_sincronizar_saldo(numeric,date,text),
  public.banco_creditek_registrar_giro_proveedor(uuid,date,text,text)
  from public,anon,authenticated;
grant execute on function public.banco_creditek_solicitar_pago_proveedor(uuid,uuid,numeric,text),
  public.banco_creditek_decidir_pago_proveedor(uuid,boolean,text),
  public.banco_creditek_sincronizar_saldo(numeric,date,text),
  public.banco_creditek_registrar_giro_proveedor(uuid,date,text,text) to authenticated;

-- La ruta directa anterior descontaba el saldo B2B y una factura sin aprobación
-- de Gerencia. Se cierra para pagos nuevos; el historial permanece intacto.
revoke execute on function public.registrar_pago_proveedor_desde_saldo_b2b(
  uuid,uuid,numeric,date,text,text,text,text) from public,anon,authenticated;

commit;
