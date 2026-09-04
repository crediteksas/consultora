alter table public.aliados_gastos_operativos add column if not exists beneficiario text, add column if not exists cuenta_destino text, add column if not exists treasury_movement_id uuid references public.treasury_movements(id);
alter table public.treasury_movements add column if not exists aliados_gasto_id uuid references public.aliados_gastos_operativos(id);
create unique index if not exists treasury_movements_aliados_gasto_unique on public.treasury_movements(aliados_gasto_id) where aliados_gasto_id is not null;

drop function if exists public.aliados_registrar_gasto(date,text,text,text,text,numeric,text);
create function public.aliados_registrar_gasto(p_fecha date,p_plataforma text,p_origen_codigo text,p_concepto text,p_descripcion text,p_valor numeric,p_beneficiario text,p_cuenta_destino text,p_soporte_path text)
returns public.aliados_gastos_operativos language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.aliados_gastos_operativos%rowtype;
begin
 if not public.tiene_capacidad_aliados('revisor') then raise exception 'No autorizado para registrar gastos de Aliados'; end if;
 if nullif(btrim(coalesce(p_beneficiario,'')),'') is null or nullif(btrim(coalesce(p_cuenta_destino,'')),'') is null then raise exception 'Completa beneficiario y cuenta destino para preparar el pago'; end if;
 insert into public.aliados_gastos_operativos(fecha,plataforma,origen_codigo,concepto,descripcion,valor,beneficiario,cuenta_destino,soporte_path,registrado_por)
 values(coalesce(p_fecha,current_date),nullif(p_plataforma,''),nullif(btrim(p_origen_codigo),''),btrim(p_concepto),nullif(btrim(p_descripcion),''),p_valor,btrim(p_beneficiario),btrim(p_cuenta_destino),nullif(btrim(p_soporte_path),''),auth.uid()) returning * into v;
 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),'aliados_gasto_registrado','aliados_gastos_operativos',v.id,to_jsonb(v)); return v;
end $$;

create or replace function public.aliados_decidir_gasto(p_id uuid,p_estado text)
returns public.aliados_gastos_operativos language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.aliados_gastos_operativos%rowtype;m public.treasury_movements%rowtype;
begin
 if not public.tiene_capacidad_aliados('aprobador') then raise exception 'Solo Gerencia puede aprobar o rechazar gastos'; end if;
 if p_estado not in ('aprobado','rechazado','anulado') then raise exception 'Estado no permitido'; end if;
 select * into v from public.aliados_gastos_operativos where id=p_id for update;
 if not found or v.estado<>'pendiente' then raise exception 'Gasto no encontrado o ya decidido'; end if;
 if p_estado='aprobado' and (nullif(btrim(coalesce(v.beneficiario,'')),'') is null or nullif(btrim(coalesce(v.cuenta_destino,'')),'') is null) then raise exception 'El gasto no tiene beneficiario o cuenta destino'; end if;
 update public.aliados_gastos_operativos set estado=p_estado,aprobado_por=auth.uid(),aprobado_at=now(),updated_at=now() where id=p_id returning * into v;
 if p_estado='aprobado' then
  insert into public.treasury_movements(unit,direction,type,beneficiary,concept,amount,destination_account,movement_date,status,requested_by,idempotency_key,aliados_gasto_id)
  values('tercerizacion','debit','gasto_administrativo',v.beneficiario,'Gasto Aliados — '||v.concepto,v.valor,v.cuenta_destino,v.fecha,'pendiente',v.registrado_por,'aliados-gasto:'||v.id,v.id)
  on conflict (idempotency_key) do update set updated_at=now() returning * into m;
  update public.aliados_gastos_operativos set treasury_movement_id=m.id where id=v.id returning * into v;
 end if;
 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),'aliados_gasto_'||p_estado,'aliados_gastos_operativos',v.id,to_jsonb(v)||jsonb_build_object('treasury_movement_id',m.id)); return v;
end $$;

create or replace function public.tesoreria_cambiar_estado_movimiento(p_id uuid,p_status text,p_support_path text default null)
returns public.treasury_movements language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.treasury_movements%rowtype;balance_data jsonb;provider_payment jsonb;
begin
 if not public.tiene_capacidad_aliados('revisor') then raise exception 'No autorizado para Tesorería';end if;
 select * into m from public.treasury_movements where id=p_id for update;if not found then raise exception 'Movimiento no encontrado';end if;
 if m.status in('pagado','conciliado','anulado') then raise exception 'Movimiento inmutable; use reversión o ajuste';end if;
 if m.aliados_gasto_id is not null and m.authorized_by is null and p_status in('programado','pagado') then raise exception 'El pago del gasto requiere autorización de Oscar';end if;
 if p_status='programado' and m.status='pendiente' then
  if m.type='retiro_socios' and m.authorized_by is null then raise exception 'Retiro de socios requiere autorización de Óscar';end if;
  update public.treasury_movements set status='programado',support_path=coalesce(nullif(btrim(coalesce(p_support_path,'')),''),support_path),updated_at=now() where id=m.id returning * into m;
 elsif p_status='pagado' and m.status='programado' then
  if nullif(btrim(coalesce(p_support_path,m.support_path,'')),'') is null then raise exception 'No se puede marcar Pagado sin soporte';end if;
  if m.type='retiro_socios' and (m.authorized_by is null or not public.tiene_capacidad_aliados('aprobador')) then raise exception 'Solo Óscar puede ejecutar el retiro autorizado';end if;
  balance_data:=public.tesoreria_aplicar_saldo(m.unit,'debit',m.amount,'movement:'||m.id);
  if m.type='pago_proveedor' then provider_payment:=public.registrar_pago_proveedor(m.supplier_invoice_id,m.amount,m.movement_date,'saldo_b2b',m.concept,coalesce(p_support_path,m.support_path),m.concept,m.id::text::uuid);end if;
  update public.treasury_movements set status='pagado',support_path=coalesce(p_support_path,support_path),balance_before=(balance_data->>'before')::numeric,balance_after=(balance_data->>'after')::numeric,paid_by=auth.uid(),updated_at=now() where id=m.id returning * into m;
 elsif p_status='conciliado' and m.status='pagado' then update public.treasury_movements set status='conciliado',updated_at=now() where id=m.id returning * into m;
 else raise exception 'Transición de Tesorería inválida';end if;
 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),'tesoreria_movimiento_'||p_status,'treasury_movements',m.id,jsonb_build_object('unit',m.unit,'type',m.type,'amount',m.amount,'aliados_gasto_id',m.aliados_gasto_id)); return m;
end $$;

revoke all on function public.aliados_registrar_gasto(date,text,text,text,text,numeric,text,text,text),public.aliados_decidir_gasto(uuid,text),public.tesoreria_cambiar_estado_movimiento(uuid,text,text) from public,anon;
grant execute on function public.aliados_registrar_gasto(date,text,text,text,text,numeric,text,text,text),public.aliados_decidir_gasto(uuid,text),public.tesoreria_cambiar_estado_movimiento(uuid,text,text) to authenticated;
