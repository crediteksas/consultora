begin;
-- Keep the real opening balance nonnegative; only the derived book balance may expose a deficit.
alter table public.banco_creditek_cuentas drop constraint banco_creditek_cuentas_saldo_actual_check;
alter table public.banco_creditek_cuentas add constraint banco_creditek_cuentas_saldo_actual_check
 check (saldo_actual is null or saldo_actual::text not in ('NaN','Infinity','-Infinity'));
create or replace function kora_private.banco_creditek_asentar(
  p_tipo text,p_monto numeric,p_fuente_tabla text,p_fuente_id uuid,
  p_ocurrido_at timestamptz,p_referencia text,p_soporte text,p_usuario uuid
) returns boolean language plpgsql security definer set search_path='' as $$
declare c public.banco_creditek_cuentas%rowtype; v_despues numeric;
begin
  if p_tipo not in ('ingreso_plataforma','pago_aliado','pago_ejecutivo','gasto')
    or p_monto is null or p_monto<=0 or p_fuente_id is null or p_usuario is null
    then raise exception 'Movimiento bancario inválido'; end if;
  select * into c from public.banco_creditek_cuentas
    where numero_cuenta='87600004006' and activa for update;
  if not found then raise exception 'Cuenta Creditek 4006 no disponible'; end if;
  if exists(select 1 from public.banco_creditek_movimientos
    where fuente_tabla=p_fuente_tabla and fuente_id=p_fuente_id) then return false; end if;
  -- Un movimiento anterior al corte ya forma parte del saldo base.
  if c.saldo_actual is null or p_ocurrido_at is null
    or p_ocurrido_at<=coalesce(c.fecha_corte_at,c.fecha_corte::timestamptz) then return false; end if;
  v_despues:=c.saldo_actual + case when p_tipo='ingreso_plataforma' then p_monto else -p_monto end;
  -- Book balance may be negative when a completed payment exposes missing reconciliation.
  if v_despues<0 and p_tipo<>'ingreso_plataforma' and nullif(btrim(p_soporte),'') is null then
    raise exception 'Adjunta el comprobante del giro realizado'; end if;
  insert into public.banco_creditek_movimientos
    (cuenta_id,tipo,monto,saldo_antes,saldo_despues,fecha,referencia,soporte_path,
     registrado_por,fuente_tabla,fuente_id,ocurrido_at)
    values(c.id,p_tipo,p_monto,c.saldo_actual,v_despues,
      (p_ocurrido_at at time zone 'America/Bogota')::date,
      coalesce(nullif(btrim(p_referencia),''),p_fuente_tabla||' '||p_fuente_id::text),
      p_soporte,p_usuario,p_fuente_tabla,p_fuente_id,p_ocurrido_at);
  update public.banco_creditek_cuentas set saldo_actual=v_despues where id=c.id;
  return true;
end $$;
revoke all on function kora_private.banco_creditek_asentar(text,numeric,text,uuid,timestamptz,text,text,uuid)
  from public,anon,authenticated,service_role;


create or replace function public.finanzas_registrar_pago_real(
 p_id uuid,p_support_path text,p_desde_banco_creditek boolean,p_fecha_pago date
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.financial_entries%rowtype; saldo numeric; corte timestamptz; aviso text;
begin
 if auth.uid() is null or not coalesce(public.es_controlador_financiero(),false) then
   raise exception 'Solo Maite u Oscar pueden registrar el pago'; end if;
 if p_fecha_pago is null or not isfinite(p_fecha_pago) or p_fecha_pago>(now() at time zone 'America/Bogota')::date then
   raise exception 'Indica la fecha real del giro, sin fechas futuras'; end if;
 if p_desde_banco_creditek is null then raise exception 'Indica el origen del dinero'; end if;
 if p_support_path is null or p_support_path !~ '^finanzas/[0-9a-f-]{36}[.](pdf|jpg|jpeg|png)$'
   or not exists(select 1 from storage.objects where bucket_id='soportes' and name=p_support_path) then
   raise exception 'Adjunta un comprobante cargado en Finanzas'; end if;
 select * into v from public.financial_entries where id=p_id for update;
 if not found then raise exception 'Movimiento no encontrado'; end if;
 if v.status='pagado' then
   if v.support_path is distinct from p_support_path or v.pagado_desde_banco_creditek is distinct from p_desde_banco_creditek
     or (v.paid_at at time zone 'America/Bogota')::date is distinct from p_fecha_pago then
     raise exception 'El pago ya está registrado con otro soporte, origen o fecha; actualiza antes de continuar'; end if;
 else
   if v.status<>'aprobado' or v.approved_by is null or v.approved_at is null or v.paid_at is not null or v.support_path is not null then
     raise exception 'El movimiento no está aprobado o ya fue pagado'; end if;
   if v.entry_type='retiro_utilidad' and v.business_unit='retail' then raise exception 'Valida los soportes de las tiendas para este retiro'; end if;
   if p_desde_banco_creditek and v.business_unit not in ('aliados','b2b') then raise exception 'Los pagos Retail se registran en su caja'; end if;
   if p_desde_banco_creditek then
     select coalesce(fecha_corte_at,fecha_corte::timestamptz) into corte
       from public.banco_creditek_cuentas where numero_cuenta='87600004006' and activa for update;
     if corte is not null and ((p_fecha_pago+time '12:00') at time zone 'America/Bogota')<=corte then
       raise exception 'El pago es anterior al corte bancario. Revisa su inclusión en la apertura antes de registrarlo; no se modificó el pago ni el saldo';
     end if;
   end if;
   update public.financial_entries set status='pagado',support_path=p_support_path,paid_by=auth.uid(),
     paid_at=(p_fecha_pago+time '12:00') at time zone 'America/Bogota',
     pagado_desde_banco_creditek=p_desde_banco_creditek,updated_at=now()
     where id=p_id returning * into v;
   insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
     values(auth.uid(),'finanzas_pago_registrado','financial_entries',v.id,
       jsonb_build_object('amount',v.amount,'support_path',v.support_path,'fecha_real',p_fecha_pago,
         'registrado_at',now(),'precision_fecha','dia','desde_banco_creditek',p_desde_banco_creditek));
 end if;
 if p_desde_banco_creditek then
   select saldo_actual,coalesce(fecha_corte_at,fecha_corte::timestamptz) into saldo,corte
     from public.banco_creditek_cuentas where numero_cuenta='87600004006' and activa;
   if saldo is null then aviso:='Pago y soporte registrados. Falta conciliar la apertura de Banco Creditek; este pago aún no se refleja en el saldo de control.';
   end if;
 end if;
 return to_jsonb(v)||jsonb_build_object('saldo_control_banco',saldo,'conciliacion_pendiente',p_desde_banco_creditek and (saldo is null or saldo<0),'aviso_banco',aviso);
end $$;
revoke all on function public.finanzas_registrar_pago_real(uuid,text,boolean,date) from public,anon,authenticated,service_role;
grant execute on function public.finanzas_registrar_pago_real(uuid,text,boolean,date) to authenticated;
-- Retire public legacy entry points: a stale page must refresh and request the real date.
revoke all on function public.finanzas_registrar_pago_con_origen(uuid,text,boolean) from public,anon,authenticated,service_role;
revoke all on function public.finanzas_registrar_pago(uuid,text) from public,anon,authenticated,service_role;
commit;
