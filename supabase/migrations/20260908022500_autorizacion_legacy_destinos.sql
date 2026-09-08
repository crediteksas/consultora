-- El flujo anterior no materializaba destinos. No crea saldos ni aprobaciones.
do $migration$
declare body text; previous text;
begin
 body:=pg_get_functiondef('public.aliados_exigir_liquidacion_aprobada_para_pago()'::regprocedure);previous:=body;
 body:=replace(body,'  if not exists (
    select 1
    from public.liquidation_treasury_destinations d',
 '  if not (v_liquidation.estado = ''programada''
      and v_liquidation.approved_at is null
      and old.estado = ''programado''
      and kora_private.pago_con_autorizacion_lote(old.id))
  and not exists (
    select 1
    from public.liquidation_treasury_destinations d');
 if body=previous then raise exception 'Cambió guarda de destinos'; end if;
 execute body;
end;$migration$;
