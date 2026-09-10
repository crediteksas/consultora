-- Contrapartidas, nunca UPDATE de importes aprobados ni borrado de comprobantes.
create table public.aliados_reversiones (
 id uuid primary key default gen_random_uuid(),
 original_operation_id uuid not null unique references public.liquidation_operations(id),
 cancellation_operation_id uuid not null unique references public.liquidation_operations(id),
 liquidation_id uuid not null references public.liquidations(id),
 fecha date not null,
 snapshot jsonb not null,
 treasury_adjustment numeric(18,2) not null default 0,
 tipo text not null check(tipo in ('sin_desembolso','reversion_liquidada')),
 created_by uuid not null references public.perfiles(id),
 created_at timestamptz not null default now(),
 check(original_operation_id<>cancellation_operation_id)
);
create table public.aliados_recuperaciones (
 id uuid primary key default gen_random_uuid(),
 reversion_id uuid not null references public.aliados_reversiones(id),
 beneficiary_id uuid not null references public.liquidation_beneficiaries(id),
 original_payment_id uuid not null references public.payment_orders(id),
 importe numeric(18,2) not null check(importe>0),
 recuperado numeric(18,2) not null default 0 check(recuperado>=0 and recuperado<=importe),
 origen text not null check(origen in ('beneficio_entregado','obligacion_cancelada')),
 created_at timestamptz not null default now(),
 unique(reversion_id,original_payment_id)
);
create table public.aliados_cruces_recuperacion (
 id uuid primary key default gen_random_uuid(),
 recuperacion_id uuid not null references public.aliados_recuperaciones(id),
 payment_order_id uuid not null references public.payment_orders(id),
 importe numeric(18,2) not null check(importe>0),
 tipo text not null check(tipo in ('cruce_pago_futuro','cancelacion_obligacion')),
 created_by uuid not null references public.perfiles(id),
 created_at timestamptz not null default now(),
 unique(recuperacion_id,payment_order_id)
);
create index aliados_recuperaciones_beneficiario on public.aliados_recuperaciones(beneficiary_id,created_at,id) where recuperado<importe;
create index aliados_recuperaciones_reversion on public.aliados_recuperaciones(reversion_id);
create index aliados_recuperaciones_pago on public.aliados_recuperaciones(original_payment_id);
create index aliados_cruces_pago on public.aliados_cruces_recuperacion(payment_order_id);
create index aliados_reversiones_lote on public.aliados_reversiones(liquidation_id);
alter table public.aliados_reversiones enable row level security;
alter table public.aliados_recuperaciones enable row level security;
alter table public.aliados_cruces_recuperacion enable row level security;
revoke all on public.aliados_reversiones,public.aliados_recuperaciones,public.aliados_cruces_recuperacion from public,anon,authenticated;
grant select on public.aliados_reversiones,public.aliados_recuperaciones,public.aliados_cruces_recuperacion to authenticated;
create policy reversiones_lectura on public.aliados_reversiones for select to authenticated using((select public.tiene_capacidad_aliados('revisor')));
create policy recuperaciones_lectura on public.aliados_recuperaciones for select to authenticated using((select public.tiene_capacidad_aliados('revisor')));
create policy cruces_lectura on public.aliados_cruces_recuperacion for select to authenticated using((select public.tiene_capacidad_aliados('revisor')));

alter table public.payment_orders add column recovery_review_required boolean not null default false;
alter table public.payment_orders drop constraint payment_orders_valor_check;
-- Cero solo significa SIN GIRO, no un pago bancario ficticio.
alter table public.payment_orders add constraint payment_orders_valor_check check(valor>0 or (valor=0 and estado='anulado'));

