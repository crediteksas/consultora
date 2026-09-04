create or replace function public.aliados_registrar_pago_agrupado(p_ids uuid[],p_soporte_path text)
returns integer
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  first_payment public.payment_orders%rowtype;
  payment_id uuid;
  payment_count integer;
  processed integer:=0;
begin
  if not public.tiene_capacidad_aliados('revisor') then raise exception 'No autorizado para registrar pagos'; end if;
  if coalesce(array_length(p_ids,1),0)<2 or array_length(p_ids,1)>50 then raise exception 'El grupo debe contener entre 2 y 50 órdenes'; end if;
  if nullif(btrim(coalesce(p_soporte_path,'')),'') is null then raise exception 'El soporte es obligatorio'; end if;

  select * into first_payment from public.payment_orders where id=p_ids[1] for update;
  if not found then raise exception 'Pago no encontrado'; end if;

  select count(*) into payment_count
  from public.payment_orders po
  join public.liquidations l on l.id=po.liquidation_id
  where po.id=any(p_ids)
    and po.beneficiary_id=first_payment.beneficiary_id
    and po.estado='programado'
    and po.authorized_by is not null and po.authorized_at is not null
    and po.bank_snapshot is not null
    and po.bank_snapshot->>'account_number'=first_payment.bank_snapshot->>'account_number'
    and l.estado='aprobada' and l.frozen_at is not null;
  if payment_count<>array_length(p_ids,1) then
    raise exception 'Las órdenes deben pertenecer al mismo beneficiario y cuenta, estar autorizadas y tener liquidación aprobada';
  end if;

  foreach payment_id in array p_ids loop
    perform public.aliados_cambiar_estado_pago(payment_id,'pagado',p_soporte_path);
    processed:=processed+1;
  end loop;
  return processed;
end;
$$;

revoke all on function public.aliados_registrar_pago_agrupado(uuid[],text) from public,anon;
grant execute on function public.aliados_registrar_pago_agrupado(uuid[],text) to authenticated;
