-- Payment destinations are prepared by Maite and confirmed by Oscar after an
-- existing payment approval. This never pays an item or changes its amount.
alter table public.aliados_gastos_operativos
  add column if not exists beneficiario_documento text;
alter table public.treasury_movements
  add column if not exists beneficiary_document text;

create table public.payment_destination_corrections (
  id uuid primary key default gen_random_uuid(),
  item_kind text not null check (item_kind in ('financial_entry','treasury_movement')),
  item_id uuid not null,
  original_beneficiary text not null,
  original_amount numeric(18,2) not null,
  original_document text,
  original_account text,
  proposed_document text not null,
  proposed_account text not null,
  status text not null default 'pendiente' check (status in ('pendiente','confirmado','rechazado')),
  prepared_by uuid not null references public.perfiles(id),
  prepared_at timestamptz not null default now(),
  decided_by uuid references public.perfiles(id),
  decided_at timestamptz,
  rejection_reason text
);
create unique index payment_destination_one_pending
  on public.payment_destination_corrections(item_kind,item_id) where status='pendiente';
create index payment_destination_recent
  on public.payment_destination_corrections(prepared_at desc);
alter table public.payment_destination_corrections enable row level security;
revoke all on public.payment_destination_corrections from public,anon,authenticated;
grant select on public.payment_destination_corrections to authenticated;
create policy payment_destination_controllers_read on public.payment_destination_corrections
  for select to authenticated using ((select public.es_controlador_financiero()));

