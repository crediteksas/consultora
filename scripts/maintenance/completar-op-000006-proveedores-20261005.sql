-- One-time document correction explicitly authorized by Gerencia in KORA SEP.
-- Append only: keep the original five items, consecutive and author unchanged.
-- No transfer, payment authorization, support, bank or invoice is modified.
-- Run as the maintenance operator, without impersonating an authenticated user.
do $repair$
declare
 d public.payment_dispatches%rowtype;
 r record; p public.banco_creditek_pagos_proveedor%rowtype; v public.proveedores%rowtype;
 original_items jsonb; after_items jsonb; old_dispatch jsonb; added jsonb := '[]'::jsonb;
 snap jsonb; n integer := 5; total numeric; audit_before jsonb;
 repair_key constant text := 'op-000006-proveedores-20261005';
 original_refs constant text[] := array[
  'PO-234e52f4-e66f-42ee-a974-2c381d450897',
  'PO-8cfe7daa-68b1-4839-9117-6125af456acc',
  'PO-af2e8bb6-3371-4ee8-a2b8-2f9ee1886462',
  'PO-cdd2ee7c-16f5-4a1f-aeb0-012313bbdee1',
  'PO-f7818c42-3892-4939-bfce-0e86ea62537f'];
begin
 select * into d from public.payment_dispatches
 where id='6aa755c1-b692-4d64-809a-b01d77221f75' and consecutive=6 for update;
 if not found or d.legacy or d.created_at <> '2026-10-05T21:39:23.896063Z'::timestamptz
  then raise exception 'La orden objetivo no coincide'; end if;
 perform 1 from public.payment_dispatch_items where dispatch_id=d.id order by position for update;
 select detalle into audit_before from public.audit_log
 where accion='orden_pago_ampliada' and registro_id=d.id::text and detalle->>'repair_key'=repair_key;
 if found then
  select jsonb_agg(to_jsonb(i) order by position) into after_items
   from public.payment_dispatch_items i where dispatch_id=d.id and report_ref=any(original_refs);
  if after_items is distinct from audit_before->'original_items'
   or (select count(*) from public.payment_dispatch_items where dispatch_id=d.id)<>8
   or (select sum((snapshot->>'valor')::numeric) from public.payment_dispatch_items where dispatch_id=d.id)<>12719800
   or (select count(*) from public.payment_dispatch_items where dispatch_id=d.id
       and snapshot->'dispatch_addition'->>'repair_key'=repair_key)<>3
   then raise exception 'La ampliación registrada no coincide; no se reintentó'; end if;
  return;
 end if;
 select jsonb_agg(to_jsonb(i) order by position),sum((snapshot->>'valor')::numeric)
 into original_items,total from public.payment_dispatch_items i where dispatch_id=d.id;
 if jsonb_array_length(original_items) is distinct from 5 or total is distinct from 2719800
  or (select array_agg(report_ref order by position) from public.payment_dispatch_items where dispatch_id=d.id)
      is distinct from original_refs or d.note is not null
  then raise exception 'La orden cambió desde la revisión; no se aplicó nada'; end if;
 old_dispatch:=to_jsonb(d);
 for r in select * from (values
  ('b58a0576-0357-44e1-a204-ce316063e48a'::uuid,4000000::numeric,'MR MOVIL SAS'),
  ('5d3cd96a-589b-4ce6-a969-cb2a4d3cba5d'::uuid,1000000::numeric,'TEKMOBILE'),
  ('18595c7d-0e6f-4288-958d-1b340db9a3cb'::uuid,5000000::numeric,'MUNDO NET CEL')
 ) as expected(id,amount,name) order by id loop
  select * into p from public.banco_creditek_pagos_proveedor where id=r.id for update;
  if not found or p.estado is distinct from 'autorizado' or p.monto is distinct from r.amount
   or p.autorizado_por is distinct from '6de0ad26-64af-4966-8cd9-d468880af627'::uuid
   or p.autorizado_at is null or p.pagado_at is not null or p.pagado_por is not null
   or p.soporte_path is not null or length(btrim(coalesce(p.concepto,'')))<8
   then raise exception 'Proveedor cambió o no está autorizado: %',r.name; end if;
  select * into v from public.proveedores where id=p.proveedor_id for share;
  if not found or not v.activo or v.nombre is distinct from r.name
   then raise exception 'No coincide el proveedor: %',r.name; end if;
  if exists(select 1 from public.payment_dispatch_items where report_ref='BP-'||p.id)
   then raise exception 'Proveedor ya incluido en otra orden: %',r.name; end if;
  snap:=jsonb_build_object('id',p.id,'report_ref','BP-'||p.id,
   'report_kind','Abono a proveedor','report_business','B2B','report_platform','',
   'report_date',(p.autorizado_at at time zone 'America/Bogota')::date,
   'beneficiary_name',v.nombre,'beneficiary_identification',coalesce(v.nit,''),
   'bank_snapshot','{}'::jsonb,'destination_instructions',p.concepto,
   'concept','Abono a proveedor desde Banco Creditek','valor',p.monto,
   'dispatch_addition',jsonb_build_object('repair_key',repair_key,'added_at',now(),
    'authorized_via','Gerencia autorizó en KORA SEP la incorporación a la misma OP-000006'));
  n:=n+1;
  insert into public.payment_dispatch_items(dispatch_id,report_ref,snapshot,position)
   values(d.id,'BP-'||p.id,snap,n);
  added:=added||jsonb_build_array(snap);
 end loop;
 select jsonb_agg(to_jsonb(i) order by position) into after_items
  from public.payment_dispatch_items i where dispatch_id=d.id and report_ref=any(original_refs);
 if after_items is distinct from original_items or n<>8
  or (select sum((snapshot->>'valor')::numeric) from public.payment_dispatch_items where dispatch_id=d.id)<>12719800
  then raise exception 'Falló la comprobación de la orden ampliada'; end if;
 update public.payment_dispatches set has_financial=true,
  note='Orden ampliada por autorización de Gerencia: se agregaron 3 proveedores por $10.000.000. Conserva los 5 pagos originales por $2.719.800. Total: 8 pagos por $12.719.800. No vuelve a autorizar ni ejecuta giros; verifica en banco los pagos anteriores antes de montarlos otra vez.'
 where id=d.id;
 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
 values(null,'orden_pago_ampliada','payment_dispatches',d.id::text,jsonb_build_object(
  'repair_key',repair_key,'ejecutado_por','Codex · mantenimiento autorizado por Gerencia en KORA SEP',
  'sin_suplantar_sesion',true,'original_dispatch',old_dispatch,'original_items',original_items,
  'added_items',added,'pagos_antes',5,'pagos_despues',8,'total_antes',2719800,
  'total_agregado',10000000,'total_despues',12719800,'sin_movimiento_banco',true,
  'sin_nuevas_autorizaciones_de_pago',true,'giros_previos_no_confirmados',true));
end $repair$;
