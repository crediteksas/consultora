begin;

drop policy if exists "central consulta ajustes de ventas" on public.venta_ajustes_administrativos;
drop policy if exists "tienda consulta ajustes de sus ventas" on public.venta_ajustes_administrativos;

create policy "usuarios consultan ajustes autorizados"
on public.venta_ajustes_administrativos for select to authenticated
using (
  (select public.es_central())
  or exists (
    select 1 from public.ventas v
    where v.id = venta_id
      and v.tienda_codigo = (select public.tienda_actual())
  )
);

commit;
