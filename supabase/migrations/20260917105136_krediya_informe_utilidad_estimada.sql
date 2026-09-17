-- Report-only snapshot. Reuse the existing read-only estimator; never invoke settlement.
create or replace function kora_private.capture_krediya_import_report()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_contexts jsonb := '[]'::jsonb; v_count integer := 0; o record; c jsonb; u jsonb;
begin
 if new.event_type <> 'liquidation.imported' or not exists (
  select 1 from public.liquidations where id=new.aggregate_id and plataforma='krediya'
 ) then return new; end if;
 begin
  for o in select id,external_id,reconocida from public.liquidation_operations
   where liquidation_id=new.aggregate_id and plataforma='krediya' order by operation_at,id
  loop
   c := public.aliados_contexto_precio_krediya(o.id);
   begin
    u := krediya_private.utilidad_consulta(o.id);
   exception when others then
    -- A missing estimate must not suppress the PVP report or block import.
    u := jsonb_build_object('disponible',false,'motivo','Estimación no disponible; revisar en Liquidaciones');
   end;
   v_contexts := v_contexts || jsonb_build_array(c || jsonb_build_object(
    'credito',o.external_id,'reconocida',o.reconocida,'automatica',u));
   v_count := v_count + 1;
  end loop;
  insert into public.krediya_import_reports(liquidation_id,contexts,operation_count)
   values(new.aggregate_id,v_contexts,v_count) on conflict (liquidation_id) do nothing;
 exception when others then
  begin
   insert into public.krediya_import_reports(liquidation_id,report_status,error_code)
    values(new.aggregate_id,'error',sqlstate) on conflict (liquidation_id) do nothing;
  exception when others then
   raise warning 'Krediya report pending for lot %, SQLSTATE %',new.aggregate_id,sqlstate;
  end;
 end;
 return new;
end $$;
revoke all on function kora_private.capture_krediya_import_report() from public,anon,authenticated;
-- No backfill or re-send. Previously emailed reports keep their original snapshot.
