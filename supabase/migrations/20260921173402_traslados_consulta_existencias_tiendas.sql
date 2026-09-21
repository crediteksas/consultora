-- Solo disponibilidad para consulta; no modifica RLS de inventario ni permite moverlo.
create or replace function kora_private.traslados_existencias_consulta()
returns table(producto_id uuid, tienda_codigo text, tienda_nombre text, cantidad integer)
language sql stable security definer set search_path = '' as $$
  select s.producto_id,s.tienda_codigo,o.nombre,s.cantidad
  from public.stock_cantidad s
  join public.origenes o on o.codigo=s.tienda_codigo and o.activo and o.tipo='propia'
  join public.productos p on p.id=s.producto_id and p.activo and p.tipo='cantidad'
  where s.cantidad>0 and auth.uid() is not null and exists (
    select 1 from public.perfiles u where u.id=auth.uid() and u.activo
    and (u.rol in ('gerencia','auditoria') or (u.rol='admin_tienda' and u.tienda_codigo is not null))
  );
$$;
revoke all on function kora_private.traslados_existencias_consulta() from public, anon;
grant execute on function kora_private.traslados_existencias_consulta() to authenticated;
create or replace function public.traslados_existencias_consulta()
returns table(producto_id uuid, tienda_codigo text, tienda_nombre text, cantidad integer)
language sql stable security invoker set search_path = '' as $$
  select * from kora_private.traslados_existencias_consulta();
$$;
revoke all on function public.traslados_existencias_consulta() from public, anon;
grant execute on function public.traslados_existencias_consulta() to authenticated;
