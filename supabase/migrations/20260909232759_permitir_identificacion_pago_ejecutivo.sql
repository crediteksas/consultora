create or replace function kora_private.guardar_cuenta_ejecutivo(
  p_beneficiary_id uuid,
  p_identificacion text,
  p_banco text,
  p_tipo_cuenta text,
  p_numero_cuenta text,
  p_validar boolean default true
) returns public.beneficiary_bank_accounts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_beneficiary public.liquidation_beneficiaries%rowtype;
  v_account public.beneficiary_bank_accounts%rowtype;
  v_identification text := regexp_replace(coalesce(p_identificacion,''),'[^0-9]','','g');
begin
  if auth.uid() is null or not public.tiene_capacidad_aliados('revisor') then
    raise exception 'No autorizado para gestionar cuentas bancarias';
  end if;
  if p_validar is distinct from true then
    raise exception 'Verifica el titular y los datos bancarios';
  end if;
  if v_identification !~ '^[0-9]{5,20}$' then
    raise exception 'La identificación debe tener entre 5 y 20 números';
  end if;

  select * into v_beneficiary
  from public.liquidation_beneficiaries
  where id=p_beneficiary_id and tipo='ejecutivo' and activo
  for update;
  if not found then raise exception 'Ejecutivo no encontrado o inactivo'; end if;
  if exists(
    select 1 from public.liquidation_beneficiaries
    where tipo='ejecutivo' and identificacion=v_identification and id<>p_beneficiary_id
  ) then raise exception 'La identificación ya pertenece a otro ejecutivo'; end if;

  update public.liquidation_beneficiaries
  set identificacion=v_identification
  where id=p_beneficiary_id;

  select * into v_account
  from public.aliados_guardar_cuenta_bancaria(
    p_beneficiary_id,p_banco,p_tipo_cuenta,p_numero_cuenta,p_validar
  );

  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
  values(
    auth.uid(),'tesoreria_identificacion_ejecutivo_actualizada','liquidation_beneficiaries',p_beneficiary_id,
    jsonb_build_object(
      'identificacion_anterior_terminada_en',right(v_beneficiary.identificacion,4),
      'identificacion_nueva_terminada_en',right(v_identification,4),
      'alcance','maestro futuras liquidaciones; ordenes existentes sin cambios'
    )
  );
  return v_account;
end $$;

revoke all on function kora_private.guardar_cuenta_ejecutivo(uuid,text,text,text,text,boolean) from public,anon,authenticated;
grant execute on function kora_private.guardar_cuenta_ejecutivo(uuid,text,text,text,text,boolean) to authenticated;

create or replace function public.tesoreria_guardar_cuenta_ejecutivo(
  p_beneficiary_id uuid,
  p_identificacion text,
  p_banco text,
  p_tipo_cuenta text,
  p_numero_cuenta text,
  p_validar boolean default true
) returns public.beneficiary_bank_accounts
language sql
security invoker
set search_path = ''
as $$
  select kora_private.guardar_cuenta_ejecutivo(
    p_beneficiary_id,p_identificacion,p_banco,p_tipo_cuenta,p_numero_cuenta,p_validar
  )
$$;

revoke all on function public.tesoreria_guardar_cuenta_ejecutivo(uuid,text,text,text,text,boolean) from public,anon;
grant execute on function public.tesoreria_guardar_cuenta_ejecutivo(uuid,text,text,text,text,boolean) to authenticated;

notify pgrst, 'reload schema';
