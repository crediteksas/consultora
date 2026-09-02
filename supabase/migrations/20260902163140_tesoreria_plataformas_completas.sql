begin;

create or replace function public.aliados_corregir_nombre_plataforma_orden()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare order_id uuid;
begin
  order_id:=coalesce(new.payment_order_id,old.payment_order_id);
  update public.payment_orders po set concept=case
    when po.payment_kind='ejecutivo' then 'Bonos y comisiones — '||case po.platform_snapshot when 'alo' then 'ALO Credit' when 'krediya' then 'Krediya' else 'PayJoy' end||' — corte '||coalesce(po.cutoff_snapshot::text,'sin fecha')
    else 'Pago de '||po.operations_count||' créditos '||case po.platform_snapshot when 'alo' then 'ALO Credit' when 'krediya' then 'Krediya' else 'PayJoy' end||' — corte '||coalesce(po.cutoff_snapshot::text,'sin fecha') end,
    updated_at=now()
  where po.id=order_id;
  return null;
end;
$$;

revoke all on function public.aliados_corregir_nombre_plataforma_orden() from public,anon,authenticated;
drop trigger if exists zzz_payment_items_platform_name on public.payment_items;
create trigger zzz_payment_items_platform_name
after insert or update or delete on public.payment_items
for each row execute function public.aliados_corregir_nombre_plataforma_orden();

update public.payment_orders po set concept=case
  when po.payment_kind='ejecutivo' then 'Bonos y comisiones — '||case po.platform_snapshot when 'alo' then 'ALO Credit' when 'krediya' then 'Krediya' else 'PayJoy' end||' — corte '||coalesce(po.cutoff_snapshot::text,'sin fecha')
  else 'Pago de '||po.operations_count||' créditos '||case po.platform_snapshot when 'alo' then 'ALO Credit' when 'krediya' then 'Krediya' else 'PayJoy' end||' — corte '||coalesce(po.cutoff_snapshot::text,'sin fecha') end,
  updated_at=now();

commit;
