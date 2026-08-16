begin;

do $preflight$
begin
  if to_regclass('public.utilidad_creditek_rango') is null
     or to_regclass('public.perfiles') is null then
    raise exception 'Falta la vista de utilidad o la tabla de perfiles';
  end if;
end;
$preflight$;

create or replace function public.consultar_utilidad_creditek_rango(
  p_desde date,
  p_hasta date
)
returns setof public.utilidad_creditek_rango
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas no es válido';
  end if;
  if p_hasta - p_desde > 1095 then
    raise exception 'El rango máximo permitido es de tres años';
  end if;
  if not exists (
    select 1
    from public.perfiles p
    where p.id = auth.uid()
      and p.activo = true
      and p.rol in ('gerencia', 'auditoria')
  ) then
    raise exception 'No autorizado para consultar utilidad central';
  end if;

  return query
  select *
  from public.utilidad_creditek_rango u
  where u.fecha between p_desde and p_hasta
  order by u.fecha, u.consecutivo, u.remision_item_id;
end;
$$;

revoke all on function public.consultar_utilidad_creditek_rango(date, date)
  from public, anon;
grant execute on function public.consultar_utilidad_creditek_rango(date, date)
  to authenticated;

commit;
