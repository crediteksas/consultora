-- Gestión puede retirar una importación provisional; nunca revertir un pago.
-- El archivo original y un snapshot privado se conservan para auditoría/recuperación.
create schema if not exists kora_private;
create table kora_private.liquidaciones_retiradas (
  liquidation_id uuid primary key,
  retirado_por uuid not null,
  retirado_at timestamptz not null default now(),
  motivo text not null,
  snapshot jsonb not null
);
alter table kora_private.liquidaciones_retiradas enable row level security;
revoke all on kora_private.liquidaciones_retiradas from public, anon, authenticated;

create function kora_private.eliminar_importacion(p_id uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v public.liquidations%rowtype;
  v_snapshot jsonb;
  v_rows jsonb;
  v_table text;
begin
  if auth.uid() is null or not coalesce(public.tiene_capacidad_aliados('revisor'),false) then
    raise exception 'No autorizado para eliminar importaciones';
  end if;
  if length(btrim(coalesce(p_motivo,''))) < 5 or length(p_motivo) > 1000 then
    raise exception 'Indica el motivo de eliminación (5 a 1000 caracteres)';
  end if;
  -- Serializa doble clic/reintento, incluso después de retirar la fila del lote.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text, 712));
  if exists(select 1 from kora_private.liquidaciones_retiradas where liquidation_id=p_id) then
    return jsonb_build_object('id',p_id,'retirada',true,'ya_retirada',true);
  end if;
  select * into v from public.liquidations where id=p_id for update;
  if not found then raise exception 'La importación ya no existe. Actualiza la lista.'; end if;
  if coalesce(v.estado,'') not in ('importada','validada','con_novedades','calculada','revisada')
     or v.frozen_at is not null or v.approved_at is not null or v.approved_by is not null
     or exists(select 1 from public.liquidation_approvals where liquidation_id=p_id and etapa='aprobacion') then
    raise exception 'No se puede eliminar: el lote ya fue aprobado o pasó a pagos';
  end if;
  -- Bloquea las órdenes antes de comprobarlas: no compite con su autorización.
  perform 1 from public.payment_orders where liquidation_id=p_id order by id for update;
  if exists(select 1 from public.payment_orders where liquidation_id=p_id and
    (estado is distinct from 'pendiente' or authorized_at is not null or authorized_by is not null
      or fecha_pagada is not null or paid_by is not null or nullif(soporte_path,'') is not null)) then
    raise exception 'No se puede eliminar: existen órdenes autorizadas, programadas o con soporte';
  end if;
  if exists(select 1 from public.liquidation_treasury_destinations where liquidation_id=p_id)
    or exists(select 1 from public.retail_b2b_compensations where liquidation_id=p_id)
    or exists(select 1 from public.treasury_movements where liquidation_id=p_id or payment_order_id in (select id from public.payment_orders where liquidation_id=p_id))
    or exists(select 1 from public.cobros_expected where liquidation_id=p_id)
    or exists(select 1 from public.aliados_gastos_operativos where liquidation_id=p_id)
    or exists(select 1 from public.liquidation_adjustments where liquidation_id=p_id) then
    raise exception 'No se puede eliminar: tiene movimientos financieros o ajustes vinculados';
  end if;
  -- Estos registros pueden ser anteriores a la importación. No borrar ni
  -- sobrescribir créditos reales ni instrucciones inmutables para retirar un Excel.
  if exists(select 1 from public.creditos_historicos_plataforma where datos_origen->>'liquidacion_origen_id'=p_id::text)
    or exists(select 1 from public.krediya_instrucciones where liquidation_id=p_id) then
    raise exception 'La importación tiene créditos o gestiones vinculadas. Requiere revisión antes de retirarla; no se cambió ningún dato.';
  end if;
  v_snapshot := jsonb_build_object('liquidations',to_jsonb(v));
  foreach v_table in array array['liquidation_imported_files','liquidation_source_rows','liquidation_operations',
    'liquidation_calculations','liquidation_bonuses','liquidation_incidents','liquidation_approvals','payment_orders','krediya_diferencias'] loop
    execute format('select id from public.%I where liquidation_id=$1 order by id for update',v_table) using p_id;
    execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t where liquidation_id=$1',v_table)
      into v_rows using p_id;
    v_snapshot := v_snapshot || jsonb_build_object(v_table,v_rows);
  end loop;
  select coalesce(jsonb_agg(to_jsonb(i)),'[]'::jsonb) into v_rows from public.payment_items i
    where payment_order_id in (select id from public.payment_orders where liquidation_id=p_id);
  v_snapshot := v_snapshot || jsonb_build_object('payment_items',v_rows);
  insert into kora_private.liquidaciones_retiradas values(p_id,auth.uid(),now(),btrim(p_motivo),v_snapshot);
  delete from public.payment_items where payment_order_id in (select id from public.payment_orders where liquidation_id=p_id);
  delete from public.payment_orders where liquidation_id=p_id;
  delete from public.krediya_diferencias where liquidation_id=p_id;
  delete from public.liquidation_calculations where liquidation_id=p_id;
  delete from public.liquidation_bonuses where liquidation_id=p_id;
  delete from public.liquidation_incidents where liquidation_id=p_id;
  delete from public.liquidation_approvals where liquidation_id=p_id;
  delete from public.liquidation_operations where liquidation_id=p_id;
  delete from public.liquidation_source_rows where liquidation_id=p_id;
  -- Libera la huella para volver a importar. No borra el objeto de Storage.
  delete from public.liquidation_imported_files where liquidation_id=p_id;
  delete from public.liquidations where id=p_id;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
  values(auth.uid()::text,'liquidacion_importacion_retirada','liquidations',p_id::text,
    jsonb_build_object('motivo',btrim(p_motivo),'plataforma',v.plataforma,'corte',v.fecha_corte,
      'archivos',v_snapshot->'liquidation_imported_files','respaldo',true));
  return jsonb_build_object('id',p_id,'retirada',true,'respaldo',true);
exception when foreign_key_violation then
  raise exception 'No se eliminó la importación: existen registros relacionados que requieren revisión. No se cambió ningún dato.';
end $$;
revoke all on function kora_private.eliminar_importacion(uuid,text) from public,anon,authenticated;
grant usage on schema kora_private to authenticated;
grant execute on function kora_private.eliminar_importacion(uuid,text) to authenticated;

-- Entrada Data API sin privilegios; la implementación privada verifica la sesión
-- y el rol de Gestión antes de acceder al lote y al respaldo.
create function public.aliados_eliminar_importacion(p_id uuid,p_motivo text)
returns jsonb language sql security invoker set search_path = '' as $$
  select kora_private.eliminar_importacion(p_id,p_motivo);
$$;
revoke all on function public.aliados_eliminar_importacion(uuid,text) from public,anon;
grant execute on function public.aliados_eliminar_importacion(uuid,text) to authenticated;
