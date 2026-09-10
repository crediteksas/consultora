begin;
do $ajuste$
declare r record; anterior jsonb; corte timestamptz;
begin
 for r in select * from (values ('CK-01','2026-09-04'),('CK-03','2026-09-05'),('CK-04','2026-09-06'),('CK-08','2026-09-04'),('CK-09','2026-09-04')) v(codigo,fecha)
 loop
  corte := r.fecha::date::timestamp at time zone 'America/Bogota';
  select jsonb_build_object('activo',inventario_control_activo,'desde',inventario_control_desde) into anterior from public.origenes where codigo=r.codigo and activo and tipo='propia' for update;
  if anterior is null then raise exception 'Tienda no válida %',r.codigo; end if;
  if not exists(select 1 from public.movimientos where tienda_codigo=r.codigo and tipo='carga_inicial') then raise exception 'Sin carga inicial %',r.codigo; end if;
  if (anterior->>'activo')::boolean and (anterior->>'desde')::timestamptz=corte then continue; end if;
  if (anterior->>'activo')::boolean or anterior->>'desde' is not null then raise exception 'Configuración cambió: %',r.codigo; end if;
  update public.origenes set inventario_control_activo=true,inventario_control_desde=corte where codigo=r.codigo;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
  values(null,'inventario_carga_inicial_finalizada','origenes',r.codigo,jsonb_build_object('antes',anterior,'despues',jsonb_build_object('activo',true,'desde',corte),'origen','Codex; autorización explícita de Oscar en conversación 2026-09-09','motivo','Igualar control IMEI de tiendas cargadas con Móvil Shopping; corte físico confirmado; sin recalcular ni modificar existencias'));
 end loop;
end
$ajuste$;
commit;
