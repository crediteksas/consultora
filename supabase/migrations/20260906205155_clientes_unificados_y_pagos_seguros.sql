-- Registrada con esta versión por Supabase al instalar la migración comprobada.
-- Una ficha maestra por relación exacta de comercio/sede. No fusiona nombres,
-- no inventa identificación legal y no toca saldos, órdenes ni aprobaciones.
alter table public.aliados add column if not exists contacto text;
alter table public.aliados add column if not exists telefono text;
alter table public.aliados add column if not exists email text;
alter table public.aliados add column if not exists observacion text;
alter table public.aliados add column if not exists revision integer not null default 0;

do $$
declare o record; v_client uuid;
begin
  for o in select * from public.origenes where tipo='aliado' and activo order by codigo loop
    select aliado_id into v_client from public.aliados_sedes where origen_codigo=o.codigo;
    if v_client is null then
      insert into public.aliados(nombre_comercial,ciudad_principal,ejecutivo_id,estado_asociacion)
        values(o.nombre,o.ciudad,o.ejecutivo_id,'pendiente_asociacion') returning id into v_client;
      insert into public.aliados_sedes(aliado_id,origen_codigo,nombre,ciudad,estado_asociacion)
        values(v_client,o.codigo,o.nombre,o.ciudad,'pendiente_asociacion')
        on conflict(origen_codigo) do update set aliado_id=excluded.aliado_id,updated_at=now();
      insert into public.audit_log(accion,tabla,registro_id,detalle)
        values('cliente_unificado_por_codigo','aliados',v_client,
          jsonb_build_object('origen_codigo',o.codigo,'fuente','origenes_y_sedes','sin_fusion_por_nombre',true));
    end if;
  end loop;
end $$;

-- Los comercios futuros entran al mismo directorio sin una carga manual aparte.
create or replace function public.vincular_ficha_nuevo_comercio() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_client uuid;
begin
  if new.tipo<>'aliado' or new.activo is distinct from true then return new; end if;
  select aliado_id into v_client from public.aliados_sedes where origen_codigo=new.codigo;
  if v_client is null then
    insert into public.aliados(nombre_comercial,ciudad_principal,ejecutivo_id,estado_asociacion)
      values(new.nombre,new.ciudad,new.ejecutivo_id,'pendiente_asociacion') returning id into v_client;
    insert into public.aliados_sedes(aliado_id,origen_codigo,nombre,ciudad,estado_asociacion)
      values(v_client,new.codigo,new.nombre,new.ciudad,'pendiente_asociacion')
      on conflict(origen_codigo) do update set aliado_id=excluded.aliado_id,updated_at=now();
    insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),'cliente_vinculado_por_codigo','aliados',v_client,jsonb_build_object('origen_codigo',new.codigo));
  end if;
  return new;
end $$;
revoke all on function public.vincular_ficha_nuevo_comercio() from public,anon,authenticated;
create trigger vincular_ficha_nuevo_comercio after insert or update of activo,tipo on public.origenes for each row execute function public.vincular_ficha_nuevo_comercio();

