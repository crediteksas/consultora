-- Authorized by Gerencia on 2026-09-30: apply only Maite's seven unchanged,
-- unpaid preparations. No amount, bank account, payment state or paid history
-- is created or modified beyond the prepared beneficiary data.

-- Allow correction of a provisional *identification* in a programmed order.
-- The original bank account, holder, beneficiary, amount and approval stay put.
create or replace function public.proteger_destino_pago()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_cuenta_valida boolean;v_documento text;
begin
  if new.bank_account_id is not distinct from old.bank_account_id
    and new.bank_snapshot is not distinct from old.bank_snapshot
    and new.beneficiary_id is not distinct from old.beneficiary_id then return new; end if;
  select exists(select 1 from public.beneficiary_bank_accounts cuenta
    where cuenta.id=new.bank_account_id and cuenta.beneficiary_id=old.beneficiary_id
      and cuenta.activo and cuenta.validada) into v_cuenta_valida;
  if public.es_editor_cuenta_destino() and old.estado='pendiente'
    and old.authorized_by is null and old.authorized_at is null
    and old.paid_by is null and old.fecha_pagada is null
    and nullif(btrim(old.soporte_path),'') is null
    and new.beneficiary_id=old.beneficiary_id and v_cuenta_valida then return new; end if;
  select identificacion into v_documento from public.liquidation_beneficiaries where id=old.beneficiary_id;
  if old.estado='programado' and old.paid_by is null and old.fecha_pagada is null
    and nullif(btrim(old.soporte_path),'') is null
    and old.bank_account_id is not distinct from new.bank_account_id
    and old.beneficiary_id is not distinct from new.beneficiary_id
    and old.bank_snapshot - 'holder_identification' = new.bank_snapshot - 'holder_identification'
    and coalesce(old.bank_snapshot->>'holder_identification','') !~ '^[0-9.-]{5,20}$'
    and new.bank_snapshot->>'holder_identification'=v_documento
    and v_documento ~ '^[0-9.-]{5,20}$' and v_cuenta_valida then return new; end if;
  raise exception 'La orden ya fue autorizada o cerrada. La cuenta histórica no se puede reemplazar';
end $$;

