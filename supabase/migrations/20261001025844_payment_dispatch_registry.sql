-- An issued order is a durable document. Its items can never enter another order.
create table public.payment_dispatches(
 id uuid primary key default gen_random_uuid(),
 consecutive bigint generated always as identity unique not null,
 request_id uuid unique not null,
 created_at timestamptz not null default now(),created_by uuid references public.perfiles(id),
 has_financial boolean not null default false,
 legacy boolean not null default false,note text,issued_by_name text,original_reference text,original_issued_at timestamptz
);
create table public.payment_dispatch_items(
 id uuid primary key default gen_random_uuid(),dispatch_id uuid not null references public.payment_dispatches(id),
 report_ref text not null unique check(report_ref ~ '^(FIN|TM|PO)-[0-9a-f-]{36}$'),
 position integer not null,unique(dispatch_id,position),
 snapshot jsonb not null,reported_paid boolean not null default false,
 created_at timestamptz not null default now()
);
create index payment_dispatch_items_dispatch_idx on public.payment_dispatch_items(dispatch_id);
alter table public.payment_dispatches enable row level security;
alter table public.payment_dispatch_items enable row level security;
revoke all on public.payment_dispatches,public.payment_dispatch_items from public,anon,authenticated;
grant select on public.payment_dispatches,public.payment_dispatch_items to authenticated;
create policy payment_dispatch_read on public.payment_dispatches for select to authenticated
 using ((select public.es_controlador_financiero()) or (not has_financial and (select public.tiene_capacidad_aliados('revisor'))));
create policy payment_dispatch_item_read on public.payment_dispatch_items for select to authenticated
 using (exists(select 1 from public.payment_dispatches d where d.id=dispatch_id));

create function kora_private.payment_dispatch_snapshot(p_ref text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare source_id uuid; kind text; row_data jsonb; result jsonb; destination text; l jsonb; b jsonb;
begin
 if p_ref !~ '^(FIN|TM|PO)-[0-9a-f-]{36}$' then raise exception 'Referencia de pago inválida'; end if;
 kind:=split_part(p_ref,'-',1);source_id:=substring(p_ref from position('-' in p_ref)+1)::uuid;
 if kind='FIN' then
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

create function kora_private.payment_dispatch_create(p_request uuid,p_rows jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.payment_dispatches%rowtype; item jsonb; snap jsonb; has_fin boolean; result jsonb;n integer:=0;
begin
 if auth.uid() is null or not (coalesce(public.es_controlador_financiero(),false) or coalesce(public.tiene_capacidad_aliados('revisor'),false))
  then raise exception 'No autorizado para emitir órdenes'; end if;
 if p_request is null or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 500
  then raise exception 'Selecciona entre 1 y 500 pagos'; end if;
 select bool_or(x->>'report_ref' like 'FIN-%') into has_fin from jsonb_array_elements(p_rows) x;
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
create function public.payment_dispatch_create(p_request uuid,p_rows jsonb) returns jsonb
language sql security invoker set search_path='' as $$select kora_private.payment_dispatch_create($1,$2)$$;
revoke all on function kora_private.payment_dispatch_create(uuid,jsonb),public.payment_dispatch_create(uuid,jsonb) from public,anon;
grant execute on function kora_private.payment_dispatch_create(uuid,jsonb),public.payment_dispatch_create(uuid,jsonb) to authenticated;

-- Gerencia confirmed these four expenses were already included in a prior
-- order and transferred; only Mayte's evidence is outstanding. Register that
-- fact without fabricating a receipt, a transfer date, or a new bank debit.
do $$
declare d uuid; r record; n integer:=0;
begin
 insert into public.payment_dispatches(request_id,legacy,note)
 values(gen_random_uuid(),true,'Orden anterior: Gerencia confirma cuatro giros realizados; Mayte debe adjuntar los soportes. Fecha original de emisión no registrada.') returning id into d;
 for r in select m.id from public.treasury_movements m join (values
  ('Lujo red sas','Gasto Aliados — Bono alianza',20000::numeric),
  ('María vasco','Gasto Aliados — Bono estrategia',20000::numeric),
  ('Ingris Tatiana beltran','Gasto Aliados — Saldo pendiente',33200::numeric),
  ('Ingrid Cristina ramos','Gasto Aliados — Bono estrategia',20000::numeric)
 ) v(beneficiary,concept,amount) on m.beneficiary=v.beneficiary and m.concept=v.concept and m.amount=v.amount
 where m.status='programado' and m.aliados_gasto_id is not null and m.support_path is null
 loop
  insert into public.payment_dispatch_items(dispatch_id,report_ref,snapshot,reported_paid,position)
   values(d,'TM-'||r.id,kora_private.payment_dispatch_snapshot('TM-'||r.id),true,n+1);n:=n+1;
 end loop;
 if n<>4 then raise exception 'Se esperaban exactamente los cuatro pagos indicados; encontrados %',n; end if;
 insert into public.audit_log(accion,tabla,registro_id,detalle)
 values('orden_anterior_giros_confirmados_por_gerencia','payment_dispatches',d,
  jsonb_build_object('pagos',n,'total',93200,'pendiente','soportes de Mayte','sin_nuevo_debito',true));
end $$;
notify pgrst,'reload schema';

-- Preserve the actual PDF supplied by Gerencia (17 rows, COP 10,798,752).
-- Assign the registry consecutive and retain its former timestamp reference.
do $$
declare d uuid;r record;n integer:=0;total numeric:=0;
begin
 insert into public.payment_dispatches(request_id,has_financial,legacy,note,issued_by_name,original_reference,original_issued_at)
 values(gen_random_uuid(),true,true,'Orden conservada desde el PDF aportado por Gerencia; no acredita pago ni reemplaza los soportes.',
 'Oscar Pacheco','OP-20260930-215711','2026-09-30 21:57:11-05') returning id into d;
 for r in with expected(kind,suffix,amount,position) as (values
('PO','d2a8',465000,1),
('PO','c722',10000,2),
('PO','fa05',912000,3),
('PO','f8ff',40000,4),
('PO','2ab8',392000,5),
('PO','8151',280600,6),
('PO','0abe',90000,7),
('PO','fa7b',1035895,8),
('PO','e06e',2359072,9),
('PO','0cea',601805,10),
('PO','baab',855680,11),
('PO','5431',270000,12),
('PO','5447',540000,13),
('PO','3fcd',1246700,14),
('FIN','4918',550000,15),
('FIN','725e',400000,16),
('FIN','088c',750000,17)
 ), sources as (
 select 'PO'::text kind,id,valor amount from public.payment_orders
 union all select 'FIN',id,amount from public.financial_entries
 ) select s.kind||'-'||s.id as ref,s.amount from expected e join sources s
 on s.kind=e.kind and right(s.id::text,4)=e.suffix and s.amount=e.amount order by e.position
 loop
  insert into public.payment_dispatch_items(dispatch_id,report_ref,snapshot,position)
   values(d,r.ref,kora_private.payment_dispatch_snapshot(r.ref),n+1);n:=n+1;total:=total+r.amount;
 end loop;
 if n<>17 or total<>10798752 then raise exception 'La orden aportada no coincide: % pagos, total %',n,total; end if;
 insert into public.audit_log(accion,tabla,registro_id,detalle)
 values('orden_pdf_anterior_conservada','payment_dispatches',d,jsonb_build_object('pagos',n,'total',total,'referencia_original','OP-20260930-215711'));
end $$;
