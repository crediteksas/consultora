-- Solo lectura. Una consulta por lote reutiliza exactamente el contraste del editor.
create or replace function public.aliados_contextos_precios_krediya(p_liquidation_id uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
  if auth.uid() is null or not public.tiene_capacidad_aliados('revisor') then
    raise exception 'No autorizado';
  end if;
  return coalesce((select jsonb_agg(public.aliados_contexto_precio_krediya(o.id) order by o.operation_at,o.id)
    from public.liquidation_operations o
    where o.liquidation_id=p_liquidation_id and o.plataforma='krediya' and o.reconocida), '[]'::jsonb);
end $$;
revoke all on function public.aliados_contextos_precios_krediya(uuid) from public,anon;
grant execute on function public.aliados_contextos_precios_krediya(uuid) to authenticated;