-- From now on Maite's save writes the beneficiary details directly to the
-- still-unpaid item. It does not authorize a payment or create a bank debit.
create or replace function public.payment_destination_prepare(
  p_kind text,p_item_id uuid,p_document text,p_bank text,p_account_type text,p_number text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_beneficiary text;v_amount numeric;v_document text;v_account text;v_status text;
  v_approved uuid;v_paid uuid;v_paid_at timestamptz;v_support text;v_new_account text;
begin
  if auth.uid() is distinct from 'd1782db6-bacc-4caf-af6f-ce1b8d1c0391'::uuid
    or not exists(select 1 from public.perfiles where id=auth.uid() and activo and rol='auditoria')
  then raise exception 'Solo Maite puede guardar datos del beneficiario'; end if;
  if p_kind not in ('financial_entry','treasury_movement') or p_item_id is null then
    raise exception 'Selecciona un pago válido'; end if;
  if btrim(coalesce(p_document,'')) !~ '^[0-9.-]{5,20}$'
    or length(btrim(coalesce(p_bank,''))) not between 2 and 60
    or position('·' in coalesce(p_bank,''))>0
    or coalesce(p_account_type,'') not in ('Ahorros','Corriente','Billetera digital')
    or btrim(coalesce(p_number,'')) !~ '^[0-9]{6,20}$'
  then raise exception 'Completa identificación, banco o billetera, tipo y número válido'; end if;
  v_new_account:=btrim(p_bank)||' · '||p_account_type||' · '||btrim(p_number);
  if p_kind='financial_entry' then
    select beneficiary,amount,beneficiary_document,destination_account,status,approved_by,paid_by,paid_at,support_path
      into v_beneficiary,v_amount,v_document,v_account,v_status,v_approved,v_paid,v_paid_at,v_support
      from public.financial_entries where id=p_item_id for update;
    if not found or v_status<>'aprobado' or v_approved is null or v_paid is not null
      or v_paid_at is not null or v_support is not null then
      raise exception 'El gasto no está aprobado y pendiente de pago'; end if;
    if coalesce(v_document,'') ~ '^[0-9.-]{5,20}$'
      and coalesce(v_account,'') ~ '^.+ · (Ahorros|Corriente|Billetera digital) · [0-9]{6,20}$' then
      raise exception 'El destino completo de un pago autorizado no se reemplaza aquí'; end if;
    update public.financial_entries set beneficiary_document=btrim(p_document),
      destination_account=v_new_account,updated_at=now() where id=p_item_id;
  else
    select beneficiary,amount,beneficiary_document,destination_account,status,authorized_by,paid_by,support_path
      into v_beneficiary,v_amount,v_document,v_account,v_status,v_approved,v_paid,v_support
      from public.treasury_movements where id=p_item_id for update;
    if not found or v_status<>'programado' or v_approved is null or v_paid is not null or v_support is not null then
      raise exception 'El movimiento no está autorizado y pendiente de pago'; end if;
    if coalesce(v_document,'') ~ '^[0-9.-]{5,20}$'
      and coalesce(v_account,'') ~ '^.+ · (Ahorros|Corriente|Billetera digital) · [0-9]{6,20}$' then
      raise exception 'El destino completo de un pago autorizado no se reemplaza aquí'; end if;
    update public.treasury_movements set beneficiary_document=btrim(p_document),
      destination_account=v_new_account,updated_at=now() where id=p_item_id;
    update public.aliados_gastos_operativos set beneficiario_documento=btrim(p_document),
      cuenta_destino=v_new_account,updated_at=now()
      where id=(select aliados_gasto_id from public.treasury_movements where id=p_item_id)
        and estado='aprobado';
  end if;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(auth.uid()::text,'datos_pago_guardados_sin_aprobacion_destino',
      case when p_kind='financial_entry' then 'financial_entries' else 'treasury_movements' end,
      p_item_id::text,jsonb_build_object('beneficiario',v_beneficiary,'valor',v_amount,
        'documento_anterior',v_document,'cuenta_anterior',v_account,
        'documento_nuevo',btrim(p_document),'cuenta_nueva',v_new_account,'sin_giro',true));
  return jsonb_build_object('id',p_item_id,'status','guardado','sin_giro',true);
end $$;
revoke all on function public.payment_destination_prepare(text,uuid,text,text,text,text) from public,anon;
grant execute on function public.payment_destination_prepare(text,uuid,text,text,text,text) to authenticated;
-- The extra Gerencia confirmation introduced in error cannot be called again.
revoke all on function public.payment_destination_decide(uuid,boolean,text)
  from public,anon,authenticated;

-- Keep each existing account record separate; a person may have several.
-- The selected account ID is stored on each new obligation. This change does
-- not rewrite authorized, paid or historical destinations.
do $$
declare v_before text;v_after text;v_block text:=E'    if a.id is null and exists(select 1 from public.beneficiary_bank_accounts where beneficiary_id=b.id) then\n      raise exception ''La persona ya tiene cuenta. Selecciónala; no cambies su destino desde un gasto'';\n    end if;\n';
begin
  v_before:=pg_get_functiondef('kora_private.financial_beneficiary_save(uuid,uuid,text,text,text,text,text,uuid)'::regprocedure);
  if position(v_block in v_before)=0 then raise exception 'Cambió la protección de múltiples cuentas; revisar antes de aplicar'; end if;
  v_after:=replace(v_before,v_block,'');
  execute v_after;
end $$;
notify pgrst,'reload schema';
revoke all on function public.proteger_destino_pago() from public,anon,authenticated;

do $$
declare c public.payment_destination_corrections%rowtype;r public.financial_entries%rowtype;
  m public.treasury_movements%rowtype;processed integer:=0;
begin
  for c in select * from public.payment_destination_corrections
    where status='pendiente' order by prepared_at for update loop
    if c.item_kind='financial_entry' then
      select * into r from public.financial_entries where id=c.item_id for update;
      if not found or r.status<>'aprobado' or r.approved_by is null
        or r.paid_at is not null or r.paid_by is not null or r.support_path is not null
        or r.beneficiary is distinct from c.original_beneficiary
        or r.amount is distinct from c.original_amount
        or r.beneficiary_document is distinct from c.original_document
        or r.destination_account is distinct from c.original_account then
        raise exception 'El movimiento cambió desde la preparación %',c.id; end if;
      update public.financial_entries set beneficiary_document=c.proposed_document,
        destination_account=c.proposed_account,updated_at=now() where id=r.id;
    else
      select * into m from public.treasury_movements where id=c.item_id for update;
      if not found or m.status<>'programado' or m.authorized_by is null
        or m.paid_by is not null or m.support_path is not null
        or m.beneficiary is distinct from c.original_beneficiary
        or m.amount is distinct from c.original_amount
        or m.beneficiary_document is distinct from c.original_document
        or m.destination_account is distinct from c.original_account then
        raise exception 'El movimiento cambió desde la preparación %',c.id; end if;
      update public.treasury_movements set beneficiary_document=c.proposed_document,
        destination_account=c.proposed_account,updated_at=now() where id=m.id;
      if m.aliados_gasto_id is not null then
        update public.aliados_gastos_operativos set beneficiario_documento=c.proposed_document,
          cuenta_destino=c.proposed_account,updated_at=now()
          where id=m.aliados_gasto_id and estado='aprobado';
      end if;
    end if;
    update public.payment_destination_corrections set status='confirmado',decided_at=now()
      where id=c.id;
    insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
      values(c.prepared_by::text,'datos_beneficiario_preparados_aplicados',
        'payment_destination_corrections',c.id::text,
        jsonb_build_object('pago_id',c.item_id,'valor',c.original_amount,
          'documento_nuevo',c.proposed_document,'cuenta_nueva',c.proposed_account,
          'sin_giro',true));
    processed:=processed+1;
  end loop;
  if processed<>7 then raise exception 'Se esperaban 7 preparaciones sin pagar; encontradas %',processed; end if;
end $$;

do $$
declare e record;fixed integer:=0;orders integer;total_orders integer:=0;
begin
  for e in
    select b.id,b.nombre,b.identificacion old_document,c.proposed_document new_document,
      c.prepared_by,
      a.id account_id,a.numero_cuenta
    from public.liquidation_beneficiaries b
    join public.beneficiary_bank_accounts a on a.beneficiary_id=b.id and a.activo and a.validada
    join public.payment_destination_corrections c
      on split_part(c.proposed_account,' · ',3)=a.numero_cuenta
      and c.status='confirmado' and c.item_kind='financial_entry'
      and c.original_beneficiary in ('MAYTHE','LUIS RIVERA')
    where b.tipo='ejecutivo' and b.nombre in ('Maythe Reyes','Luis Rivera')
      and b.identificacion like 'EJECUTIVO-TEMP-%'
      and c.proposed_document ~ '^[0-9]{5,20}$'
    order by b.id
  loop
    if exists(select 1 from public.liquidation_beneficiaries x
      where x.id<>e.id and regexp_replace(x.identificacion,'[^0-9]','','g')=e.new_document)
    then raise exception 'Documento ya asociado a otro beneficiario'; end if;
    update public.liquidation_beneficiaries set identificacion=e.new_document where id=e.id;
    update public.payment_orders po set
      bank_snapshot=jsonb_set(po.bank_snapshot,'{holder_identification}',to_jsonb(e.new_document),true),
      updated_at=now()
    where po.beneficiary_id=e.id and po.bank_account_id=e.account_id
      and po.estado='programado' and po.paid_by is null and po.fecha_pagada is null
      and nullif(btrim(po.soporte_path),'') is null
      and po.bank_snapshot->>'account_number'=e.numero_cuenta
      and po.bank_snapshot->>'holder_identification'=e.old_document;
    get diagnostics orders=row_count;
    if orders=0 then raise exception 'No hay orden programada para %',e.nombre; end if;
    total_orders:=total_orders+orders;
    insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
      values(e.prepared_by::text,'identificacion_ejecutivo_corregida_desde_datos_maite',
        'liquidation_beneficiaries',e.id::text,
        jsonb_build_object('ordenes_programadas',orders,'documento_anterior',e.old_document,
          'documento_nuevo',e.new_document,'cuenta_final',right(e.numero_cuenta,4),
          'sin_cambio_cuenta',true,'sin_giro',true));
    fixed:=fixed+1;
  end loop;
  if fixed<>2 or total_orders<>3 then
    raise exception 'Se esperaban 2 ejecutivos y 3 órdenes; encontrados % y %',fixed,total_orders;
  end if;
end $$;
