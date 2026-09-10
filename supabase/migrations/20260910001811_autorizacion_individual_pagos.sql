-- No modifica órdenes, cuentas, importes ni pagos históricos al instalar.
create or replace function kora_private.preparar_pago_autorizado_por_lote(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare p public.payment_orders%rowtype;
begin
 if auth.uid() is null or not coalesce(public.tiene_capacidad_aliados('revisor'),false) then raise exception 'No autorizado'; end if;
 select * into p from public.payment_orders where id=p_id for update;
 if not found then raise exception 'Orden no encontrada'; end if;
 if p.estado not in ('pendiente','programado') or p.historico_inicial then return; end if;
 if not kora_private.pago_con_autorizacion_lote(p_id) then raise exception 'Falta aprobación del lote'; end if;
 if p.authorized_by is null or p.authorized_at is null then raise exception 'Falta autorización individual del pago por Gerencia'; end if;
 if p.valor<=0 or exists(select 1 from unnest(array['bank','account_type','account_number','holder','holder_identification']) k where nullif(btrim(p.bank_snapshot->>k),'') is null) then raise exception 'Completa cuenta y valor en Tesorería'; end if;
end;$$;
revoke all on function kora_private.preparar_pago_autorizado_por_lote(uuid) from public,anon,authenticated;

create or replace function kora_private.exigir_autorizacion_individual_pago()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.estado='pagado' and old.estado is distinct from 'pagado' and not coalesce(old.historico_inicial,false) then
  if old.authorized_by is null or old.authorized_at is null then
   raise exception 'Falta autorización individual del pago por Gerencia';
  end if;
 end if;
 return new;
end;$$;
revoke all on function kora_private.exigir_autorizacion_individual_pago() from public,anon,authenticated;
create trigger exigir_autorizacion_individual_pago
before update of estado on public.payment_orders
for each row execute function kora_private.exigir_autorizacion_individual_pago();
