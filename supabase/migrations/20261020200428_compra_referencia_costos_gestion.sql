begin;
create or replace function public.compra_referencia_costos_gestion(p_producto_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare resultado jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.perfiles where id=auth.uid() and activo and rol in ('gerencia','auditoria')) then
 raise exception 'Solo Gestión puede consultar costos de compra' using errcode='42501'; end if;
 select jsonb_build_object('costo',m.costo,'precio_remision',m.precio,'factura',f.numero,'fecha',f.fecha)
 into resultado from public.movimientos m
 join public.facturas_proveedor f on f.id::text=m.referencia_id
 where m.producto_id=p_producto_id and m.tipo='compra_entrada' and m.referencia_tipo='factura_proveedor' and m.cantidad>0
 and not exists(select 1 from public.movimientos r where r.reverso_de=m.id and r.tipo='reverso')
 order by f.fecha desc,m.created_at desc,m.id desc limit 1;
 return resultado;
end $$;
revoke all on function public.compra_referencia_costos_gestion(uuid) from public,anon;
grant execute on function public.compra_referencia_costos_gestion(uuid) to authenticated;
notify pgrst,'reload schema';
commit;