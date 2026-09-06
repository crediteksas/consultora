-- Directorio de Tesorería. La misma capacidad bancaria existente; sin permisos
-- directos de escritura ni cambios a payment_orders, saldos o liquidaciones.
create or replace function public.tesoreria_guardar_cliente_cuenta(
  p_origen_codigo text, p_previous_beneficiary_id uuid,
  p_nombre text, p_identificacion text, p_banco text,
  p_tipo_cuenta text, p_numero_cuenta text, p_verificada boolean
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_origin public.origenes%rowtype;
  v_current public.liquidation_beneficiaries%rowtype;
  v_holder public.liquidation_beneficiaries%rowtype;
  v_account public.beneficiary_bank_accounts%rowtype;
  v_before jsonb;
  v_active_count integer;
  v_id text := btrim(coalesce(p_identificacion,''));
  v_number text := btrim(coalesce(p_numero_cuenta,''));
begin
  if auth.uid() is null or not public.tiene_capacidad_aliados('revisor') then
    raise exception 'No autorizado para administrar clientes y cuentas';
  end if;
  if p_verificada is distinct from true then raise exception 'Verifica el titular y los datos bancarios'; end if;
  if length(btrim(coalesce(p_nombre,''))) not between 3 and 180 then raise exception 'Escribe el nombre o razón social del titular'; end if;
  if v_id !~ '^[0-9]{5,20}$' then raise exception 'Identificación inválida'; end if;
  if length(btrim(coalesce(p_banco,''))) not between 2 and 100 then raise exception 'Escribe el banco'; end if;
  if coalesce(p_tipo_cuenta,'') not in ('ahorros','corriente') then raise exception 'Tipo de cuenta inválido'; end if;
  if v_number !~ '^[0-9]{5,30}$' then raise exception 'Número de cuenta inválido'; end if;
  select * into v_origin from public.origenes where codigo=p_origen_codigo and tipo='aliado' and activo;
  if not found then raise exception 'El comercio aliado no existe o está inactivo'; end if;
  perform pg_advisory_xact_lock(hashtextextended('beneficiary:' || v_origin.codigo,0));
  perform pg_advisory_xact_lock(hashtextextended('treasury-holder:' || v_id,0));
  select count(*) into v_active_count from public.liquidation_beneficiaries where tipo='aliado' and origen_codigo=v_origin.codigo and activo;
  if v_active_count>1 then raise exception 'El comercio tiene titulares duplicados. Revisa la asociación'; end if;
  select * into v_current from public.liquidation_beneficiaries where tipo='aliado' and origen_codigo=v_origin.codigo and activo for update;
  if v_current.id is distinct from p_previous_beneficiary_id then
    raise exception 'La relación del cliente cambió. Actualiza el directorio antes de guardar';
  end if;
  select * into v_holder from public.liquidation_beneficiaries where tipo='aliado' and identificacion=v_id for update;
  if found then
    if v_holder.origen_codigo is not null and v_holder.origen_codigo<>v_origin.codigo then
      raise exception 'Esta identificación ya está relacionada con otro comercio. No se trasladó ni se fusionó ningún cliente';
    end if;
    -- Un historial sin snapshot no debe cambiar de identidad al editar el maestro.
    if (v_holder.nombre is distinct from btrim(p_nombre) or v_holder.origen_codigo is distinct from v_origin.codigo)
      and exists(select 1 from public.payment_orders po where po.beneficiary_id=v_holder.id
        and (nullif(po.bank_snapshot->>'holder','') is null or v_holder.origen_codigo is null)) then
      raise exception 'Este titular tiene órdenes históricas sin datos completos. Conserva su identidad y registra otro titular';
    end if;
    v_before := jsonb_build_object('beneficiary_id',v_holder.id,'nombre',v_holder.nombre,'origen_codigo',v_holder.origen_codigo);
    update public.liquidation_beneficiaries set nombre=btrim(p_nombre),origen_codigo=v_origin.codigo,activo=true where id=v_holder.id returning * into v_holder;
  else
    insert into public.liquidation_beneficiaries(tipo,identificacion,nombre,origen_codigo,activo)
      values('aliado',v_id,btrim(p_nombre),v_origin.codigo,true) returning * into v_holder;
  end if;
  update public.liquidation_beneficiaries set activo=false where tipo='aliado' and origen_codigo=v_origin.codigo and activo and id<>v_holder.id;
  select * into v_account from public.beneficiary_bank_accounts where beneficiary_id=v_holder.id and numero_cuenta=v_number for update;
  if found then
    if (v_account.banco is distinct from btrim(p_banco) or v_account.tipo_cuenta is distinct from p_tipo_cuenta)
      and exists(select 1 from public.payment_orders po where po.bank_account_id=v_account.id
        and (nullif(po.bank_snapshot->>'bank','') is null or nullif(po.bank_snapshot->>'account_type','') is null
          or nullif(po.bank_snapshot->>'account_number','') is null)) then
      raise exception 'La cuenta tiene órdenes sin datos históricos completos; no se modificó';
    end if;
    update public.beneficiary_bank_accounts set banco=btrim(p_banco),tipo_cuenta=p_tipo_cuenta,
      validada=true,validada_por=auth.uid(),validada_at=now(),activo=true where id=v_account.id returning * into v_account;
  else
    insert into public.beneficiary_bank_accounts(beneficiary_id,banco,tipo_cuenta,numero_cuenta,validada,validada_por,validada_at,activo)
      values(v_holder.id,btrim(p_banco),p_tipo_cuenta,v_number,true,auth.uid(),now(),true) returning * into v_account;
  end if;
  update public.beneficiary_bank_accounts set activo=false where beneficiary_id=v_holder.id and activo and id<>v_account.id;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(auth.uid(),'tesoreria_cliente_cuenta_guardado','liquidation_beneficiaries',v_holder.id,
      jsonb_build_object('antes',v_before,'origen_codigo',v_origin.codigo,'nombre',v_holder.nombre,
        'previous_beneficiary_id',v_current.id,'bank_account_id',v_account.id,
        'cuenta_terminada_en',right(v_number,4),'alcance','maestro_futuras_liquidaciones'));
  return jsonb_build_object('ok',true,'beneficiary_id',v_holder.id,'bank_account_id',v_account.id);
end;
$$;
revoke all on function public.tesoreria_guardar_cliente_cuenta(text,uuid,text,text,text,text,text,boolean) from public,anon;
grant execute on function public.tesoreria_guardar_cliente_cuenta(text,uuid,text,text,text,text,text,boolean) to authenticated;
