-- Reparación de lectura DD/MM/YYYY del archivo fuente. No recalcula importes,
-- no reabre lotes, no modifica pagos y conserva la fecha anterior en auditoría.
do $$
declare r record; v_day date; v_at timestamptz;
begin
  for r in
    select o.id,o.operation_at,o.normalized_data,
      o.normalized_data#>>'{movimientos,0,original,fecha}' as fecha_fuente
    from public.liquidation_operations o
    join public.liquidations l on l.id=o.liquidation_id
    where o.plataforma='krediya' and l.frozen_at is null
      and l.estado='con_novedades'
      and o.normalized_data#>>'{movimientos,0,original,fecha}' ~ '^\d{1,2}/\d{1,2}/\d{4}$'
  loop
    v_day=to_date(r.fecha_fuente,'DD/MM/YYYY');
    if extract(day from v_day)::integer <> split_part(r.fecha_fuente,'/',1)::integer
      or extract(month from v_day)::integer <> split_part(r.fecha_fuente,'/',2)::integer then
      raise exception 'Fecha fuente inválida en operación %',r.id;
    end if;
    v_at=(v_day+time '12:00') at time zone 'America/Bogota';
    if r.operation_at is distinct from v_at then
      insert into public.audit_log(usuario,accion,tabla,detalle)
      values(null,'corregir_fecha_fuente_krediya','liquidation_operations',jsonb_build_object(
        'operation_id',r.id,'fecha_fuente',r.fecha_fuente,
        'operation_at_anterior',r.operation_at,'fecha_normalizada_anterior',r.normalized_data->'fecha',
        'operation_at_corregida',v_at,'motivo','Lectura explícita DD/MM/YYYY del archivo fuente'
      ));
      update public.liquidation_operations set operation_at=v_at,
        normalized_data=jsonb_set(normalized_data,'{fecha}',to_jsonb(to_char(v_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
      where id=r.id;
    end if;
  end loop;
end $$;
