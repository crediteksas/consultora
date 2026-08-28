begin;

create or replace function public.aliados_crear_tercero_con_cuenta(
  p_origen_codigo text,
  p_identificacion text,
  p_nombre text,
  p_banco text,
  p_tipo_cuenta text,
  p_numero_cuenta text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_beneficiary public.liquidation_beneficiaries%rowtype;
  v_account public.beneficiary_bank_accounts%rowtype;
  v_origin public.origenes%rowtype;
  v_identification text := regexp_replace(coalesce(p_identificacion, ''), '[^0-9]', '', 'g');
  v_account_number text := regexp_replace(coalesce(p_numero_cuenta, ''), '[^0-9]', '', 'g');
begin
  if (select auth.uid()) is null or not public.tiene_capacidad_aliados('revisor') then
    raise exception 'No autorizado para administrar cuentas de aliados';
  end if;
  if length(btrim(coalesce(p_nombre, ''))) < 3 then raise exception 'El nombre o razón social es obligatorio'; end if;
  if length(v_identification) < 5 then raise exception 'La identificación debe tener al menos 5 números'; end if;
  if length(btrim(coalesce(p_banco, ''))) < 2 then raise exception 'El banco es obligatorio'; end if;
  if lower(btrim(coalesce(p_tipo_cuenta, ''))) not in ('ahorros', 'corriente') then raise exception 'Tipo de cuenta inválido'; end if;
  if length(v_account_number) < 5 then raise exception 'El número de cuenta debe tener al menos 5 números'; end if;

  select * into v_origin from public.origenes
  where codigo = upper(btrim(p_origen_codigo)) and tipo = 'aliado' and activo = true;
  if not found then raise exception 'El aliado no existe o está inactivo'; end if;

  perform pg_advisory_xact_lock(hashtextextended('beneficiary:' || v_origin.codigo, 0));
  select * into v_beneficiary from public.liquidation_beneficiaries
  where tipo = 'aliado' and origen_codigo = v_origin.codigo and activo = true
  order by created_at desc limit 1 for update;

  if found and v_beneficiary.identificacion <> v_identification then
    raise exception 'El aliado ya tiene otro beneficiario activo. Agrega la cuenta al beneficiario existente o solicita el cambio de titular.';
  end if;

  if not found then
    insert into public.liquidation_beneficiaries(tipo, identificacion, nombre, origen_codigo, activo)
    values ('aliado', v_identification, btrim(p_nombre), v_origin.codigo, true)
    on conflict (tipo, identificacion) do update set
      nombre = excluded.nombre,
      origen_codigo = excluded.origen_codigo,
      activo = true
    returning * into v_beneficiary;
  end if;

  insert into public.beneficiary_bank_accounts(
    beneficiary_id, banco, tipo_cuenta, numero_cuenta, validada, validada_por, validada_at, activo
  ) values (
    v_beneficiary.id, btrim(p_banco), lower(btrim(p_tipo_cuenta)), v_account_number,
    true, (select auth.uid()), now(), true
  ) on conflict (beneficiary_id, numero_cuenta) do update set
    banco = excluded.banco,
    tipo_cuenta = excluded.tipo_cuenta,
    validada = true,
    validada_por = excluded.validada_por,
    validada_at = excluded.validada_at,
    activo = true
  returning * into v_account;

  insert into public.audit_log(usuario, accion, tabla, registro_id, detalle)
  values ((select auth.uid()), 'aliados_tercero_cuenta_creada', 'beneficiary_bank_accounts', v_account.id,
    jsonb_build_object('beneficiary_id', v_beneficiary.id, 'origen_codigo', v_origin.codigo,
      'tipo', 'aliado', 'cuenta_terminada_en', right(v_account.numero_cuenta, 4)));

  return jsonb_build_object('ok', true, 'beneficiary_id', v_beneficiary.id, 'bank_account_id', v_account.id);
end;
$$;

revoke all on function public.aliados_crear_tercero_con_cuenta(text,text,text,text,text,text) from public, anon;
grant execute on function public.aliados_crear_tercero_con_cuenta(text,text,text,text,text,text) to authenticated;

commit;
