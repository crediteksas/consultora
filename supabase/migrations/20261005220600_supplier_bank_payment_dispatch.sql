-- Extend the existing registry to authorized supplier bank requests.
-- Version aligned with the migration applied by Supabase MCP.
-- Documents only: no transfer, approval, bank balance or invoice is changed.
-- Abort rather than overwrite a concurrent revision of either shared function.
do $guard$
begin
 if (select md5(prosrc) from pg_proc where oid='kora_private.payment_dispatch_snapshot(text)'::regprocedure)
   <> 'c3ea654e7394ae13fbbdb9aba40f6c5c'
 or (select md5(prosrc) from pg_proc where oid='kora_private.payment_dispatch_create(uuid,jsonb)'::regprocedure)
   <> '0d8e06c4c0fb4c783ca717d48337cd92'
 then raise exception 'El registro de órdenes cambió; revisar antes de aplicar'; end if;
end $guard$;
alter table public.payment_dispatch_items drop constraint payment_dispatch_items_report_ref_check;
alter table public.payment_dispatch_items add constraint payment_dispatch_items_report_ref_check
 check(report_ref ~ '^(FIN|TM|PO|BP)-[0-9a-f-]{36}$');

create or replace function kora_private.payment_dispatch_snapshot(p_ref text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare source_id uuid; kind text; row_data jsonb; result jsonb; destination text; l jsonb; b jsonb;
begin
 if p_ref !~ '^(FIN|TM|PO|BP)-[0-9a-f-]{36}$' then raise exception 'Referencia de pago inválida'; end if;
 kind:=split_part(p_ref,'-',1);source_id:=substring(p_ref from position('-' in p_ref)+1)::uuid;
 if kind='BP' then
  -- Same actors as Banco Creditek. Preparing a document never executes a giro.
  if not exists(select 1 from public.perfiles where id=auth.uid() and activo and
   ((id='d1782db6-bacc-4caf-af6f-ce1b8d1c0391' and rol='auditoria') or
    (id='6de0ad26-64af-4966-8cd9-d468880af627' and rol='gerencia')))
   then raise exception 'Sin acceso a pagos de proveedores'; end if;
  select to_jsonb(p) into row_data from public.banco_creditek_pagos_proveedor p where id=source_id for update;
  if row_data is null or row_data->>'estado'<>'autorizado'
   or row_data->>'autorizado_por' is null or row_data->>'autorizado_at' is null
   or row_data->>'pagado_at' is not null or row_data->>'pagado_por' is not null
   or row_data->>'soporte_path' is not null
   then raise exception 'El pago al proveedor no está disponible para una orden: %',p_ref; end if;
  select to_jsonb(p) into b from public.proveedores p
   where id=(row_data->>'proveedor_id')::uuid and activo for share;
  if b is null or nullif(btrim(b->>'nombre'),'') is null
   or length(btrim(coalesce(row_data->>'concepto','')))<8
   or coalesce((row_data->>'monto')::numeric,0)<=0
   then raise exception 'Faltan proveedor o instrucciones autorizadas de giro'; end if;
  -- Bank/holder details live in the approved concept. Keep the entire text:
  -- do not infer a routing account, edit the request, or invent a beneficiary.
  return jsonb_build_object('id',source_id,'report_ref',p_ref,
   'report_kind','Abono a proveedor','report_business','B2B','report_platform','',
   'report_date',((row_data->>'autorizado_at')::timestamptz at time zone 'America/Bogota')::date,
   'beneficiary_name',b->>'nombre','beneficiary_identification',coalesce(b->>'nit',''),
   'bank_snapshot','{}'::jsonb,'destination_instructions',row_data->>'concepto',
   'concept','Abono a proveedor desde Banco Creditek','valor',(row_data->>'monto')::numeric);

 elsif kind='FIN' then
  select to_jsonb(e) into row_data from public.financial_entries e where id=source_id for update;
  if row_data is null or row_data->>'status'<>'aprobado' or row_data->>'approved_by' is null
   or row_data->>'approved_at' is null or row_data->>'paid_at' is not null or row_data->>'support_path' is not null
   or (row_data->>'entry_type'='retiro_utilidad' and row_data->>'business_unit'='retail')
   then raise exception 'El gasto no está disponible para una orden: %',p_ref; end if;
  result:=jsonb_build_object('report_kind',case when row_data->>'category'='nomina' then 'Nómina'
   when row_data->>'entry_type'='retiro_utilidad' then 'Retiro' else 'Gasto' end,
   'report_business',row_data->>'business_unit','report_date',row_data->>'due_date','report_platform','');
 elsif kind='TM' then
  select to_jsonb(m) into row_data from public.treasury_movements m where id=source_id for update;
  if row_data is null or row_data->>'status'<>'programado' or row_data->>'direction'<>'debit'
   or row_data->>'authorized_by' is null or row_data->>'support_path' is not null
   or row_data->>'paid_by' is not null then raise exception 'El movimiento no está disponible para una orden: %',p_ref; end if;
  result:=jsonb_build_object('report_kind','Gasto de Tesorería','report_business',row_data->>'unit',
   'report_date',row_data->>'movement_date','report_platform',coalesce((select plataforma from public.aliados_gastos_operativos where id=(row_data->>'aliados_gasto_id')::uuid),''));
 else
  select to_jsonb(p) into row_data from public.payment_orders p where id=source_id for update;
  if row_data is null or row_data->>'estado'<>'programado' or row_data->>'authorized_by' is null
   or row_data->>'authorized_at' is null or coalesce((row_data->>'historico_inicial')::boolean,false)
   or coalesce((row_data->>'recovery_review_required')::boolean,false)
   or row_data->>'soporte_path' is not null or row_data->>'fecha_pagada' is not null
   then raise exception 'El pago no está disponible para una orden: %',p_ref; end if;
  select to_jsonb(x) into l from public.liquidations x where id=(row_data->>'liquidation_id')::uuid;
  if not coalesce((l->>'frozen_at' is not null and l->>'approved_at' is not null)
   or (l->>'estado'='programada' and l->>'approved_at' is null),false) then raise exception 'Falta aprobación del lote'; end if;
  b:=row_data->'bank_snapshot';
  result:=row_data||jsonb_build_object('report_kind','Liquidación','report_platform',coalesce(row_data->>'platform_snapshot',l->>'plataforma',''),
   'liquidations',l,'beneficiary_name',b->>'holder','beneficiary_identification',b->>'holder_identification');
 end if;
 if kind in ('FIN','TM') then
  destination:=row_data->>'destination_account';
  if cardinality(string_to_array(coalesce(destination,''),' · '))<>3 then raise exception 'Destino incompleto: %',p_ref; end if;
  b:=jsonb_build_object('bank',btrim(split_part(destination,' · ',1)),
   'account_type',btrim(split_part(destination,' · ',2)),'account_number',btrim(split_part(destination,' · ',3)));
  result:=result||jsonb_build_object('beneficiary_name',row_data->>'beneficiary',
   'beneficiary_identification',row_data->>'beneficiary_document','bank_snapshot',b,'valor',(row_data->>'amount')::numeric);
 end if;
 result:=result||jsonb_build_object('id',source_id,'report_ref',p_ref,'concept',coalesce(row_data->>'concept','Liquidación aprobada'));
 if coalesce((result->>'valor')::numeric,0)<=0 or nullif(btrim(result->>'beneficiary_name'),'') is null
  or coalesce(result->>'beneficiary_identification','') !~ '^[0-9.-]{5,20}$'
  or nullif(btrim(b->>'bank'),'') is null or nullif(btrim(b->>'account_type'),'') is null
  or coalesce(b->>'account_number','') !~ '^[0-9]{6,20}$' then raise exception 'Faltan datos completos del pago: %',p_ref; end if;
 if exists(select 1 from public.payment_destination_corrections where item_id=source_id and status='pendiente'
  and item_kind=case kind when 'FIN' then 'financial_entry' when 'TM' then 'treasury_movement' else 'payment_order' end)
  then raise exception 'Hay datos de destino pendientes de aplicar'; end if;
 return result;
end $$;
revoke all on function kora_private.payment_dispatch_snapshot(text) from public,anon,authenticated;

create or replace function kora_private.payment_dispatch_create(p_request uuid,p_rows jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.payment_dispatches%rowtype; item jsonb; snap jsonb; has_fin boolean; result jsonb;n integer:=0;
begin
 if auth.uid() is null or not (coalesce(public.es_controlador_financiero(),false) or coalesce(public.tiene_capacidad_aliados('revisor'),false))
  then raise exception 'No autorizado para emitir órdenes'; end if;
 if p_request is null or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 500
  then raise exception 'Selecciona entre 1 y 500 pagos'; end if;
 select bool_or(x->>'report_ref' ~ '^(FIN|BP)-') into has_fin from jsonb_array_elements(p_rows) x;
 if has_fin and not coalesce(public.es_controlador_financiero(),false) then raise exception 'Sin acceso a gastos generales'; end if;
 if (select count(distinct x->>'report_ref') from jsonb_array_elements(p_rows) x)<>jsonb_array_length(p_rows)
  then raise exception 'La selección contiene pagos duplicados'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select * into d from public.payment_dispatches where request_id=p_request;
 if found then
  if d.created_by is distinct from auth.uid() or
   (select array_agg(report_ref order by report_ref) from public.payment_dispatch_items where dispatch_id=d.id)
   is distinct from (select array_agg(x->>'report_ref' order by x->>'report_ref') from jsonb_array_elements(p_rows) x)
   then raise exception 'La solicitud corresponde a otra orden'; end if;
 else
  insert into public.payment_dispatches(request_id,created_by,has_financial,issued_by_name) values(p_request,auth.uid(),has_fin,(select nombre from public.perfiles where id=auth.uid())) returning * into d;
  -- Lock sources in one deterministic order. The unique reference is the final
  -- cross-session safeguard, even when two browsers issue simultaneously.
  for item in select x from jsonb_array_elements(p_rows) x order by x->>'report_ref' loop
   snap:=kora_private.payment_dispatch_snapshot(item->>'report_ref');
   if exists(select 1 from public.payment_dispatch_items where report_ref=item->>'report_ref')
    then raise exception 'El pago ya tiene una orden emitida. Consulta la orden guardada: %',item->>'report_ref'; end if;
   if (snap->>'valor')::numeric is distinct from (item->>'valor')::numeric
    or snap->>'beneficiary_name' is distinct from item->>'beneficiary_name'
    or snap->>'beneficiary_identification' is distinct from item->>'beneficiary_identification'
    or snap->'bank_snapshot'->>'bank' is distinct from item->'bank_snapshot'->>'bank'
    or snap->'bank_snapshot'->>'account_type' is distinct from item->'bank_snapshot'->>'account_type'
    or snap->'bank_snapshot'->>'account_number' is distinct from item->'bank_snapshot'->>'account_number'
    or (item->>'report_ref' like 'BP-%' and
        snap->>'destination_instructions' is distinct from item->>'destination_instructions')
    then raise exception 'El pago cambió desde la selección; actualiza antes de emitir'; end if;
   n:=n+1;
   insert into public.payment_dispatch_items(dispatch_id,report_ref,snapshot,position) values(d.id,item->>'report_ref',snap,n);
  end loop;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
   values(auth.uid(),'orden_pago_emitida','payment_dispatches',d.id,jsonb_build_object('consecutivo',d.consecutive,'pagos',jsonb_array_length(p_rows)));
 end if;
 select to_jsonb(d)||jsonb_build_object('payment_dispatch_items',coalesce(jsonb_agg(to_jsonb(i) order by i.position),'[]'::jsonb)) into result
  from public.payment_dispatch_items i where i.dispatch_id=d.id;
 return result;
end $$;

-- Preserve the existing privilege boundary (private implementation, public invoker).
revoke all on function kora_private.payment_dispatch_create(uuid,jsonb) from public,anon;
grant execute on function kora_private.payment_dispatch_create(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
