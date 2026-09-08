-- Autorizado por Oscar: completar únicamente destinos vacíos pendientes.
-- Completar un destino vacío no equivale a reemplazar una cuenta aprobada.
do $migration$
declare body text;
begin
 body:=pg_get_functiondef('public.proteger_destino_pago()'::regprocedure);
 body:=replace(body,'begin','begin
  if auth.uid() is not null and public.tiene_capacidad_aliados(''revisor'')
    and old.bank_account_id is null and old.authorized_by is null and old.authorized_at is null and old.estado=''pendiente''
    and (to_jsonb(old)-array[''bank_account_id'',''bank_snapshot''])=(to_jsonb(new)-array[''bank_account_id'',''bank_snapshot''])
    and exists(select 1 from public.beneficiary_bank_accounts a where a.id=new.bank_account_id and a.beneficiary_id=old.beneficiary_id and a.activo and a.validada)
  then return new; end if;');
 execute body;
 body:=pg_get_functiondef('kora_private.completar_ordenes_aprobadas(uuid)'::regprocedure);
 body:=replace(body,' perform kora_private.completar_bonos_tesoreria(p_lote);',
 ' update public.payment_orders dest set bank_account_id=acct.id,bank_snapshot=jsonb_build_object(''bank'',acct.banco,''account_type'',acct.tipo_cuenta,''account_number'',acct.numero_cuenta,''holder'',holder.nombre,''holder_identification'',holder.identificacion)
   from public.liquidation_beneficiaries holder join public.beneficiary_bank_accounts acct on acct.beneficiary_id=holder.id
   where dest.liquidation_id=p_lote and dest.beneficiary_id=holder.id and dest.bank_account_id is null and dest.estado=''pendiente'' and dest.authorized_by is null and dest.authorized_at is null
    and acct.id=(select a2.id from public.beneficiary_bank_accounts a2 where a2.beneficiary_id=holder.id and a2.activo and a2.validada order by a2.validada_at desc,a2.id limit 1);
 perform kora_private.completar_bonos_tesoreria(p_lote);');
 execute body;
 body:=pg_get_functiondef('public.tesoreria_generar_destinos_liquidacion(uuid)'::regprocedure);
 body:=replace(body,' insert into public.liquidation_treasury_destinations(',
 ' allies:=coalesce(l.total_pago_aliados,0);executives:=coalesce(l.total_bonos,0);
 insert into public.liquidation_treasury_destinations(');
 execute body;
 body:=pg_get_functiondef('kora_private.completar_bonos_tesoreria(uuid)'::regprocedure);
 body:=replace(body,'  update kora_private.bonos_diferidos d set completed_at=',
 '  update public.liquidation_treasury_destinations set total_executives=total_executives+total_delta where liquidation_id=p_lote;
  update kora_private.bonos_diferidos d set completed_at=');
 execute body;
end;$migration$;
