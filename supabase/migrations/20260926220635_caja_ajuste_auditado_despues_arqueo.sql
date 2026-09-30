-- Ajustes auditados posteriores al arqueo: movimiento separado, cierre intacto.
-- No ejecuta solicitudes pendientes ni cambia permisos/RPC de autorización.
begin;
set local lock_timeout = '5s';
create or replace function public.caja_guardar_movimiento()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare fila jsonb; anterior jsonb; tienda text; fecha_mov date; venta uuid;
begin
  fila:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  if tg_table_name in ('creditos','venta_items') then
    venta:=(fila->>'venta_id')::uuid;
    select tienda_codigo,fecha into tienda,fecha_mov from public.ventas where id=venta;
  else tienda:=fila->>'tienda_codigo'; fecha_mov:=(fila->>'fecha')::date; end if;

  -- Solo el INSERT exacto de una propuesta auditada que el RPC está autorizando.
  -- El trigger proteger_ajuste_caja y la comprobación final del RPC siguen activos.
  if tg_op='INSERT' and tg_table_schema='public'
    and tg_table_name='movimientos_caja_tienda'
    and fila->>'tipo' in ('ajuste_auditoria_entrada','ajuste_auditoria_salida') then
    if auth.uid() is distinct from '6de0ad26-64af-4966-8cd9-d468880af627'::uuid
      or not exists(select 1 from public.perfiles p
        where p.id=auth.uid() and p.activo and p.rol='gerencia')
      or fecha_mov is distinct from (now() at time zone 'America/Bogota')::date
      or (fila->>'autorizado_por')::uuid is distinct from auth.uid()
      or (fila->>'creado_por')::uuid is distinct from auth.uid()
      or not exists(
        select 1 from public.saldo_ajustes_auditoria a
        where a.id::text=nullif(current_setting('app.saldo_ajuste_id',true),'')
          and a.id::text=fila->>'idempotency_key'
          and a.tienda_codigo=tienda and a.estado='pendiente'
          and a.movimiento_caja_id is null
          and a.caja_objetivo>=0 and a.caja_objetivo<>a.caja_base
          and (fila->>'monto')::numeric=abs(a.caja_objetivo-a.caja_base)
          and fila->>'tipo'=case when a.caja_objetivo>a.caja_base
            then 'ajuste_auditoria_entrada' else 'ajuste_auditoria_salida' end
      ) then
      raise exception 'El movimiento no corresponde a un ajuste auditado autorizado por Gerencia';
    end if;
    return new;
  end if;

  -- Ambas tiendas/fechas se verifican al reasignar, no solo el destino nuevo.
  if tg_op='UPDATE' then
    anterior:=to_jsonb(old);
    if tg_table_name in ('creditos','venta_items') then
      if anterior->>'venta_id' is distinct from fila->>'venta_id' then
        perform public.caja_exigir_apertura(v.tienda_codigo,v.fecha,false) from public.ventas v where v.id=(anterior->>'venta_id')::uuid;
      end if;
    else
      perform public.caja_exigir_apertura(anterior->>'tienda_codigo',(anterior->>'fecha')::date,tg_table_name='gastos');
    end if;
  end if;
  perform public.caja_exigir_apertura(tienda,fecha_mov,tg_table_name='gastos');
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
commit;