create or replace function kora_private.reversion_guardar(p_cancelacion uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare c public.liquidation_operations%rowtype; o public.liquidation_operations%rowtype;
 l public.liquidations%rowtype; calc public.liquidation_calculations%rowtype;
r uuid; d uuid; b record; p public.payment_orders%rowtype; importe numeric; esperado numeric; cantidad integer; snap jsonb; ajuste_saldo numeric;
begin
 if auth.uid() is null or not coalesce(public.tiene_capacidad_aliados('revisor'),false) then raise exception 'No autorizado'; end if;
 select * into c from public.liquidation_operations where id=p_cancelacion;
 if not found or c.plataforma<>'krediya' or nullif(btrim(c.external_id),'') is null
  or kora_private.krediya_estado_fuente(c.normalized_data,'Estado del contrato')<>'anulado'
  then raise exception 'La fuente no contiene un contrato Krediya ANULADO identificable'; end if;
 perform pg_advisory_xact_lock(hashtextextended('krediya_credito:'||lower(btrim(c.external_id)),0));
 select id into r from public.aliados_reversiones where cancellation_operation_id=c.id;
 if found then return r; end if;
 select count(*) into cantidad from public.liquidation_operations x join public.liquidations xl on xl.id=x.liquidation_id
  where x.plataforma=c.plataforma and lower(btrim(x.external_id))=lower(btrim(c.external_id)) and x.id<>c.id
   and x.reconocida and xl.estado<>'anulada';
 if cantidad<>1 then raise exception 'Se requiere una única venta original; no se cruza solo por cédula o IMEI'; end if;
 select x.* into o from public.liquidation_operations x join public.liquidations xl on xl.id=x.liquidation_id
  where x.plataforma=c.plataforma and lower(btrim(x.external_id))=lower(btrim(c.external_id)) and x.id<>c.id
   and x.reconocida and xl.estado<>'anulada';
 if exists(select 1 from public.aliados_reversiones where original_operation_id=o.id) then raise exception 'La venta original ya tiene una reversión'; end if;
 if nullif(regexp_replace(coalesce(c.cliente_documento,''),'\D','','g'),'') is null
  or regexp_replace(coalesce(c.cliente_documento,''),'\D','','g')<>regexp_replace(coalesce(o.cliente_documento,''),'\D','','g')
  or nullif(btrim(c.imei),'') is null or btrim(c.imei) is distinct from btrim(o.imei)
  or c.origen_codigo is null or c.origen_codigo is distinct from o.origen_codigo
  then raise exception 'El contrato coincide pero cliente, IMEI o comercio difieren. Requiere conciliación'; end if;
 -- Orden global: beneficiarios antes de órdenes. Las autorizaciones usan el mismo cerrojo.
 for b in select distinct po.beneficiary_id from public.payment_orders po join public.payment_items pi on pi.payment_order_id=po.id where pi.operation_id=o.id order by po.beneficiary_id loop
  perform pg_advisory_xact_lock(hashtextextended('recuperacion:'||b.beneficiary_id,0));
 end loop;
 perform 1 from public.liquidations where id in(o.liquidation_id,c.liquidation_id) order by id for update;
 perform 1 from public.liquidation_operations where id in(o.id,c.id) order by id for update;
 if (select to_jsonb(x) from public.liquidation_operations x where id=o.id) is distinct from to_jsonb(o)
  or (select to_jsonb(x) from public.liquidation_operations x where id=c.id) is distinct from to_jsonb(c) then
  raise exception 'La operación cambió durante la revisión. Actualiza antes de confirmar'; end if;
 select * into l from public.liquidations where id=o.liquidation_id;
 if exists(select 1 from public.liquidation_calculations where operation_id=c.id)
  or exists(select 1 from public.payment_items where operation_id=c.id) then raise exception 'La fila de anulación no debe tener pagos ni cálculo propio'; end if;
 -- Entrada y salida en el mismo lote ANTES de cualquier devengo/desembolso.
 if o.liquidation_id=c.liquidation_id and l.frozen_at is null
  and not exists(select 1 from public.liquidation_calculations where operation_id=o.id)
  and not exists(select 1 from public.payment_items where operation_id=o.id)
  and not exists(select 1 from public.liquidation_bonuses where operation_id=o.id) then
  insert into public.aliados_reversiones(original_operation_id,cancellation_operation_id,liquidation_id,fecha,snapshot,tipo,created_by)
   values(o.id,c.id,c.liquidation_id,coalesce(l.fecha_corte,(now() at time zone 'America/Bogota')::date),jsonb_build_object('original',to_jsonb(o),'cancelacion',to_jsonb(c),'sin_desembolso',true),'sin_desembolso',auth.uid()) returning id into r;
  update public.liquidation_operations set reconocida=false,normalized_data=normalized_data||jsonb_build_object('anuladaSinDesembolso',r) where id in(o.id,c.id);
 else
  if not coalesce(public.es_autorizador_pagos(),false) then raise exception 'Gerencia debe confirmar la reversión de una liquidación ya aprobada'; end if;
  if l.frozen_at is null then raise exception 'La venta original tiene cálculo en borrador. Retira su cálculo antes de confirmar la anulación'; end if;
  if o.tipo_establecimiento<>'aliado' then raise exception 'La anulación de tienda propia requiere conciliar su compensación en cartera Retail'; end if;
  select count(*) into cantidad from public.liquidation_calculations where operation_id=o.id;
  if cantidad<>1 then raise exception 'No hay un cálculo original único para revertir'; end if;
  select * into calc from public.liquidation_calculations where operation_id=o.id;
  if calc.pagamos is null or calc.pago_aliado is null or calc.total_bonos is null or calc.utilidad_creditek is null
   or calc.policy_snapshot->>'provision' is null or calc.policy_snapshot->>'gasto_financiero' is null
   then raise exception 'Falta el desglose original; no se inventan importes de reversión'; end if;
  select sum(pi.valor) into esperado from public.payment_items pi join public.payment_orders po on po.id=pi.payment_order_id
   where pi.operation_id=o.id and po.estado in ('pendiente','programado','pagado','conciliado');
  if esperado is distinct from calc.pago_aliado+calc.total_bonos then raise exception 'Los pagos originales no concilian con principal y bonos. Revisión requerida'; end if;
  if exists(select 1 from public.payment_items pi join public.payment_orders po on po.id=pi.payment_order_id where pi.operation_id=o.id and po.estado not in('pendiente','programado','pagado','conciliado')) then
   raise exception 'La operación tiene una orden cerrada sin conciliación. Revisa sus pagos originales'; end if;
  if exists(select 1 from public.payment_items pi join public.payment_orders po on po.id=pi.payment_order_id
   where pi.operation_id=o.id and po.estado in('pendiente','programado') and exists(select 1 from public.aliados_cruces_recuperacion a where a.payment_order_id=po.id)) then
   raise exception 'La orden original tiene un cruce previo aún no pagado. Conciliar ese cruce antes de revertir'; end if;
  snap:=jsonb_build_object('original',to_jsonb(o),'calculo',to_jsonb(calc),'bonos',(select coalesce(jsonb_agg(to_jsonb(bn)),'[]'::jsonb) from public.liquidation_bonuses bn where bn.operation_id=o.id),
    'pagos',(select coalesce(jsonb_agg(jsonb_build_object('item',to_jsonb(pi),'orden',to_jsonb(po))),'[]'::jsonb) from public.payment_items pi join public.payment_orders po on po.id=pi.payment_order_id where pi.operation_id=o.id));
  -- Retener únicamente el margen que realmente se acreditó en el saldo operativo.
  -- No simula una devolución bancaria ni permite retirar utilidad ya reversada.
  perform 1 from public.treasury_unit_balances where unit='tercerizacion' for update;
  select coalesce(sum(case when direction='credit' then amount else -amount end),0) into ajuste_saldo
   from public.treasury_movements where unit='tercerizacion' and idempotency_key='commission-operation:'||o.id and status in('pagado','conciliado');
  snap:=snap||jsonb_build_object('tesoreria',(select coalesce(jsonb_agg(to_jsonb(m)),'[]'::jsonb) from public.treasury_movements m where m.idempotency_key='commission-operation:'||o.id));
  insert into public.aliados_reversiones(original_operation_id,cancellation_operation_id,liquidation_id,fecha,snapshot,treasury_adjustment,tipo,created_by)
   select o.id,c.id,c.liquidation_id,coalesce(cl.fecha_corte,(now() at time zone 'America/Bogota')::date),snap,ajuste_saldo,'reversion_liquidada',auth.uid() from public.liquidations cl where cl.id=c.liquidation_id returning id into r;
  for b in select po.id,sum(pi.valor) importe from public.payment_items pi join public.payment_orders po on po.id=pi.payment_order_id where pi.operation_id=o.id group by po.id order by po.id loop
   select * into p from public.payment_orders where id=b.id for update;
   insert into public.aliados_recuperaciones(reversion_id,beneficiary_id,original_payment_id,importe,origen)
    values(r,p.beneficiary_id,p.id,b.importe,case when p.estado in('pagado','conciliado') then 'beneficio_entregado' else 'obligacion_cancelada' end) returning id into d;
   if p.estado in('pendiente','programado') then
    importe:=p.valor-b.importe;
    if importe<0 then raise exception 'La cancelación excede el saldo pendiente de la orden'; end if;
    insert into public.aliados_cruces_recuperacion(recuperacion_id,payment_order_id,importe,tipo,created_by) values(d,p.id,b.importe,'cancelacion_obligacion',auth.uid());
    update public.aliados_recuperaciones set recuperado=b.importe where id=d;
    update public.payment_orders set valor=importe,estado=case when importe=0 then 'anulado' else 'pendiente' end,
     authorized_by=null,authorized_at=null,updated_at=now() where id=p.id;
   end if;
   -- Una autorización anterior no permite omitir una nueva deuda.
   update public.payment_orders set recovery_review_required=true where beneficiary_id=p.beneficiary_id and estado in('pendiente','programado');
  end loop;
 end if;
 update public.liquidation_incidents set estado='resuelta',resolved_by=auth.uid(),resolved_at=now(),resolution='Reversión vinculada '||r||'. Sin borrar ni repetir el pago original.'
  where operation_id in(c.id,case when o.liquidation_id=c.liquidation_id then o.id else c.id end) and tipo in('krediya_anulacion_por_conciliar','krediya_pago_pendiente','operacion_duplicada','operacion_no_reconocida') and estado='abierta';
 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid()::text,'aliados_reversion_registrada','aliados_reversiones',r::text,jsonb_build_object('original',o.id,'cancelacion',c.id,'sin_pago_bancario',true));
 return r;
