-- A beneficiary can receive a supplemental payment in the same approved lot.
-- Segment zero preserves existing upsert behavior; issued/authorized orders stay immutable.
alter table public.payment_orders add column origen_operacion text references public.origenes(codigo);
create index payment_orders_origen_operacion on public.payment_orders(origen_operacion);
alter table public.payment_orders add column secuencia_beneficiario integer not null default 0 check(secuencia_beneficiario>=0);
alter table public.payment_orders drop constraint payment_orders_liquidation_id_beneficiary_id_key;
alter table public.payment_orders add constraint payment_orders_lote_beneficiario_secuencia_key unique(liquidation_id,beneficiary_id,secuencia_beneficiario);
do $$
declare def text; f record; needle text;
begin
 for f in select p.oid from pg_proc p where p.prokind='f' and p.prosrc ilike '%payment_orders%'
  and p.prosrc ~* 'on conflict\s*\(liquidation_id\s*,\s*beneficiary_id\)' loop
  def:=pg_get_functiondef(f.oid);
  execute regexp_replace(def,'on conflict\s*\(liquidation_id\s*,\s*beneficiary_id\)','on conflict(liquidation_id,beneficiary_id,secuencia_beneficiario)','gi');
 end loop;
 def:=pg_get_functiondef('kora_private.completar_ordenes_aprobadas(uuid)'::regprocedure);
 needle:=$n$select * into po from public.payment_orders where liquidation_id=p_lote and beneficiary_id=b for update;$n$;
 if position(needle in def)=0 then raise exception 'Revisar la versión de completar órdenes'; end if;
 def:=replace(def,needle,$n$select * into po from public.payment_orders candidate
   where liquidation_id=p_lote and beneficiary_id=b and estado='pendiente'
    and authorized_at is null and authorized_by is null and bank_account_id=a
    and origen_operacion is not distinct from (case when r.bonus_id is null then (select origen_codigo from public.liquidation_operations where id=r.operation_id) else null end)
    and not exists(select 1 from public.payment_dispatch_items di where di.report_ref='PO-'||candidate.id::text)
   order by secuencia_beneficiario limit 1 for update;$n$);
 needle:=$n$insert into public.payment_orders(liquidation_id,beneficiary_id,bank_account_id,valor,idempotency_key)
   values(p_lote,b,a,r.valor,gen_random_uuid()) returning * into po;$n$;
 if position(needle in def)=0 then raise exception 'Revisar inserción de órdenes'; end if;
 def:=replace(def,needle,$n$insert into public.payment_orders(liquidation_id,beneficiary_id,bank_account_id,valor,idempotency_key,secuencia_beneficiario,origen_operacion)
   values(p_lote,b,a,r.valor,gen_random_uuid(),(select coalesce(max(existing.secuencia_beneficiario),-1)+1 from public.payment_orders existing where existing.liquidation_id=p_lote and existing.beneficiary_id=b),case when r.bonus_id is null then (select origen_codigo from public.liquidation_operations where id=r.operation_id) else null end) returning * into po;$n$);
 -- A rejected/cancelled item must not silently become another payable item on refresh.
 def:=replace(def,$n$where p.liquidation_id=p_lote and p.estado not in ('anulado','rechazado')$n$,$n$where p.liquidation_id=p_lote$n$);
 execute def;
end $$;

-- Capture the paying business from the operation, independently of the shared person.
do $$
declare def text;
begin
 def:=pg_get_functiondef('public.payment_orders_capture_business_snapshot()'::regprocedure);
 if position('o.codigo = b.origen_codigo' in def)=0 then raise exception 'Revisar captura de comercio'; end if;
 execute replace(def,'o.codigo = b.origen_codigo','o.codigo = coalesce(new.origen_operacion,b.origen_codigo)');
end $$;

create function kora_private.proteger_segmento_pago() returns trigger language plpgsql set search_path='' as $$
begin
 if new.origen_operacion is distinct from old.origen_operacion or new.secuencia_beneficiario is distinct from old.secuencia_beneficiario then
  raise exception 'El comercio y segmento originales del pago son inmutables';
 end if;
 return new;
end $$;
revoke all on function kora_private.proteger_segmento_pago() from public,anon,authenticated;
create trigger proteger_segmento_pago before update of origen_operacion,secuencia_beneficiario on public.payment_orders for each row execute function kora_private.proteger_segmento_pago();
