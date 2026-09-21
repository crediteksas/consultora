-- Permite corregir la cuenta maestra de un beneficiario sin alterar pagos
-- autorizados o pagados. Solo las identidades verificadas de Mayte y Oscar.
create or replace function public.es_editor_cuenta_destino()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.perfiles perfil
    where perfil.id = auth.uid()
      and perfil.activo
      and perfil.rol in ('gerencia', 'auditoria')
      and perfil.id in (
        'd1782db6-bacc-4caf-af6f-ce1b8d1c0391'::uuid,
        '6de0ad26-64af-4966-8cd9-d468880af627'::uuid
      )
  );
$$;

revoke all on function public.es_editor_cuenta_destino()
  from public, anon;
grant execute on function public.es_editor_cuenta_destino()
  to authenticated;

create or replace function public.proteger_reemplazo_cuenta_destino()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.activo
     and auth.uid() is not null
     and exists (
       select 1
       from public.beneficiary_bank_accounts vigente
       where vigente.beneficiary_id = new.beneficiary_id
         and vigente.activo
         and vigente.id is distinct from new.id
         and vigente.numero_cuenta is distinct from new.numero_cuenta
     )
     and not public.es_editor_cuenta_destino() then
    raise exception 'Solo Mayte y Oscar pueden reemplazar el número de la cuenta destino';
  end if;
  return new;
end;
$$;

revoke all on function public.proteger_reemplazo_cuenta_destino()
  from public, anon, authenticated;

drop trigger if exists proteger_reemplazo_cuenta_destino
  on public.beneficiary_bank_accounts;
create trigger proteger_reemplazo_cuenta_destino
before insert or update of activo, numero_cuenta
on public.beneficiary_bank_accounts
for each row execute function public.proteger_reemplazo_cuenta_destino();

-- Conserva la protección histórica. La única excepción es una corrección
-- auditada de una orden todavía pendiente, sin autorización, pago ni soporte.
create or replace function public.proteger_destino_pago()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cuenta_valida boolean;
begin
  if new.bank_account_id is not distinct from old.bank_account_id
     and new.bank_snapshot is not distinct from old.bank_snapshot
     and new.beneficiary_id is not distinct from old.beneficiary_id then
    return new;
  end if;

  select exists (
    select 1
    from public.beneficiary_bank_accounts cuenta
    where cuenta.id = new.bank_account_id
      and cuenta.beneficiary_id = old.beneficiary_id
      and cuenta.activo
      and cuenta.validada
  ) into v_cuenta_valida;

  if public.es_editor_cuenta_destino()
     and old.estado = 'pendiente'
     and old.authorized_by is null
     and old.authorized_at is null
     and old.paid_by is null
     and old.fecha_pagada is null
     and nullif(btrim(old.soporte_path), '') is null
     and new.beneficiary_id = old.beneficiary_id
     and v_cuenta_valida then
    return new;
  end if;

  raise exception 'La orden ya fue autorizada o cerrada. La cuenta histórica no se puede reemplazar';
end;
$$;

revoke all on function public.proteger_destino_pago()
  from public, anon, authenticated;

