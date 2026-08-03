-- Rollback restaurador para una instalación sin operaciones. No borra históricos.
begin;
do $guard$
begin
 if to_regclass('public.liquidations') is not null and exists(select 1 from public.liquidations) then
  raise exception 'Rollback automático bloqueado: existen liquidaciones. Exporte y conserve datos; use desactivación manual.';
 end if;
end;$guard$;
drop policy if exists soportes_aliados_insert on storage.objects;
drop policy if exists soportes_aliados_select on storage.objects;
drop policy if exists audit_log_aliados_select on public.audit_log;
drop function if exists public.aliados_cambiar_estado_pago(uuid,text,text);
drop function if exists public.aliados_guardar_bono(uuid,uuid,uuid,text,numeric,text,uuid);
drop function if exists public.aliados_calcular_liquidacion(uuid);
drop function if exists public.aliados_cambiar_estado(uuid,text,text);
drop function if exists public.aliados_importar_liquidacion(text,text,text,text,bigint,text,date,date,date,jsonb,jsonb,jsonb,uuid);
drop function if exists public.aliados_seed_politica_inicial(date);
drop trigger if exists liquidation_immutable_after_approval on public.liquidations;
drop function if exists public.aliados_impedir_cambio_aprobado();
drop table if exists public.liquidation_domain_events;
drop table if exists public.liquidation_adjustments;
drop table if exists public.liquidation_approvals;
drop table if exists public.payment_items;
drop table if exists public.payment_orders;
drop table if exists public.liquidation_incidents;
drop table if exists public.liquidation_bonuses;
drop table if exists public.beneficiary_bank_accounts;
drop table if exists public.liquidation_beneficiaries;
drop table if exists public.liquidation_calculations;
drop table if exists public.settlement_policy_versions;
drop table if exists public.liquidation_operations;
drop table if exists public.liquidation_source_rows;
drop table if exists public.liquidation_imported_files;
drop table if exists public.liquidations;
drop table if exists public.liquidation_platforms;
drop table if exists public.aliados_operadores;
drop function if exists public.tiene_capacidad_aliados(text);
commit;
