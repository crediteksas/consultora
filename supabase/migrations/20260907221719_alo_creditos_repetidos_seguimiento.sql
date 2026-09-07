-- ALO: identidad por contrato, nunca por fecha de corte. Conserva filas fuente.
-- Incluye borradores previos: no se califican falsamente como pagados.
do $migration$
declare
 body text := pg_get_functiondef('public.aliados_importar_liquidacion(text,text,text,text,bigint,text,date,date,date,jsonb,jsonb,jsonb,uuid)'::regprocedure);
 declaration text := 'declare v_id uuid;v_file uuid;v_row jsonb;v_op jsonb;v_inc jsonb;';
 anchor text := 'for v_op in select * from jsonb_array_elements(coalesce(p_operations,''[]'')) loop';
begin
 if position(declaration in body)=0 or position(anchor in body)=0 or position('v_previous' in body)>0 then
  raise exception 'El importador cambió; revisar control de contratos repetidos';
 end if;
 body:=replace(body,declaration,declaration||'v_previous record;v_contract text;');
 body:=replace(body,'select id into v_id from public.liquidations where idempotency_key=',
   'if p_plataforma=''alo'' then perform pg_advisory_xact_lock(hashtextextended(''alo_import_contracts'',0)); end if; select id into v_id from public.liquidations where idempotency_key=');
 body:=replace(body,anchor,anchor||$fragment$
  if p_plataforma='alo' then
   v_contract:=nullif(btrim(v_op->>'externalId'),'');
   if v_contract is null then raise exception 'Falta el número de contrato ALO; no se puede garantizar que no sea repetido'; end if;
   select o.id,o.liquidation_id,l.estado,o.monto_credito,o.inicial,o.imei
    into v_previous from public.liquidation_operations o
    join public.liquidations l on l.id=o.liquidation_id
    where o.plataforma='alo' and btrim(o.external_id)=v_contract and l.estado<>'anulada'
    order by o.created_at,o.id limit 1;
   if found then
    insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(auth.uid(),'alo_credito_repetido_omitido','liquidations',v_id,
      jsonb_build_object('contrato',v_contract,'lote_anterior',v_previous.liquidation_id,
        'operacion_anterior',v_previous.id,'estado_anterior',v_previous.estado,
        'mismo_archivo',v_previous.liquidation_id=v_id,
        'datos_diferentes',v_previous.monto_credito is distinct from nullif(v_op->>'montoCredito','')::numeric
          or v_previous.inicial is distinct from coalesce((v_op->>'inicial')::numeric,0)
          or v_previous.imei is distinct from v_op->>'imei',
        'sin_nuevo_calculo_ni_pago',true));
    continue;
   end if;
  end if;
$fragment$);
 -- La repetición exacta dentro del Excel ya se reporta en auditoría, no bloquea el resto.
 body:=replace(body,'for v_inc in select * from jsonb_array_elements(coalesce(p_incidents,''[]'')) loop',
   'for v_inc in select * from jsonb_array_elements(coalesce(p_incidents,''[]'')) loop
    if p_plataforma=''alo'' and v_inc->>''tipo''=''operacion_duplicada'' then continue; end if;');
 execute body;
end;
$migration$;