create or replace function public.tesoreria_guardar_ficha_cliente(
  p_origen_codigo text, p_cliente_id uuid, p_revision integer, p_datos jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_before public.aliados%rowtype; v_sede public.aliados_sedes%rowtype; v_revision integer;
begin
  if auth.uid() is null or not public.tiene_capacidad_aliados('revisor') then raise exception 'No autorizado para editar clientes'; end if;
  if jsonb_typeof(p_datos) is distinct from 'object' then raise exception 'Datos del cliente inválidos'; end if;
  if exists(select 1 from jsonb_object_keys(p_datos) k where k not in
    ('nombre','razon_social','identificacion','propietario','ciudad','direccion','contacto','telefono','email','observacion')) then
    raise exception 'La ficha contiene campos no permitidos';
  end if;
  if length(btrim(coalesce(p_datos->>'nombre',''))) not between 3 and 180 then raise exception 'Escribe el nombre del comercio'; end if;
  if exists(select 1 from jsonb_each_text(p_datos) d where length(d.value)>2000) then raise exception 'Hay un dato demasiado largo'; end if;
  if nullif(p_datos->>'identificacion','') is not null and p_datos->>'identificacion' !~ '^[0-9.-]{5,25}$' then raise exception 'Identificación legal inválida'; end if;
  if nullif(p_datos->>'email','') is not null and p_datos->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Correo inválido'; end if;
  perform 1 from public.origenes where codigo=p_origen_codigo and tipo='aliado' and activo for update;
  if not found then raise exception 'Comercio no disponible'; end if;
  select * into v_sede from public.aliados_sedes where origen_codigo=p_origen_codigo for update;
  if not found or v_sede.aliado_id is distinct from p_cliente_id then raise exception 'La relación del cliente cambió. Actualiza el directorio'; end if;
  select * into v_before from public.aliados where id=p_cliente_id for update;
  if v_before.revision is distinct from p_revision then raise exception 'Otra persona actualizó esta ficha. Cierra y actualiza antes de guardar'; end if;
  update public.aliados set
    nombre_comercial=case when (select count(*) from public.aliados_sedes where aliado_id=p_cliente_id)=1 then btrim(p_datos->>'nombre') else nombre_comercial end,
    ciudad_principal=case when (select count(*) from public.aliados_sedes where aliado_id=p_cliente_id)=1 then nullif(btrim(p_datos->>'ciudad'),'') else ciudad_principal end,
    razon_social=nullif(btrim(p_datos->>'razon_social'),''),
    identificacion=nullif(btrim(p_datos->>'identificacion'),''),propietario=nullif(btrim(p_datos->>'propietario'),''),
    contacto=nullif(btrim(p_datos->>'contacto'),''),telefono=nullif(btrim(p_datos->>'telefono'),''),
    email=nullif(btrim(p_datos->>'email'),''),observacion=nullif(btrim(p_datos->>'observacion'),''),
    revision=revision+1,updated_at=now(),updated_by=auth.uid()
    where id=p_cliente_id returning revision into v_revision;
  update public.origenes set nombre=btrim(p_datos->>'nombre'),ciudad=nullif(btrim(p_datos->>'ciudad'),'') where codigo=p_origen_codigo;
  update public.aliados_sedes set nombre=btrim(p_datos->>'nombre'),ciudad=nullif(btrim(p_datos->>'ciudad'),''),
    direccion=nullif(btrim(p_datos->>'direccion'),''),updated_at=now(),updated_by=auth.uid() where id=v_sede.id;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),'cliente_ficha_actualizada','aliados',p_cliente_id,
    jsonb_build_object('antes',to_jsonb(v_before),'sede_antes',to_jsonb(v_sede),'datos',p_datos,'origen_codigo',p_origen_codigo,'revision',v_revision));
  return jsonb_build_object('ok',true,'revision',v_revision);
end $$;
revoke all on function public.tesoreria_guardar_ficha_cliente(text,uuid,integer,jsonb) from public,anon;
grant execute on function public.tesoreria_guardar_ficha_cliente(text,uuid,integer,jsonb) to authenticated;

-- Un único criterio bancario, también para las rutas antiguas y ejecutivos.
create or replace function public.aliados_guardar_cuenta_bancaria(
  p_beneficiary_id uuid,p_banco text,p_tipo_cuenta text,p_numero_cuenta text,p_validar boolean default true
) returns public.beneficiary_bank_accounts language plpgsql security definer set search_path = '' as $$
declare v public.beneficiary_bank_accounts%rowtype; v_number text:=btrim(coalesce(p_numero_cuenta,''));
begin
  if auth.uid() is null or not public.tiene_capacidad_aliados('revisor') then raise exception 'No autorizado para gestionar cuentas bancarias'; end if;
  if p_validar is distinct from true then raise exception 'Verifica el titular y los datos bancarios'; end if;
  if length(btrim(coalesce(p_banco,''))) not between 2 and 100 then raise exception 'Escribe el banco'; end if;
  if coalesce(p_tipo_cuenta,'') not in ('ahorros','corriente') then raise exception 'Tipo de cuenta inválido'; end if;
  if v_number !~ '^[0-9]{5,30}$' then raise exception 'Número de cuenta inválido'; end if;
  perform 1 from public.liquidation_beneficiaries where id=p_beneficiary_id and activo for update;
  if not found then raise exception 'Beneficiario no encontrado o inactivo'; end if;
  select * into v from public.beneficiary_bank_accounts where beneficiary_id=p_beneficiary_id and numero_cuenta=v_number for update;
  if found then
    if (v.banco is distinct from btrim(p_banco) or v.tipo_cuenta is distinct from p_tipo_cuenta)
      and exists(select 1 from public.payment_orders where bank_account_id=v.id) then
      raise exception 'Esta cuenta está vinculada a órdenes existentes; no se puede cambiar su banco o tipo';
    end if;
    update public.beneficiary_bank_accounts set banco=btrim(p_banco),tipo_cuenta=p_tipo_cuenta,validada=true,
      validada_por=auth.uid(),validada_at=now(),activo=true where id=v.id returning * into v;
  else
    insert into public.beneficiary_bank_accounts(beneficiary_id,banco,tipo_cuenta,numero_cuenta,validada,validada_por,validada_at,activo)
      values(p_beneficiary_id,btrim(p_banco),p_tipo_cuenta,v_number,true,auth.uid(),now(),true) returning * into v;
  end if;
  update public.beneficiary_bank_accounts set activo=false where beneficiary_id=p_beneficiary_id and activo and id<>v.id;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),'aliados_cuenta_bancaria_guardada','beneficiary_bank_accounts',v.id,
    jsonb_build_object('beneficiary_id',p_beneficiary_id,'banco',v.banco,'cuenta_terminada_en',right(v_number,4),'alcance','maestro_futuras_liquidaciones'));
  return v;
