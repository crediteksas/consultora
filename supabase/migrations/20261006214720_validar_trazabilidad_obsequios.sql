begin;

-- Cada línea a $0 conserva destinatario y la venta que originó el obsequio.
-- La comprobación se ejecuta también al aprobar registros anteriores para
-- impedir que otro cliente omita los campos del formulario.
create function kora_private.validar_trazabilidad_obsequios(p_tienda text, p_items jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare
  linea jsonb;
  ob jsonb;
  vinculada jsonb;
  producto public.productos;
  venta_previa public.ventas;
  numero bigint;
  es_vidrio boolean;
  nombre_vendido text;
  imei_vendido text;
begin
  for linea in select value from jsonb_array_elements(p_items) loop
    if (linea->>'precio_venta')::numeric is distinct from 0 then continue; end if;
    ob:=linea->'obsequio';
    if jsonb_typeof(ob) is distinct from 'object'
       or length(btrim(coalesce(ob->>'destinatario',''))) < 3 then
      raise exception 'El obsequio requiere el nombre de la persona que lo recibe';
    end if;
    select * into producto from public.productos where id=(linea->>'producto_id')::uuid;
    es_vidrio:=coalesce(upper(producto.categoria)='VIDRIOS' or producto.nombre ilike '%vidrio%',false);
    if ob->>'relacion'='sin_venta' then
      if es_vidrio then raise exception 'Un vidrio de obsequio debe estar vinculado a un celular vendido'; end if;
      if length(btrim(coalesce(ob->>'motivo',''))) < 10 then
        raise exception 'Explica por qué se entrega el obsequio sin una venta';
      end if;
    elsif ob->>'relacion'='esta_venta' then
      if nullif(ob->>'producto_vendido_id','') is null then
        raise exception 'Selecciona el producto vendido al que corresponde el obsequio';
      end if;
      select value into vinculada from jsonb_array_elements(p_items)
      where value->>'producto_id'=ob->>'producto_vendido_id'
        and coalesce(value->>'unidad_id','')=coalesce(ob->>'unidad_vendida_id','')
        and (value->>'precio_venta')::numeric>0 limit 1;
      if vinculada is null then raise exception 'El producto vendido no figura en esta venta'; end if;
      select p.nombre,u.imei into nombre_vendido,imei_vendido from public.productos p
      left join public.unidades u on u.id=(ob->>'unidad_vendida_id')::uuid
      where p.id=(ob->>'producto_vendido_id')::uuid;
      if es_vidrio and not exists(
        select 1 from public.unidades u join public.productos p on p.id=u.producto_id
        where u.id=(ob->>'unidad_vendida_id')::uuid
          and u.id=(vinculada->>'unidad_id')::uuid and p.tipo='serializado'
      ) then raise exception 'El vidrio de obsequio debe estar asociado al IMEI de un celular vendido'; end if;
    elsif ob->>'relacion'='venta_anterior' then
      if coalesce(ob->>'venta_numero','') !~ '^[0-9]+$' then
        raise exception 'Indica el número de la venta anterior'; end if;
      numero:=(ob->>'venta_numero')::bigint;
      select * into venta_previa from public.ventas
      where consecutivo=numero and tienda_codigo=p_tienda and not anulada;
      if not found then raise exception 'La venta relacionada no existe o no corresponde a esta tienda'; end if;
      if not exists(
        select 1 from public.venta_items vi join public.productos p on p.id=vi.producto_id
        where vi.venta_id=venta_previa.id
          and vi.producto_id=(ob->>'producto_vendido_id')::uuid
          and coalesce(vi.unidad_id::text,'')=coalesce(ob->>'unidad_vendida_id','')
          and vi.precio_venta>0
          and (not es_vidrio or (p.tipo='serializado' and vi.unidad_id is not null))
      ) then raise exception 'El producto vendido no figura en la venta relacionada'; end if;
      select p.nombre,u.imei into nombre_vendido,imei_vendido from public.productos p
      left join public.unidades u on u.id=(ob->>'unidad_vendida_id')::uuid
      where p.id=(ob->>'producto_vendido_id')::uuid;
    else
      raise exception 'Indica la venta relacionada o el motivo del obsequio';
    end if;
    if ob->>'relacion' in ('esta_venta','venta_anterior') then
      if btrim(coalesce(ob->>'descripcion_venta','')) is distinct from nombre_vendido
         or coalesce(ob->>'imei','') is distinct from coalesce(imei_vendido,'') then
        raise exception 'La descripción del producto vendido o su IMEI no coincide con la venta relacionada';
      end if;
    end if;
  end loop;
end $$;
revoke all on function kora_private.validar_trazabilidad_obsequios(text,jsonb) from public,anon,authenticated;

create function kora_private.exigir_trazabilidad_obsequios() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.estado in ('pendiente','aprobada','registrada') then
    perform kora_private.validar_trazabilidad_obsequios(new.tienda_codigo,new.items);
  end if;
  return new;
end $$;
revoke all on function kora_private.exigir_trazabilidad_obsequios() from public,anon,authenticated;
create trigger ventas_obsequios_trazabilidad
before insert or update of estado,items on public.ventas_autorizaciones
for each row execute function kora_private.exigir_trazabilidad_obsequios();

comment on function kora_private.validar_trazabilidad_obsequios(text,jsonb) is
  'Bloquea obsequios sin destinatario y sin venta verificable o motivo de excepción; los vidrios siempre requieren celular vendido.';
commit;
