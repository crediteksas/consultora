create function tesoreria_cuentas_private.vincular_orden(p_orden uuid,p_cuenta uuid)
returns public.payment_orders language plpgsql security definer set search_path='' as $$
declare p public.payment_orders; a public.beneficiary_bank_accounts; b public.liquidation_beneficiaries;
begin
 if auth.uid() is null or not coalesce(public.tiene_capacidad_aliados('revisor'),false) then raise exception 'No autorizado';end if;
 select * into p from public.payment_orders where id=p_orden for update;
 if not found then raise exception 'Orden no encontrada';end if;
 if p.estado<>'pendiente' or p.authorized_by is not null or p.authorized_at is not null then raise exception 'Solo se completa una orden pendiente sin autorizar';end if;
 if p.bank_account_id is not null or p.bank_snapshot is not null then raise exception 'La orden ya tiene destino; no se reemplaza';end if;
 select * into a from public.beneficiary_bank_accounts where id=p_cuenta and beneficiary_id=p.beneficiary_id and activo and validada for share;
 if not found then raise exception 'Selecciona una cuenta validada del mismo beneficiario';end if;
 select * into b from public.liquidation_beneficiaries where id=p.beneficiary_id;
 if nullif(btrim(b.identificacion),'') is null or nullif(btrim(a.numero_cuenta),'') is null then raise exception 'Faltan datos del titular o cuenta';end if;
 update public.payment_orders set bank_account_id=a.id,bank_snapshot=jsonb_build_object('bank',a.banco,'account_type',a.tipo_cuenta,'account_number',a.numero_cuenta,'holder',b.nombre,'holder_identification',b.identificacion) where id=p.id returning * into p;
 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),'cuenta_validada_vinculada_orden','payment_orders',p.id,jsonb_build_object('cuenta_id',a.id,'sin_autorizar',true,'valor_sin_cambios',p.valor));
 return p;
end$$;
revoke all on function tesoreria_cuentas_private.vincular_orden(uuid,uuid) from public,anon;
grant execute on function tesoreria_cuentas_private.vincular_orden(uuid,uuid) to authenticated;
create function public.tesoreria_vincular_cuenta_orden(p_orden uuid,p_cuenta uuid)
returns public.payment_orders language sql security invoker set search_path='' as $$select tesoreria_cuentas_private.vincular_orden(p_orden,p_cuenta)$$;
revoke all on function public.tesoreria_vincular_cuenta_orden(uuid,uuid) from public,anon;
grant execute on function public.tesoreria_vincular_cuenta_orden(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
