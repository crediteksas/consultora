begin;

-- La referencia 1CV1001 tenía el costo interno ($356.108) copiado al campo
-- de precio comercial sugerido. El costo de cada tienda permanece intacto en
-- unidades.precio_tienda y coincide con su remision_items.precio_remision.
-- Sin precio comercial aprobado, la venta debe pedirlo al vendedor.
do $retail$
begin
  if not exists (
    select 1 from public.productos
    where id = '4a0be743-557a-4ca6-a83a-d34f865ea24b'
      and codigo = '1CV1001'
  ) then
    raise exception 'No se encontró la referencia SM A07 6/128GB (CV) esperada';
  end if;

  if exists (
    select 1 from public.productos
    where id = '4a0be743-557a-4ca6-a83a-d34f865ea24b'
      and codigo = '1CV1001'
      and precio_guia is not null
      and precio_guia <> 356108
  ) then
    raise exception 'El precio guía ya cambió; revisar antes de corregirlo';
  end if;

  update public.productos
  set precio_guia = null
  where id = '4a0be743-557a-4ca6-a83a-d34f865ea24b'
    and codigo = '1CV1001'
    and precio_guia = 356108;
end;
$retail$;

commit;