end $$;
revoke all on function public.aliados_guardar_cuenta_bancaria(uuid,text,text,text,boolean) from public,anon;
grant execute on function public.aliados_guardar_cuenta_bancaria(uuid,text,text,text,boolean) to authenticated;

-- No reescribir el destino de órdenes autorizadas, cerradas o de lotes aprobados.
create or replace function public.proteger_destino_pago() returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.bank_account_id is distinct from old.bank_account_id or new.bank_snapshot is distinct from old.bank_snapshot
      or new.beneficiary_id is distinct from old.beneficiary_id)
    and (old.authorized_by is not null or old.estado in ('programado','pagado','conciliado')
      or exists(select 1 from public.liquidations where id=old.liquidation_id and frozen_at is not null)) then
    raise exception 'La orden ya fue autorizada o cerrada. Editar el cliente no cambia su cuenta de destino';
  end if;
  return new;
end $$;
revoke all on function public.proteger_destino_pago() from public,anon,authenticated;
create trigger zzzz_proteger_destino_pago before update on public.payment_orders for each row execute function public.proteger_destino_pago();

-- Reutiliza el escritor bancario y restringe la reparación antigua a borradores.
-- Los bloques esperados se verifican: si cambió la función fuente, aborta todo.
do $$
declare v_sql text; v_start integer; v_end integer;
begin
  v_sql:=pg_get_functiondef('public.tesoreria_guardar_cliente_cuenta(text,uuid,text,text,text,text,text,boolean)'::regprocedure);
  v_start:=strpos(v_sql,'  select * into v_account from public.beneficiary_bank_accounts');
  v_end:=strpos(v_sql,'  insert into public.audit_log');
  if v_start=0 or v_end<=v_start then raise exception 'La función de clientes cambió; revisar antes de migrar'; end if;
  v_sql:=substr(v_sql,1,v_start-1)||E'  select * into v_account from public.aliados_guardar_cuenta_bancaria(v_holder.id,p_banco,p_tipo_cuenta,v_number,true);\n'||substr(v_sql,v_end);
  execute v_sql;
  v_sql:=pg_get_functiondef('public.aliados_completar_pagos_beneficiario(uuid)'::regprocedure);
  if strpos(v_sql,'where beneficiary_id=p_beneficiary_id and (bank_snapshot is null or bank_account_id<>bank.id);')=0 then
    raise exception 'La función de reparación de pagos cambió; revisar antes de migrar';
  end if;
  v_sql:=replace(v_sql,'where beneficiary_id=p_beneficiary_id and (bank_snapshot is null or bank_account_id<>bank.id);',
    'where beneficiary_id=p_beneficiary_id and estado=''pendiente'' and authorized_by is null
      and exists(select 1 from public.liquidations l where l.id=payment_orders.liquidation_id and l.frozen_at is null)
      and (bank_snapshot is null or bank_account_id is distinct from bank.id);');
  execute v_sql;
end $$;
revoke all on function public.aliados_completar_pagos_beneficiario(uuid) from public,anon;
grant execute on function public.aliados_completar_pagos_beneficiario(uuid) to authenticated;

-- El comprobante cierra una orden lista; si el débito ya existe solo adjunta.
-- Transacción única, bloqueo ordenado e idempotencia ante reintentos de red.
create or replace function public.tesoreria_cerrar_pagos_con_soporte(p_ids uuid[],p_soporte_path text)
returns integer language plpgsql security definer set search_path = '' as $$
declare v public.payment_orders%rowtype; v_first public.payment_orders%rowtype; v_id uuid; v_count integer; v_object record;
begin
  if auth.uid() is null or not public.tiene_capacidad_aliados('revisor') then raise exception 'No autorizado para registrar soportes'; end if;
  if coalesce(cardinality(p_ids),0) not between 1 and 50 or array_position(p_ids,null) is not null
    or cardinality(p_ids)<>(select count(distinct id) from unnest(p_ids) id) then raise exception 'Selecciona entre 1 y 50 órdenes diferentes'; end if;
  if coalesce(p_soporte_path,'') not like 'aliados/pagos/%' then raise exception 'Comprobante inválido'; end if;
  select metadata into v_object from storage.objects where bucket_id='soportes' and name=p_soporte_path;
  if not found then raise exception 'El comprobante no se ha cargado. No se registró ningún pago'; end if;
  if coalesce(v_object.metadata->>'mimetype','') not in ('application/pdf','image/jpeg','image/png')
    or coalesce((v_object.metadata->>'size')::bigint,0) not between 1 and 10485760 then raise exception 'El soporte debe ser una imagen o PDF de máximo 10 MB'; end if;
  perform 1 from public.payment_orders where id=any(p_ids) order by id for update;
  select count(*) into v_count from public.payment_orders where id=any(p_ids);
  if v_count<>cardinality(p_ids) then raise exception 'Una orden ya no está disponible. Actualiza Tesorería'; end if;
  select * into v_first from public.payment_orders where id=p_ids[1];
  for v in select * from public.payment_orders where id=any(p_ids) order by id loop
    if v.historico_inicial then raise exception 'No se modifican pagos históricos desde este formulario'; end if;
    if v.beneficiary_id is distinct from v_first.beneficiary_id or v.bank_snapshot is distinct from v_first.bank_snapshot then
      raise exception 'El soporte agrupado requiere el mismo beneficiario y la misma cuenta de destino';
    end if;
    if v.estado not in ('programado','pagado','conciliado') then raise exception 'La orden no está lista para registrar el pago'; end if;
    if v.estado in ('pagado','conciliado') then
      if nullif(v.soporte_path,'') is not null and v.soporte_path<>p_soporte_path then raise exception 'La orden ya tiene un soporte; no se reemplazó'; end if;
      if v.estado='conciliado' and nullif(v.soporte_path,'') is null then raise exception 'La orden está conciliada; requiere revisión de su soporte'; end if;
    else
      if v.authorized_by is null or v.authorized_at is null then raise exception 'Falta autorización de Gerencia'; end if;
      if not exists(select 1 from public.liquidations l where l.id=v.liquidation_id and l.frozen_at is not null and l.approved_at is not null) then
        raise exception 'Falta aprobar el lote % · corte %',v.platform_snapshot,v.cutoff_snapshot;
      end if;
      if v.valor<=0 or exists(select 1 from unnest(array['bank','account_type','account_number','holder','holder_identification']) k where nullif(v.bank_snapshot->>k,'') is null) then
        raise exception 'La orden no tiene valor o cuenta completos';
      end if;
    end if;
  end loop;
  for v in select * from public.payment_orders where id=any(p_ids) order by id loop
    if v.estado='programado' then
      perform public.aliados_cambiar_estado_pago(v.id,'pagado',p_soporte_path);
    elsif nullif(v.soporte_path,'') is null then
      update public.payment_orders set soporte_path=p_soporte_path,updated_at=now() where id=v.id;
      insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),'pago_soporte_adjuntado_sin_nuevo_debito','payment_orders',v.id,
        jsonb_build_object('soporte_path',p_soporte_path,'estado',v.estado));
    end if;
  end loop;
  return v_count;
end $$;
revoke all on function public.tesoreria_cerrar_pagos_con_soporte(uuid[],text) from public,anon;
grant execute on function public.tesoreria_cerrar_pagos_con_soporte(uuid[],text) to authenticated;

create or replace function public.aliados_registrar_pago_agrupado(p_ids uuid[],p_soporte_path text)
returns integer language plpgsql security definer set search_path = '' as $$
begin return public.tesoreria_cerrar_pagos_con_soporte(p_ids,p_soporte_path); end $$;
revoke all on function public.aliados_registrar_pago_agrupado(uuid[],text) from public,anon;
grant execute on function public.aliados_registrar_pago_agrupado(uuid[],text) to authenticated;
