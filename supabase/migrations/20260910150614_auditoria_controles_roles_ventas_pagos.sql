-- Security controls only: no recalculation, payment or historical data update.
create or replace function public.rol_actual() returns text
language sql stable security definer set search_path = '' as $$
 select rol from public.perfiles where id=auth.uid() and activo;
$$;
create or replace function public.tienda_actual() returns text
language sql stable security definer set search_path = '' as $$
 select tienda_codigo from public.perfiles where id=auth.uid() and activo;
$$;
create or replace function public.es_central() returns boolean
language sql stable security definer set search_path = '' as $$
 select coalesce(public.rol_actual() in ('gerencia','auditoria'),false);
$$;
drop policy if exists "central gestiona perfiles" on public.perfiles;
create policy "gerencia gestiona perfiles" on public.perfiles for all to authenticated
 using(public.rol_actual()='gerencia') with check(public.rol_actual()='gerencia');
-- Existing 'perfil propio' SELECT retains Maite's central read access.
-- RPC registrar_venta remains SECURITY DEFINER and verifies store + locked stock.
-- No user, including management, should bypass the transaction via raw table writes.
revoke insert,update,delete,truncate,references,trigger on public.ventas,public.venta_items
 from public,anon,authenticated;
revoke truncate,references,trigger on public.perfiles,public.stock_cantidad,public.unidades
 from public,anon,authenticated;

do $sale$
declare body text; old_guard text := 'if not (es_central() or tienda_actual() = p_tienda_codigo) then';
begin
 select pg_get_functiondef('public.registrar_venta(text,text,uuid,jsonb,jsonb,text)'::regprocedure) into body;
 if position(old_guard in body)=0 then raise exception 'Venta distinta de la auditada: revisar antes de aplicar'; end if;
 body:=replace(body,old_guard,'if not coalesce((es_central() or tienda_actual() = p_tienda_codigo),false) then');
 execute body;
end $sale$;

create or replace function kora_private.exigir_soporte_real_pago() returns trigger
language plpgsql security definer set search_path = '' as $$
declare meta jsonb;
begin
 if new.estado='pagado' and old.estado is distinct from 'pagado'
    and not coalesce(old.historico_inicial,false) then
  if coalesce(new.soporte_path,'') not like 'aliados/pagos/%' then
   raise exception 'Comprobante inválido: carga el archivo antes de registrar el pago';
  end if;
  select metadata into meta from storage.objects
   where bucket_id='soportes' and name=new.soporte_path;
  if not found then raise exception 'El comprobante no se ha cargado. No se registró ningún pago'; end if;
  if coalesce(meta->>'mimetype','') not in ('application/pdf','image/jpeg','image/png')
    or coalesce((meta->>'size')::bigint,0) not between 1 and 10485760 then
   raise exception 'El soporte debe ser una imagen o PDF de máximo 10 MB';
  end if;
 end if;
 return new;
end $$;
revoke all on function kora_private.exigir_soporte_real_pago() from public,anon,authenticated;
create trigger exigir_soporte_real_pago before update of estado on public.payment_orders
 for each row execute function kora_private.exigir_soporte_real_pago();

-- Preserve the current PayJoy basis pending explicit business validation.
alter table public.liquidation_calculations drop constraint liquidation_calculations_check;
alter table public.liquidation_calculations add constraint liquidation_calculations_check
 check(pagamos>=0 and pago_aliado>=0 and total_bonos>=0);
do $migration$
declare body text; old_guard text := 'if v_pago<0 or v_util<0 then raise exception ''valor_negativo_imposible''; end if;';
begin
 select pg_get_functiondef('kora_private.calcular_liquidacion_sin_datos_pago(uuid)'::regprocedure) into body;
 if position(old_guard in body)=0 then raise exception 'Motor distinto del auditado: revisar antes de aplicar'; end if;
 body:=replace(body,old_guard,$replacement$
    if v_pago<0 then raise exception 'valor_pago_negativo_imposible'; end if;
    if v_util<0 then
      insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion,bloquea_aprobacion)
      values(p_id,o.id,'utilidad_negativa_seguimiento','La operación genera pérdida. Se conserva PAGAMOS; Gestión debe revisar la política.',false)
      on conflict(liquidation_id,operation_id,tipo) do update
       set descripcion=excluded.descripcion,bloquea_aprobacion=false;
    end if;
 $replacement$);
 execute body;
end $migration$;
