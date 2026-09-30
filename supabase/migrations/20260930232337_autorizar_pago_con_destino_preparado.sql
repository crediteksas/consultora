-- Maite already prepared the destination. Oscar's single decision authorizes
-- the payment against that exact destination; it never executes a transfer.
create or replace function public.payment_destination_decide(
  p_id uuid,p_approve boolean,p_reason text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.payment_destination_corrections%rowtype;r public.financial_entries%rowtype;
  m public.treasury_movements%rowtype;v_previous_authorization timestamptz;
begin
  if auth.uid() is distinct from '6de0ad26-64af-4966-8cd9-d468880af627'::uuid
    or not exists(select 1 from public.perfiles where id=auth.uid() and activo and rol='gerencia')
  then raise exception 'Solo Oscar puede autorizar pagos con destino preparado'; end if;
  select * into v from public.payment_destination_corrections where id=p_id for update;
  if not found then raise exception 'Solicitud de destino no encontrada'; end if;
  if v.status<>'pendiente' then return jsonb_build_object('id',v.id,'status',v.status,'ya_decidido',true); end if;
  if not coalesce(p_approve,false) then
    if length(btrim(coalesce(p_reason,'')))<10 then raise exception 'Indica el motivo del rechazo'; end if;
    update public.payment_destination_corrections set status='rechazado',decided_by=auth.uid(),
      decided_at=now(),rejection_reason=btrim(p_reason) where id=v.id;
  elsif v.item_kind='financial_entry' then
    select * into r from public.financial_entries where id=v.item_id for update;
    if not found or r.status<>'aprobado' or r.approved_by is null or r.approved_at is null
      or r.paid_by is not null or r.paid_at is not null or r.support_path is not null
      or r.beneficiary is distinct from v.original_beneficiary
      or r.amount is distinct from v.original_amount or r.beneficiary_document is distinct from v.original_document
      or r.destination_account is distinct from v.original_account
    then raise exception 'La orden cambió o ya fue pagada; no se autorizó'; end if;
    v_previous_authorization:=r.approved_at;
    update public.financial_entries set beneficiary_document=v.proposed_document,
      destination_account=v.proposed_account,approved_by=auth.uid(),approved_at=now(),updated_at=now()
      where id=r.id;
    update public.payment_destination_corrections set status='confirmado',decided_by=auth.uid(),decided_at=now() where id=v.id;
  else
    select * into m from public.treasury_movements where id=v.item_id for update;
    if not found or m.status<>'programado' or m.authorized_by is null or m.paid_by is not null
      or m.support_path is not null or m.beneficiary is distinct from v.original_beneficiary
      or m.amount is distinct from v.original_amount or m.beneficiary_document is distinct from v.original_document
      or m.destination_account is distinct from v.original_account
    then raise exception 'La orden cambió o ya fue pagada; no se autorizó'; end if;
    update public.treasury_movements set beneficiary_document=v.proposed_document,
      destination_account=v.proposed_account,authorized_by=auth.uid(),updated_at=now() where id=m.id;
    if m.aliados_gasto_id is not null then
      update public.aliados_gastos_operativos set beneficiario_documento=v.proposed_document,
        cuenta_destino=v.proposed_account,updated_at=now() where id=m.aliados_gasto_id;
    end if;
    update public.payment_destination_corrections set status='confirmado',decided_by=auth.uid(),decided_at=now() where id=v.id;
  end if;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(auth.uid()::text,
      case when p_approve then 'pago_reautorizado_con_destino_preparado' else 'destino_pago_rechazado' end,
      'payment_destination_corrections',v.id::text,
      jsonb_build_object('tipo',v.item_kind,'pago_id',v.item_id,'valor',v.original_amount,
        'anterior',v.original_account,'destino_autorizado',v.proposed_account,
        'preparado_por',v.prepared_by,'autorizacion_anterior',v_previous_authorization,
        'sin_giro',true));
  return jsonb_build_object('id',v.id,'status',case when p_approve then 'confirmado' else 'rechazado' end,
    'ya_decidido',false,'sin_giro',true);
end $$;
revoke all on function public.payment_destination_decide(uuid,boolean,text) from public,anon;
grant execute on function public.payment_destination_decide(uuid,boolean,text) to authenticated;