create function public.payment_destination_prepare(
  p_kind text,p_item_id uuid,p_document text,p_bank text,p_account_type text,p_number text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_beneficiary text;v_amount numeric;v_document text;v_account text;v_status text;
  v_approved uuid;v_paid uuid;v_paid_at timestamptz;v_support text;v_new_account text;v_id uuid;
begin
  if auth.uid() is distinct from 'd1782db6-bacc-4caf-af6f-ce1b8d1c0391'::uuid
    or not exists(select 1 from public.perfiles where id=auth.uid() and activo and rol='auditoria')
  then raise exception 'Solo Maite puede preparar destinos de pago'; end if;
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
  else
    select beneficiary,amount,beneficiary_document,destination_account,status,authorized_by,paid_by,support_path
      into v_beneficiary,v_amount,v_document,v_account,v_status,v_approved,v_paid,v_support
      from public.treasury_movements where id=p_item_id for update;
    if not found or v_status<>'programado' or v_approved is null or v_paid is not null or v_support is not null then
      raise exception 'El movimiento no está autorizado y pendiente de pago'; end if;
  end if;
  if v_document is not distinct from btrim(p_document) and v_account is not distinct from v_new_account then
    raise exception 'El destino ya coincide; no requiere corrección'; end if;
  insert into public.payment_destination_corrections(
    item_kind,item_id,original_beneficiary,original_amount,original_document,original_account,
    proposed_document,proposed_account,prepared_by
  ) values (p_kind,p_item_id,v_beneficiary,v_amount,v_document,v_account,
    btrim(p_document),v_new_account,auth.uid()) returning id into v_id;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(auth.uid()::text,'destino_pago_preparado','payment_destination_corrections',v_id::text,
      jsonb_build_object('tipo',p_kind,'pago_id',p_item_id,'anterior',v_account,'propuesto',v_new_account));
  return jsonb_build_object('id',v_id,'status','pendiente');
end $$;
revoke all on function public.payment_destination_prepare(text,uuid,text,text,text,text) from public,anon;
grant execute on function public.payment_destination_prepare(text,uuid,text,text,text,text) to authenticated;

create function public.payment_destination_decide(
  p_id uuid,p_approve boolean,p_reason text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.payment_destination_corrections%rowtype;r public.financial_entries%rowtype;
  m public.treasury_movements%rowtype;
begin
  if auth.uid() is distinct from '6de0ad26-64af-4966-8cd9-d468880af627'::uuid
    or not exists(select 1 from public.perfiles where id=auth.uid() and activo and rol='gerencia')
  then raise exception 'Solo Oscar puede confirmar destinos de pago'; end if;
  select * into v from public.payment_destination_corrections where id=p_id for update;
  if not found then raise exception 'Solicitud de destino no encontrada'; end if;
  if v.status<>'pendiente' then return jsonb_build_object('id',v.id,'status',v.status,'ya_decidido',true); end if;
  if not coalesce(p_approve,false) then
    if length(btrim(coalesce(p_reason,'')))<10 then raise exception 'Indica el motivo del rechazo'; end if;
    update public.payment_destination_corrections set status='rechazado',decided_by=auth.uid(),
      decided_at=now(),rejection_reason=btrim(p_reason) where id=v.id;
  elsif v.item_kind='financial_entry' then
    select * into r from public.financial_entries where id=v.item_id for update;
    if not found or r.status<>'aprobado' or r.approved_by is null or r.paid_at is not null
      or r.support_path is not null or r.beneficiary is distinct from v.original_beneficiary
      or r.amount is distinct from v.original_amount or r.beneficiary_document is distinct from v.original_document
      or r.destination_account is distinct from v.original_account
    then raise exception 'El pago cambió desde la propuesta; Maite debe revisarlo de nuevo'; end if;
    update public.financial_entries set beneficiary_document=v.proposed_document,
      destination_account=v.proposed_account,updated_at=now() where id=r.id;
    update public.payment_destination_corrections set status='confirmado',decided_by=auth.uid(),decided_at=now() where id=v.id;
  else
    select * into m from public.treasury_movements where id=v.item_id for update;
    if not found or m.status<>'programado' or m.authorized_by is null or m.paid_by is not null
      or m.support_path is not null or m.beneficiary is distinct from v.original_beneficiary
      or m.amount is distinct from v.original_amount or m.beneficiary_document is distinct from v.original_document
      or m.destination_account is distinct from v.original_account
    then raise exception 'El pago cambió desde la propuesta; Maite debe revisarlo de nuevo'; end if;
    update public.treasury_movements set beneficiary_document=v.proposed_document,
      destination_account=v.proposed_account,updated_at=now() where id=m.id;
    if m.aliados_gasto_id is not null then
      update public.aliados_gastos_operativos set beneficiario_documento=v.proposed_document,
        cuenta_destino=v.proposed_account,updated_at=now() where id=m.aliados_gasto_id;
    end if;
    update public.payment_destination_corrections set status='confirmado',decided_by=auth.uid(),decided_at=now() where id=v.id;
  end if;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(auth.uid()::text,case when p_approve then 'destino_pago_confirmado' else 'destino_pago_rechazado' end,
      'payment_destination_corrections',v.id::text,
      jsonb_build_object('tipo',v.item_kind,'pago_id',v.item_id,'anterior',v.original_account,
        'propuesto',v.proposed_account,'preparado_por',v.prepared_by));
  return jsonb_build_object('id',v.id,'status',case when p_approve then 'confirmado' else 'rechazado' end,
    'ya_decidido',false);
end $$;
revoke all on function public.payment_destination_decide(uuid,boolean,text) from public,anon;
grant execute on function public.payment_destination_decide(uuid,boolean,text) to authenticated;

-- New forms capture every payment field before approval; the legacy RPC stays
-- callable temporarily for already-open browser tabs, whose rows remain gated.
create function public.aliados_registrar_gasto_v2(
  p_fecha date,p_plataforma text,p_origen_codigo text,p_concepto text,p_descripcion text,
  p_valor numeric,p_beneficiario text,p_documento text,p_banco text,p_tipo_cuenta text,
  p_numero_cuenta text,p_soporte_path text
) returns public.aliados_gastos_operativos language plpgsql security definer set search_path='' as $$
declare v public.aliados_gastos_operativos%rowtype;v_destino text;
begin
  if not public.tiene_capacidad_aliados('revisor') then raise exception 'No autorizado para registrar gastos de Aliados'; end if;
  if length(btrim(coalesce(p_beneficiario,'')))<3 or btrim(coalesce(p_documento,'')) !~ '^[0-9.-]{5,20}$'
    or length(btrim(coalesce(p_banco,''))) not between 2 and 60 or position('·' in coalesce(p_banco,''))>0
    or coalesce(p_tipo_cuenta,'') not in ('Ahorros','Corriente','Billetera digital')
    or btrim(coalesce(p_numero_cuenta,'')) !~ '^[0-9]{6,20}$'
  then raise exception 'Completa beneficiario, identificación y destino bancario'; end if;
  v_destino:=btrim(p_banco)||' · '||p_tipo_cuenta||' · '||btrim(p_numero_cuenta);
  insert into public.aliados_gastos_operativos(
    fecha,plataforma,origen_codigo,concepto,descripcion,valor,beneficiario,
    beneficiario_documento,cuenta_destino,soporte_path,registrado_por
  ) values (coalesce(p_fecha,current_date),nullif(p_plataforma,''),nullif(btrim(p_origen_codigo),''),
    btrim(p_concepto),nullif(btrim(p_descripcion),''),p_valor,btrim(p_beneficiario),
    btrim(p_documento),v_destino,nullif(btrim(p_soporte_path),''),auth.uid()) returning * into v;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(auth.uid()::text,'aliados_gasto_registrado','aliados_gastos_operativos',v.id::text,to_jsonb(v));
  return v;
end $$;
revoke all on function public.aliados_registrar_gasto_v2(date,text,text,text,text,numeric,text,text,text,text,text,text) from public,anon;
grant execute on function public.aliados_registrar_gasto_v2(date,text,text,text,text,numeric,text,text,text,text,text,text) to authenticated;

create or replace function public.aliados_decidir_gasto(p_id uuid,p_estado text)
returns public.aliados_gastos_operativos language plpgsql security definer set search_path='' as $$
declare v public.aliados_gastos_operativos%rowtype;m public.treasury_movements%rowtype;
begin
  if not public.tiene_capacidad_aliados('aprobador') then raise exception 'Solo Gerencia puede aprobar o rechazar gastos'; end if;
  if p_estado not in ('aprobado','rechazado','anulado') then raise exception 'Estado no permitido'; end if;
  select * into v from public.aliados_gastos_operativos where id=p_id for update;
  if not found or v.estado<>'pendiente' then raise exception 'Gasto no encontrado o ya decidido'; end if;
  if p_estado='aprobado' and (nullif(btrim(coalesce(v.beneficiario,'')),'') is null
    or nullif(btrim(coalesce(v.cuenta_destino,'')),'') is null) then
    raise exception 'El gasto no tiene beneficiario o cuenta destino'; end if;
  update public.aliados_gastos_operativos set estado=p_estado,aprobado_por=auth.uid(),
    aprobado_at=now(),updated_at=now() where id=p_id returning * into v;
  if p_estado='aprobado' then
    insert into public.treasury_movements(unit,direction,type,beneficiary,beneficiary_document,
      concept,amount,destination_account,movement_date,status,requested_by,idempotency_key,aliados_gasto_id)
    values('tercerizacion','debit','gasto_administrativo',v.beneficiario,v.beneficiario_documento,
      'Gasto Aliados — '||v.concepto,v.valor,v.cuenta_destino,v.fecha,'pendiente',v.registrado_por,
      'aliados-gasto:'||v.id,v.id)
    on conflict (idempotency_key) do update set updated_at=now() returning * into m;
    update public.aliados_gastos_operativos set treasury_movement_id=m.id where id=v.id returning * into v;
  end if;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(auth.uid()::text,'aliados_gasto_'||p_estado,'aliados_gastos_operativos',v.id::text,
      to_jsonb(v)||jsonb_build_object('treasury_movement_id',m.id));
  return v;
end $$;

-- A bank support cannot close one of these external payments while its
-- beneficiary destination is still incomplete. Historical paid rows stay put.
create function public.payment_destination_guard_paid()
returns trigger language plpgsql set search_path='' as $$
declare v_account text;v_document text;
begin
  if tg_table_name='financial_entries' then
    if new.entry_type='retiro_utilidad' and new.business_unit='retail' then return new; end if;
    v_account:=new.destination_account;v_document:=new.beneficiary_document;
  else
    if new.aliados_gasto_id is null then return new; end if;
    v_account:=new.destination_account;v_document:=new.beneficiary_document;
  end if;
  if exists(select 1 from public.payment_destination_corrections
    where item_id=new.id and item_kind=case when tg_table_name='financial_entries'
      then 'financial_entry' else 'treasury_movement' end and status='pendiente')
  then raise exception 'El destino tiene una propuesta pendiente de confirmación de Gerencia'; end if;
  if btrim(coalesce(v_document,'')) !~ '^[0-9.-]{5,20}$'
    or split_part(coalesce(v_account,''),' · ',1)=''
    or split_part(coalesce(v_account,''),' · ',2) not in ('Ahorros','Corriente','Billetera digital')
    or split_part(coalesce(v_account,''),' · ',3) !~ '^[0-9]{6,20}$'
    or array_length(string_to_array(coalesce(v_account,''),' · '),1)<>3
  then raise exception 'Completa y confirma identificación, banco, tipo y número antes de registrar el pago'; end if;
  return new;
end $$;
create trigger financial_entry_destination_before_paid
  before update on public.financial_entries for each row
  when (new.status='pagado' and old.status is distinct from new.status)
  execute function public.payment_destination_guard_paid();
create trigger treasury_expense_destination_before_paid
  before update on public.treasury_movements for each row
  when (new.status='pagado' and old.status is distinct from new.status)
  execute function public.payment_destination_guard_paid();