end $$;
revoke all on function kora_private.reversion_guardar(uuid) from public,anon;
grant execute on function kora_private.reversion_guardar(uuid) to authenticated;
create function public.aliados_confirmar_reversion(p_cancelacion uuid) returns uuid language sql security invoker set search_path='' as $$select kora_private.reversion_guardar(p_cancelacion)$$;
revoke all on function public.aliados_confirmar_reversion(uuid) from public,anon;
grant execute on function public.aliados_confirmar_reversion(uuid) to authenticated;

create function kora_private.recuperacion_previa(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.payment_orders%rowtype; saldo numeric;
begin
 if auth.uid() is null or not coalesce(public.tiene_capacidad_aliados('revisor'),false) then raise exception 'No autorizado'; end if;
 select * into p from public.payment_orders where id=p_id;
 if not found then raise exception 'Pago no encontrado'; end if;
 select coalesce(sum(importe-recuperado),0) into saldo from public.aliados_recuperaciones where beneficiary_id=p.beneficiary_id and origen='beneficio_entregado';
 return jsonb_build_object('pago',p.valor,'recuperacion',least(p.valor,saldo),'neto',greatest(p.valor-saldo,0),'saldo_por_cobrar',greatest(saldo-p.valor,0));
end $$;
revoke all on function kora_private.recuperacion_previa(uuid) from public,anon;
grant execute on function kora_private.recuperacion_previa(uuid) to authenticated;
create function public.aliados_previsualizar_cruce(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$select kora_private.recuperacion_previa(p_id)$$;
revoke all on function public.aliados_previsualizar_cruce(uuid) from public,anon;
grant execute on function public.aliados_previsualizar_cruce(uuid) to authenticated;

create function kora_private.autorizar_con_recuperacion(p_id uuid,p_neto_esperado numeric) returns public.payment_orders language plpgsql security definer set search_path='' as $$
declare p public.payment_orders%rowtype; d public.aliados_recuperaciones%rowtype; b uuid; neto numeric; descuento numeric; previo jsonb;
begin
 if auth.uid() is null or not coalesce(public.es_autorizador_pagos(),false) then raise exception 'Solo Gerencia puede autorizar el pago o cruce'; end if;
 select beneficiary_id into b from public.payment_orders where id=p_id;
 if not found then raise exception 'Pago no encontrado'; end if;
 perform pg_advisory_xact_lock(hashtextextended('recuperacion:'||b,0));
 select * into p from public.payment_orders where id=p_id for update;
 if p.estado='anulado' and p.valor=0 and exists(select 1 from public.aliados_cruces_recuperacion where payment_order_id=p.id) then return p; end if;
 if p.estado not in('pendiente','programado') then raise exception 'El pago ya fue registrado o cerrado'; end if;
 if not kora_private.pago_con_autorizacion_lote(p.id) then raise exception 'Primero debe aprobarse la liquidación'; end if;
 previo:=kora_private.recuperacion_previa(p.id);
 if p_neto_esperado is null or p_neto_esperado is distinct from (previo->>'neto')::numeric then raise exception 'El saldo cambió. Actualiza y confirma el nuevo valor neto'; end if;
 if p.estado='programado' and p.authorized_by is not null and p.authorized_at is not null and not p.recovery_review_required and (previo->>'recuperacion')::numeric=0 then return p; end if;
 neto:=p.valor;
 for d in select * from public.aliados_recuperaciones where beneficiary_id=b and origen='beneficio_entregado' and recuperado<importe order by created_at,id for update loop
  exit when neto=0;
  descuento:=least(neto,d.importe-d.recuperado);
  insert into public.aliados_cruces_recuperacion(recuperacion_id,payment_order_id,importe,tipo,created_by) values(d.id,p.id,descuento,'cruce_pago_futuro',auth.uid());
  update public.aliados_recuperaciones set recuperado=recuperado+descuento where id=d.id;
  neto:=neto-descuento;
 end loop;
 update public.payment_orders set valor=neto,recovery_review_required=false,
  estado=case when neto=0 then 'anulado' else 'pendiente' end,authorized_by=null,authorized_at=null,updated_at=now() where id=p.id returning * into p;
 if neto>0 then p:=public.aliados_autorizar_pago(p.id); end if;
 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid()::text,'aliados_cruce_autorizado','payment_orders',p.id::text,previo||jsonb_build_object('sin_giro',neto=0));
 return p;
end $$;
revoke all on function kora_private.autorizar_con_recuperacion(uuid,numeric) from public,anon;
grant execute on function kora_private.autorizar_con_recuperacion(uuid,numeric) to authenticated;
create function public.aliados_autorizar_pago_con_cruce(p_id uuid,p_neto_esperado numeric) returns public.payment_orders language sql security invoker set search_path='' as $$select kora_private.autorizar_con_recuperacion(p_id,p_neto_esperado)$$;
revoke all on function public.aliados_autorizar_pago_con_cruce(uuid,numeric) from public,anon;
grant execute on function public.aliados_autorizar_pago_con_cruce(uuid,numeric) to authenticated;

create function kora_private.pago_exigir_recuperacion() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.estado in('programado','pagado') and (new.estado is distinct from old.estado or new.authorized_at is distinct from old.authorized_at) then
  perform pg_advisory_xact_lock(hashtextextended('recuperacion:'||new.beneficiary_id,0));
  if exists(select 1 from public.payment_items pi join public.liquidation_operations c on c.normalized_data->>'operacionAnteriorKrediya'=pi.operation_id::text
   join public.liquidation_incidents i on i.operation_id=c.id and i.tipo='krediya_anulacion_por_conciliar' and i.estado='abierta' where pi.payment_order_id=new.id) then
   raise exception 'Este pago contiene una operación con posible anulación. Revisa su reversión en Liquidaciones'; end if;
  if new.recovery_review_required or exists(select 1 from public.aliados_recuperaciones where beneficiary_id=new.beneficiary_id and origen='beneficio_entregado' and recuperado<importe) then
   raise exception 'Hay una anulación por cruzar. Gerencia debe revisar y autorizar el pago neto'; end if;
 end if;
 return new;
end $$;
revoke all on function kora_private.pago_exigir_recuperacion() from public,anon,authenticated;
create trigger pago_exigir_recuperacion before update on public.payment_orders for each row execute function kora_private.pago_exigir_recuperacion();

create function kora_private.previsualizar_reversion(p_cancelacion uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.liquidation_operations%rowtype; o public.liquidation_operations%rowtype; n integer;
begin
 if auth.uid() is null or not coalesce(public.tiene_capacidad_aliados('revisor'),false) then raise exception 'No autorizado'; end if;
 select * into c from public.liquidation_operations where id=p_cancelacion and plataforma='krediya';
 if not found or kora_private.krediya_estado_fuente(c.normalized_data,'Estado del contrato')<>'anulado' then raise exception 'No hay una anulación identificada en la fuente'; end if;
 select count(*) into n from public.liquidation_operations x join public.liquidations l on l.id=x.liquidation_id
  where x.id<>c.id and x.plataforma=c.plataforma and x.reconocida and l.estado<>'anulada' and lower(btrim(x.external_id))=lower(btrim(c.external_id));
 if n<>1 then raise exception 'No se encontró una venta original única. Se conserva en seguimiento, sin descuentos'; end if;
 select x.* into o from public.liquidation_operations x join public.liquidations l on l.id=x.liquidation_id
  where x.id<>c.id and x.plataforma=c.plataforma and x.reconocida and l.estado<>'anulada' and lower(btrim(x.external_id))=lower(btrim(c.external_id));
 return jsonb_build_object('credito',o.external_id,'comercio',o.establishment_name,'imei',o.imei,'fecha_original',o.operation_at,
  'calculo',(select to_jsonb(x) from public.liquidation_calculations x where operation_id=o.id limit 1),
  'pagos',(select coalesce(jsonb_agg(jsonb_build_object('beneficiario',b.nombre,'estado',p.estado,'importe',pi.valor)),'[]'::jsonb)
   from public.payment_items pi join public.payment_orders p on p.id=pi.payment_order_id join public.liquidation_beneficiaries b on b.id=p.beneficiary_id where pi.operation_id=o.id));
end $$;
revoke all on function kora_private.previsualizar_reversion(uuid) from public,anon;
grant execute on function kora_private.previsualizar_reversion(uuid) to authenticated;
create function public.aliados_previsualizar_reversion(p_cancelacion uuid) returns jsonb language sql security invoker set search_path='' as $$select kora_private.previsualizar_reversion(p_cancelacion)$$;
revoke all on function public.aliados_previsualizar_reversion(uuid) from public,anon;
grant execute on function public.aliados_previsualizar_reversion(uuid) to authenticated;

-- Una reversión no puede reactivarse por importar el mismo contrato otra vez,
-- ni generar bonos diferidos o ítems nuevos después de cerrarse en cero.
create function kora_private.operacion_revertida_no_reactivar() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.reconocida and exists(select 1 from public.aliados_reversiones r where r.snapshot->'original'->>'plataforma'=new.plataforma
   and lower(btrim(r.snapshot->'original'->>'external_id'))=lower(btrim(new.external_id))) then
  new.reconocida:=false;
  new.normalized_data:=coalesce(new.normalized_data,'{}'::jsonb)||jsonb_build_object('seguimientoPagoKrediya','krediya_credito_ya_registrado','reversionPrevia',true);
 end if;
 return new;
end $$;
revoke all on function kora_private.operacion_revertida_no_reactivar() from public,anon,authenticated;
create trigger zz_operacion_revertida_no_reactivar before insert or update of reconocida on public.liquidation_operations for each row execute function kora_private.operacion_revertida_no_reactivar();

create function kora_private.no_devengar_operacion_revertida() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.aliados_reversiones where original_operation_id=new.operation_id or cancellation_operation_id=new.operation_id) then
  raise exception 'La operación fue anulada. No admite nuevos pagos ni bonos';
 end if;
 return new;
end $$;
revoke all on function kora_private.no_devengar_operacion_revertida() from public,anon,authenticated;
create trigger no_pago_operacion_revertida before insert on public.payment_items for each row execute function kora_private.no_devengar_operacion_revertida();
create trigger no_bono_operacion_revertida before insert on public.liquidation_bonuses for each row execute function kora_private.no_devengar_operacion_revertida();

create function kora_private.proteger_pago_con_cruce() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.aliados_cruces_recuperacion where payment_order_id=old.id) and
  (new.beneficiary_id is distinct from old.beneficiary_id or new.liquidation_id is distinct from old.liquidation_id
   or new.valor>old.valor or (new.estado in('anulado','rechazado') and new.valor>0)) then
  raise exception 'La orden tiene un cruce contable confirmado. No se puede modificar ni cancelar sin conciliar el cruce';
 end if;
 return new;
end $$;
revoke all on function kora_private.proteger_pago_con_cruce() from public,anon,authenticated;
create trigger proteger_pago_con_cruce before update on public.payment_orders for each row execute function kora_private.proteger_pago_con_cruce();

-- Se conserva el saldo y sus movimientos originales. Las contrapartidas se
-- descuentan del disponible operativo antes de cualquier nueva salida.
do $$
declare original text; updated text;
begin
 original:=pg_get_functiondef('public.tesoreria_aplicar_saldo(text,text,numeric,text)'::regprocedure);
 updated:=replace(original,
  'if after_value<0 then raise exception ''Saldo insuficiente para la unidad económica'';end if;',
  'if after_value<0 or (p_direction<>''credit'' and after_value<case when p_unit=''tercerizacion'' then (select greatest(coalesce(sum(treasury_adjustment),0),0) from public.aliados_reversiones) else 0 end) then raise exception ''Saldo insuficiente para la unidad económica, incluyendo ajustes por anulaciones'';end if;');
 if updated=original then raise exception 'Cambió el control de saldo. Revisar integración de anulaciones antes de instalar'; end if;
 execute updated;
end $$;
