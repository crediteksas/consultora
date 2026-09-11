-- Consulta mínima: no concede acceso a importes ni márgenes de Tesorería.
create or replace function public.cuenta_corriente_imei_compensaciones(p_ids text[])
returns table (referencia_id text, tienda_codigo text, imei text)
language sql stable security definer set search_path = public, pg_temp
as $$
  select distinct c.referencia_id, c.tienda_codigo::text, r.imei::text
  from public.cuenta_corriente c
  join public.retail_b2b_compensations r
    on r.id::text = c.referencia_id and r.store_code = c.tienda_codigo
  where auth.uid() is not null
    and c.referencia_tipo = 'compensacion_liquidacion_retail'
    and c.referencia_id = any(p_ids)
    and (public.es_central() or
      (public.rol_actual() = 'admin_tienda' and c.tienda_codigo = public.tienda_actual()))
$$;
revoke all on function public.cuenta_corriente_imei_compensaciones(text[]) from public, anon;
grant execute on function public.cuenta_corriente_imei_compensaciones(text[]) to authenticated;
