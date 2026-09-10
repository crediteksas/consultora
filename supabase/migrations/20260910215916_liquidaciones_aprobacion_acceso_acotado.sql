-- Preserva íntegra la lógica y permisos por capacidad de la función existente.
-- No abre kora_private ni aprueba ningún lote durante la migración.
create schema liquidaciones_api_private;
revoke all on schema liquidaciones_api_private from public,anon;
grant usage on schema liquidaciones_api_private to authenticated;
alter function kora_private.cambiar_estado_liquidacion(uuid,text,text)
 set schema liquidaciones_api_private;
revoke all on function liquidaciones_api_private.cambiar_estado_liquidacion(uuid,text,text) from public,anon;
grant execute on function liquidaciones_api_private.cambiar_estado_liquidacion(uuid,text,text) to authenticated;
create or replace function public.aliados_cambiar_estado(p_id uuid,p_estado text,p_comentario text default null)
returns public.liquidations language sql security invoker set search_path='' as $$
 select liquidaciones_api_private.cambiar_estado_liquidacion(p_id,p_estado,p_comentario);
$$;
revoke all on function public.aliados_cambiar_estado(uuid,text,text) from public,anon;
grant execute on function public.aliados_cambiar_estado(uuid,text,text) to authenticated;
notify pgrst,'reload schema';
