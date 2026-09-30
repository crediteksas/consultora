-- Reuse the existing beneficiary directory. No historical payment snapshots,
-- approvals, balances or recurring obligations are modified by this migration.
alter table public.financial_recurring_templates
  add column beneficiary_id uuid references public.liquidation_beneficiaries(id),
  add column bank_account_id uuid references public.beneficiary_bank_accounts(id);
create index financial_templates_beneficiary_idx on public.financial_recurring_templates(beneficiary_id);
create index financial_templates_bank_account_idx on public.financial_recurring_templates(bank_account_id);
create function kora_private.financial_template_clear_changed_person() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.beneficiary is distinct from old.beneficiary
    or new.beneficiary_document is distinct from old.beneficiary_document
    or new.destination_account is distinct from old.destination_account then
    new.beneficiary_id:=null;new.bank_account_id:=null;
  end if;
  return new;
end $$;
revoke all on function kora_private.financial_template_clear_changed_person() from public,anon,authenticated;
create trigger financial_template_person_snapshot before update on public.financial_recurring_templates
  for each row execute function kora_private.financial_template_clear_changed_person();
create or replace function kora_private.financial_beneficiaries_list()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or not coalesce(public.es_controlador_financiero(),false) then
    raise exception 'Solo Maite u Oscar pueden consultar beneficiarios de gastos';
  end if;
  select coalesce(jsonb_agg(x.data),'[]'::jsonb) into result from (
    select jsonb_build_object('key',b.id::text||':'||coalesce(a.id::text,''),
      'beneficiaryId',b.id,'accountId',a.id,'name',b.nombre,'document',b.identificacion,
      'templateIds',(select coalesce(jsonb_agg(t.id),'[]'::jsonb) from public.financial_recurring_templates t
        where t.beneficiary_id=b.id and t.bank_account_id=a.id),
      'bank',a.banco,'accountType',case lower(a.tipo_cuenta) when 'ahorros' then 'Ahorros'
        when 'corriente' then 'Corriente' when 'billetera digital' then 'Billetera digital'
        else a.tipo_cuenta end,'number',a.numero_cuenta,'verified',coalesce(a.validada,false)) data
    from public.liquidation_beneficiaries b
    left join public.beneficiary_bank_accounts a on a.beneficiary_id=b.id and a.activo
    where b.activo
    union all
    select jsonb_build_object('key','template:'||t.id::text,'templateId',t.id,'name',t.beneficiary,
      'document',t.beneficiary_document,'destination',t.destination_account,'verified',true)
    from public.financial_recurring_templates t where t.active and t.beneficiary_id is null
  ) x;
  return result;
end $$;

