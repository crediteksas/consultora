-- Parameters are supplied locally; no production identifiers are embedded in this code.
-- app.inventario_fecha_targets: [{id,corte_id,tienda_codigo,consecutivo,fecha_original,fecha_conciliada}]
-- app.inventario_fecha_request: UUID. Gerencia actor is declared by the maintenance operator;
-- session_user/current_user and technical executor are also recorded. Use SET LOCAL parameters.
begin;
set local lock_timeout='5s';
do $action$
declare targets jsonb:=current_setting('app.inventario_fecha_targets')::jsonb;
 request uuid:=current_setting('app.inventario_fecha_request')::uuid;
 actor uuid:=auth.uid(); item jsonb; sale public.ventas%rowtype;
 before_report jsonb:='[]'; after_report jsonb:='[]'; before_sales jsonb; inserted uuid; cut_info jsonb;
begin
 if actor is null or not exists(select 1 from public.perfiles where id=actor and activo and rol='gerencia') then
  raise exception 'Declared Gerencia authorization required';end if;
 if jsonb_typeof(targets)<>'array' or jsonb_array_length(targets)<>3
  or (select count(distinct x->>'id') from jsonb_array_elements(targets) x)<>3 then
  raise exception 'Exactly three distinct authorized sales required';end if;
 perform 1 from public.ventas v where v.id in(select (x->>'id')::uuid from jsonb_array_elements(targets) x) order by v.id for update;
 for item in select value from jsonb_array_elements(targets) loop
  cut_info:=inventario_control.socios_resultado((item->>'corte_id')::uuid);
  if cut_info->>'tienda_codigo' is distinct from item->>'tienda_codigo' then raise exception 'Target cut/store mismatch';end if;
  before_report:=before_report||jsonb_build_array(cut_info);
 end loop;
 select jsonb_agg(to_jsonb(v) order by v.id) into before_sales from public.ventas v
  where v.id in(select (x->>'id')::uuid from jsonb_array_elements(targets) x);
 if jsonb_array_length(before_sales) is distinct from 3 then raise exception 'Missing authorized sale';end if;
 for item in select value from jsonb_array_elements(targets) order by value->>'id' loop
  select * into strict sale from public.ventas where id=(item->>'id')::uuid for update;
  if sale.tienda_codigo is distinct from item->>'tienda_codigo'
   or sale.consecutivo is distinct from (item->>'consecutivo')::bigint
   or sale.fecha is distinct from (item->>'fecha_original')::date
   or (sale.created_at at time zone 'America/Bogota')::date is distinct from (item->>'fecha_conciliada')::date
   or sale.total is distinct from 0 or coalesce(sale.anulada,false)
   or exists(select 1 from public.creditos where venta_id=sale.id) then
    raise exception 'Sale differs from explicitly authorized zero-value snapshot';end if;
  cut_info:=inventario_control.socios_resultado((item->>'corte_id')::uuid);
  if sale.created_at<(cut_info->>'inicio_at')::timestamptz or sale.created_at>=(cut_info->>'fin_at')::timestamptz then
   raise exception 'Sale registration outside exact target cut';end if;
  if (cut_info->>'listo')::boolean and not exists(select 1 from inventario_control.ventas_fechas_conciliadas r
   where r.venta_id=sale.id and r.corte_id=(item->>'corte_id')::uuid and r.venta_hash=md5(to_jsonb(sale)::text) and r.request_id=request) then
   raise exception 'Target cut was not blocked and has no matching prior reconciliation';end if;
  inserted:=null;
  insert into inventario_control.ventas_fechas_conciliadas(venta_id,corte_id,venta_hash,fecha_original,registrada_at,fecha_conciliada,autorizado_por,motivo,request_id)
   values(sale.id,(item->>'corte_id')::uuid,md5(to_jsonb(sale)::text),sale.fecha,sale.created_at,(sale.created_at at time zone 'America/Bogota')::date,actor,
    'Óscar autoriza usar el día registrado en KORA para conciliar el inventario. Se conserva la venta y el arqueo original, sin modificar importes ni existencias.',request)
   on conflict(venta_id) do nothing returning venta_id into inserted;
  if not exists(select 1 from inventario_control.ventas_fechas_conciliadas r where r.venta_id=sale.id
    and r.corte_id=(item->>'corte_id')::uuid and r.request_id=request
    and r.venta_hash=md5(to_jsonb(sale)::text) and r.fecha_conciliada=(sale.created_at at time zone 'America/Bogota')::date) then
    raise exception 'Existing reconciliation differs; no overwrite allowed';end if;
  if inserted is not null then
   insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(actor::text,'CONCILIAR_FECHA_VENTA_INVENTARIO','ventas',sale.id::text,
     jsonb_build_object('request_id',request,'corte_id',item->>'corte_id','actor_declarado_por_operador',actor,
      'db_session_user',session_user,'db_current_user',current_user,'ejecutor_tecnico','Codex mediante Supabase MCP execute_sql',
      'autorizacion_usuario','Oscar: Ponlo el día que se registró y ya. 2026-11-19','tienda',sale.tienda_codigo,'venta',sale.consecutivo,'fecha_original',sale.fecha,
      'fecha_conciliada',(sale.created_at at time zone 'America/Bogota')::date,'base','dia_registrado_autorizado_por_oscar',
      'venta_original_conservada',true,'caja_y_existencias_sin_cambios',true));
  end if;
 end loop;
 for item in select value from jsonb_array_elements(targets) loop
  after_report:=after_report||jsonb_build_array(inventario_control.socios_resultado((item->>'corte_id')::uuid));
 end loop;
 if (select jsonb_agg(to_jsonb(v) order by v.id) from public.ventas v
   where v.id in(select (x->>'id')::uuid from jsonb_array_elements(targets) x)) is distinct from before_sales then
  raise exception 'Original sales changed: rollback';end if;
 if exists(select 1 from jsonb_array_elements(before_report) a
  left join lateral (select b from jsonb_array_elements(after_report) b where b->>'corte_id'=a->>'corte_id') z on true
  where z.b is null or exists(select 1 from unnest(array['utilidad_neta','ventas_totales','costo_vendido','gastos_totales','perdidas_ajustes','inicio_at','fin_at','retirado']) k where a->k is distinct from z.b->k)) then
  raise exception 'Inventory amounts or periods changed: rollback';end if;
 if exists(select 1 from jsonb_array_elements(targets) t where not exists(select 1 from jsonb_array_elements(after_report) c
   where c->>'corte_id'=t->>'corte_id' and c->>'tienda_codigo'=t->>'tienda_codigo' and (c->>'listo')::boolean)) then
  raise exception 'Authorized inventory still blocked: rollback';end if;
end;
$action$;
commit;
