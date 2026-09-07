CREATE OR REPLACE FUNCTION public.aliados_impedir_cambio_aprobado()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
 if old.frozen_at is not null and (old.plataforma,old.periodo_desde,old.periodo_hasta,old.fecha_corte,old.total_operaciones,old.total_pago_aliados,old.total_bonos,old.total_utilidad_creditek,old.total_pagar)
   is distinct from (new.plataforma,new.periodo_desde,new.periodo_hasta,new.fecha_corte,new.total_operaciones,new.total_pago_aliados,new.total_bonos,new.total_utilidad_creditek,new.total_pagar)
 then raise exception 'Liquidación aprobada inmutable; use ajuste o reversión formal'; end if;return new;
end; $function$;

CREATE OR REPLACE FUNCTION public.aliados_impedir_cambio_operacion_aprobada()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
 if exists(select 1 from public.liquidations where id=old.liquidation_id and frozen_at is not null) then raise exception 'Liquidación aprobada inmutable; los snapshots no pueden cambiar';end if;
 if TG_OP = 'DELETE' then return old; else return new; end if;
end;
$function$;

create trigger frozen_operations before update or delete on public.liquidation_operations for each row execute function public.aliados_impedir_cambio_operacion_aprobada();
create trigger frozen_batch before update on public.liquidations for each row execute function public.aliados_impedir_cambio_aprobado();
CREATE OR REPLACE FUNCTION public.proteger_destino_pago() RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $function$
begin
 if (new.bank_account_id is distinct from old.bank_account_id or new.bank_snapshot is distinct from old.bank_snapshot or new.beneficiary_id is distinct from old.beneficiary_id)
 and (old.authorized_by is not null or old.estado in ('programado','pagado','conciliado') or exists(select 1 from public.liquidations where id=old.liquidation_id and frozen_at is not null)) then
 raise exception 'La orden ya fue autorizada o cerrada. Editar el cliente no cambia su cuenta de destino'; end if;
 return new;
end $function$;
create trigger frozen_destination before update on public.payment_orders for each row execute function public.proteger_destino_pago();