create or replace function public.tesoreria_editar_cuenta_destino(
  p_cuenta_id uuid,
  p_numero_cuenta text,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anterior public.beneficiary_bank_accounts%rowtype;
  v_nueva public.beneficiary_bank_accounts%rowtype;
  v_beneficiario public.liquidation_beneficiaries%rowtype;
  v_numero text := btrim(coalesce(p_numero_cuenta, ''));
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_ordenes_actualizadas integer := 0;
begin
  if not public.es_editor_cuenta_destino() then
    raise exception 'Solo Mayte y Oscar pueden editar el número de la cuenta destino';
  end if;
  if v_numero !~ '^[0-9]{5,30}$' then
    raise exception 'El número de cuenta debe tener entre 5 y 30 dígitos';
  end if;
  if length(v_motivo) not between 5 and 300 then
    raise exception 'Escribe el motivo de la corrección';
  end if;

  select * into v_anterior
  from public.beneficiary_bank_accounts
  where id = p_cuenta_id
    and activo
    and validada
  for update;

  if not found then
    raise exception 'La cuenta activa no existe o todavía no está validada';
  end if;
  if v_anterior.numero_cuenta = v_numero then
    raise exception 'El nuevo número es igual al número vigente';
  end if;

  select * into v_beneficiario
  from public.liquidation_beneficiaries
  where id = v_anterior.beneficiary_id
    and activo
  for update;

  if not found then
    raise exception 'El titular de la cuenta no existe o está inactivo';
  end if;

  select * into v_nueva
  from public.beneficiary_bank_accounts
  where beneficiary_id = v_anterior.beneficiary_id
    and numero_cuenta = v_numero
  for update;

  if found then
    update public.beneficiary_bank_accounts
    set banco = v_anterior.banco,
        tipo_cuenta = v_anterior.tipo_cuenta,
        activo = true,
        validada = true,
        validada_por = auth.uid(),
        validada_at = now()
    where id = v_nueva.id
    returning * into v_nueva;
  else
    insert into public.beneficiary_bank_accounts (
      beneficiary_id, banco, tipo_cuenta, numero_cuenta,
      activo, validada, validada_por, validada_at
    ) values (
      v_anterior.beneficiary_id, v_anterior.banco,
      v_anterior.tipo_cuenta, v_numero,
      true, true, auth.uid(), now()
    ) returning * into v_nueva;
  end if;

  update public.beneficiary_bank_accounts
  set activo = false
  where beneficiary_id = v_anterior.beneficiary_id
    and id <> v_nueva.id
    and activo;

  update public.payment_orders orden
  set bank_account_id = v_nueva.id,
      bank_snapshot = coalesce(orden.bank_snapshot, '{}'::jsonb) || jsonb_build_object(
        'bank', v_nueva.banco,
        'account_type', v_nueva.tipo_cuenta,
        'account_number', v_nueva.numero_cuenta,
        'holder', v_beneficiario.nombre,
        'holder_identification', v_beneficiario.identificacion
      ),
      updated_at = now()
  where orden.beneficiary_id = v_anterior.beneficiary_id
    and orden.estado = 'pendiente'
    and orden.authorized_by is null
    and orden.authorized_at is null
    and orden.paid_by is null
    and orden.fecha_pagada is null
    and nullif(btrim(orden.soporte_path), '') is null;

  get diagnostics v_ordenes_actualizadas = row_count;

  insert into public.audit_log (
    usuario, accion, tabla, registro_id, detalle
  ) values (
    auth.uid(),
    'cuenta_destino_editada',
    'beneficiary_bank_accounts',
    v_nueva.id,
    jsonb_build_object(
      'beneficiary_id', v_anterior.beneficiary_id,
      'cuenta_anterior_id', v_anterior.id,
      'cuenta_anterior_terminada_en', right(v_anterior.numero_cuenta, 4),
      'cuenta_nueva_id', v_nueva.id,
      'cuenta_nueva_terminada_en', right(v_nueva.numero_cuenta, 4),
      'motivo', v_motivo,
      'ordenes_pendientes_actualizadas', v_ordenes_actualizadas,
      'ordenes_autorizadas_o_pagadas_modificadas', 0
    )
  );

  return jsonb_build_object(
    'ok', true,
    'cuenta_id', v_nueva.id,
    'cuenta_terminada_en', right(v_nueva.numero_cuenta, 4),
    'ordenes_pendientes_actualizadas', v_ordenes_actualizadas
  );
end;
$$;

revoke all on function public.tesoreria_editar_cuenta_destino(uuid, text, text)
  from public, anon;
grant execute on function public.tesoreria_editar_cuenta_destino(uuid, text, text)
  to authenticated;