create or replace function kora_private.financial_beneficiary_save(
  p_beneficiary_id uuid,p_account_id uuid,p_name text,p_document text,
  p_bank text,p_account_type text,p_number text,p_template_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.liquidation_beneficiaries%rowtype;
  a public.beneficiary_bank_accounts%rowtype; changed boolean:=false;
  t public.financial_recurring_templates%rowtype;
begin
  if auth.uid() is null or not coalesce(public.es_controlador_financiero(),false) then
    raise exception 'Solo Maite u Oscar pueden guardar beneficiarios de gastos';
  end if;
  p_name:=btrim(coalesce(p_name,'')); p_document:=btrim(coalesce(p_document,''));
  p_bank:=btrim(coalesce(p_bank,'')); p_number:=btrim(coalesce(p_number,''));
  if length(p_name)<3 or p_document !~ '^[0-9.-]{5,20}$'
    or length(p_bank) not between 2 and 60 or position('·' in p_bank)>0
    or coalesce(p_account_type,'') not in ('Ahorros','Corriente','Billetera digital')
    or p_number !~ '^[0-9]{6,20}$' then
    raise exception 'Completa una sola vez nombre, identificación, banco, tipo y número válido';
  end if;
  -- Serialize new-person retries by document; do not duplicate existing people.
  perform pg_advisory_xact_lock(hashtextextended(regexp_replace(p_document,'[^0-9]','','g'),0));
  if p_beneficiary_id is not null then
    select * into b from public.liquidation_beneficiaries where id=p_beneficiary_id for update;
    if not found or not b.activo then raise exception 'La persona ya no está activa. Actualiza la lista'; end if;
  else
    if (select count(*) from public.liquidation_beneficiaries
      where regexp_replace(identificacion,'[^0-9]','','g')=regexp_replace(p_document,'[^0-9]','','g'))>1 then
      raise exception 'Hay varias fichas con esta identificación. Selecciona la persona existente';
    end if;
    select * into b from public.liquidation_beneficiaries
      where regexp_replace(identificacion,'[^0-9]','','g')=regexp_replace(p_document,'[^0-9]','','g') for update;
    if found and not b.activo then raise exception 'La persona existe pero está inactiva'; end if;
  end if;
  if b.id is null then
    insert into public.liquidation_beneficiaries(tipo,nombre,identificacion,activo)
      values('otro',p_name,p_document,true) returning * into b;
    changed:=true;
  else
    if lower(btrim(b.nombre))<>lower(p_name) or
      (b.identificacion ~ '^[0-9.-]{5,20}$' and
       regexp_replace(b.identificacion,'[^0-9]','','g')<>regexp_replace(p_document,'[^0-9]','','g')) then
      raise exception 'La ficha cambió o pertenece a otra persona. Actualiza y selecciónala de nuevo';
    end if;
    if coalesce(b.identificacion,'') !~ '^[0-9.-]{5,20}$' then
      if exists(select 1 from public.liquidation_beneficiaries where id<>b.id
        and regexp_replace(identificacion,'[^0-9]','','g')=regexp_replace(p_document,'[^0-9]','','g')) then
        raise exception 'Esa identificación ya tiene una ficha. Selecciona la persona existente';
      end if;
      update public.liquidation_beneficiaries set identificacion=p_document where id=b.id returning * into b;
      changed:=true;
    end if;
  end if;
  if p_account_id is not null then
    select * into a from public.beneficiary_bank_accounts where id=p_account_id for update;
    if not found or a.beneficiary_id<>b.id or not a.activo then
      raise exception 'La cuenta ya no está disponible para esta persona'; end if;
  else
    select * into a from public.beneficiary_bank_accounts
      where beneficiary_id=b.id and numero_cuenta=p_number for update;
    if found and not a.activo then raise exception 'La cuenta está inactiva'; end if;
    if a.id is null and exists(select 1 from public.beneficiary_bank_accounts where beneficiary_id=b.id) then
      raise exception 'La persona ya tiene cuenta. Selecciónala; no cambies su destino desde un gasto';
    end if;
  end if;
  if a.id is null then
    insert into public.beneficiary_bank_accounts(beneficiary_id,banco,tipo_cuenta,numero_cuenta,
      validada,validada_por,validada_at,activo)
      values(b.id,p_bank,lower(p_account_type),p_number,true,auth.uid(),now(),true) returning * into a;
    changed:=true;
  else
    if (length(btrim(coalesce(a.banco,'')))>0 and lower(a.banco)<>lower(p_bank))
      or (length(btrim(coalesce(a.tipo_cuenta,'')))>0 and lower(a.tipo_cuenta)<>lower(p_account_type))
      or (length(btrim(coalesce(a.numero_cuenta,'')))>0 and a.numero_cuenta<>p_number) then
      raise exception 'La cuenta cambió. Actualiza la ficha; los pagos autorizados conservan su destino';
    end if;
    if not a.validada or a.banco='' or a.tipo_cuenta='' or a.numero_cuenta='' then
      update public.beneficiary_bank_accounts set banco=p_bank,tipo_cuenta=lower(p_account_type),
        numero_cuenta=p_number,validada=true,validada_por=auth.uid(),validada_at=now()
        where id=a.id returning * into a;
      changed:=true;
    end if;
  end if;
  if p_template_id is not null then
    select * into t from public.financial_recurring_templates where id=p_template_id for update;
    if not found or lower(btrim(t.beneficiary))<>lower(p_name)
      or (coalesce(t.beneficiary_document,'') ~ '^[0-9.-]{5,20}$' and
        regexp_replace(t.beneficiary_document,'[^0-9]','','g')<>regexp_replace(p_document,'[^0-9]','','g')) then
      raise exception 'La obligación cambió. Actualiza antes de vincular su ficha';
    end if;
    if t.beneficiary_id is not null and (t.beneficiary_id<>b.id or t.bank_account_id<>a.id) then
      raise exception 'La obligación ya está vinculada a otra ficha';
    end if;
    if coalesce(t.destination_account,'') ~ '^[0-9]{6,20}$' and t.destination_account<>p_number then
      raise exception 'El número de cuenta no coincide con la ficha guardada'; end if;
    if split_part(coalesce(t.destination_account,''),' · ',3) ~ '^[0-9]{6,20}$'
      and (split_part(t.destination_account,' · ',3)<>p_number
        or lower(split_part(t.destination_account,' · ',1))<>lower(p_bank)
        or lower(split_part(t.destination_account,' · ',2))<>lower(p_account_type)) then
      raise exception 'El destino no coincide con la ficha guardada'; end if;
    -- Metadata only. Preserve previous destination snapshots, approval and amount.
    update public.financial_recurring_templates set beneficiary_id=b.id,bank_account_id=a.id
      where id=t.id and beneficiary_id is null;
    changed:=changed or found;
  end if;
  if changed then
    insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
      values(auth.uid()::text,'beneficiario_gasto_guardado','liquidation_beneficiaries',b.id::text,
        jsonb_build_object('cuenta_id',a.id,'sin_modificar_pagos',true));
  end if;
  return jsonb_build_object('beneficiaryId',b.id,'accountId',a.id,'key',b.id::text||':'||a.id::text,
    'name',b.nombre,'document',b.identificacion,'bank',a.banco,'accountType',p_account_type,
    'number',a.numero_cuenta,'verified',true);
end $$;

create or replace function public.financial_beneficiaries_list() returns jsonb
language sql security invoker set search_path='' as $$select kora_private.financial_beneficiaries_list()$$;
create function public.financial_beneficiary_save(p_beneficiary_id uuid,p_account_id uuid,
  p_name text,p_document text,p_bank text,p_account_type text,p_number text,p_template_id uuid default null)
returns jsonb language sql security invoker set search_path='' as $$
  select kora_private.financial_beneficiary_save($1,$2,$3,$4,$5,$6,$7,$8)
$$;
revoke all on function kora_private.financial_beneficiaries_list(),public.financial_beneficiaries_list(),
  kora_private.financial_beneficiary_save(uuid,uuid,text,text,text,text,text,uuid),
  public.financial_beneficiary_save(uuid,uuid,text,text,text,text,text,uuid) from public,anon;
grant execute on function kora_private.financial_beneficiaries_list(),public.financial_beneficiaries_list(),
  kora_private.financial_beneficiary_save(uuid,uuid,text,text,text,text,text,uuid),
  public.financial_beneficiary_save(uuid,uuid,text,text,text,text,text,uuid) to authenticated;
