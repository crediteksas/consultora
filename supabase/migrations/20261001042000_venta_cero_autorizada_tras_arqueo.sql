begin;
set local lock_timeout = '5s';

-- Un obsequio ya registrado no ingresa ni retira efectivo. Solo Mayte u Óscar
-- pueden contabilizarlo después del arqueo, sin reabrir ni recalcular el corte.
create function kora_private.venta_cero_autorizada_tras_arqueo(
  p_tabla text, p_operacion text, p_fila jsonb, p_tienda text, p_fecha date
) returns boolean language plpgsql security definer set search_path = '' as $$
declare r public.ventas_autorizaciones;
begin
  if p_tabla not in ('ventas', 'venta_items')
     or p_operacion not in ('INSERT', 'UPDATE')
     or not public.puede_autorizar_venta_excepcional() then return false; end if;

  select * into r from public.ventas_autorizaciones
   where id = case when p_tabla = 'ventas' then (p_fila->>'id')::uuid
                   else (p_fila->>'venta_id')::uuid end;
  if not found or r.estado <> 'pendiente' or r.tipo <> 'contado'
     or r.credito is not null or r.total <> 0
     or r.tienda_codigo is distinct from p_tienda
     or p_fecha is distinct from (r.creado_en at time zone 'America/Bogota')::date
     or p_fecha > (now() at time zone 'America/Bogota')::date
     or jsonb_typeof(r.items) <> 'array' or jsonb_array_length(r.items) = 0
     or exists (select 1 from jsonb_array_elements(r.items) i
                where (i->>'precio_venta')::numeric <> 0) then return false; end if;

  if p_tabla = 'ventas' then
    return (p_fila->>'id')::uuid = r.id
       and (p_fila->>'consecutivo')::bigint = r.consecutivo_venta
       and (p_fila->>'vendedor')::uuid is not distinct from r.creado_por
       and (p_fila->>'cliente_id')::uuid is not distinct from r.cliente_id
       and p_fila->>'tipo' = 'contado'
       and (p_fila->>'total')::numeric = 0
       and (p_fila->>'anulada')::boolean = false
       and p_fila->>'nota' is not distinct from r.nota;
  end if;

  -- Cada renglón debe ser exactamente uno de los ya revisados. No se habilitan
  -- ventas mixtas, iniciales, cobros ni cambios posteriores al visto bueno.
  return p_operacion = 'INSERT'
     and (p_fila->>'precio_venta')::numeric = 0
     and (select count(*) from public.venta_items vi
           where vi.venta_id = r.id
             and vi.producto_id = (p_fila->>'producto_id')::uuid
             and vi.unidad_id is not distinct from (p_fila->>'unidad_id')::uuid
             and vi.cantidad = (p_fila->>'cantidad')::numeric
             and vi.precio_venta = 0)
         < (select count(*) from jsonb_array_elements(r.items) i
             where (i->>'producto_id')::uuid = (p_fila->>'producto_id')::uuid
               and (i->>'unidad_id')::uuid is not distinct from (p_fila->>'unidad_id')::uuid
               and (i->>'cantidad')::numeric = (p_fila->>'cantidad')::numeric
               and (i->>'precio_venta')::numeric = 0)
     and exists (
       select 1 from jsonb_array_elements(r.items) i
        where (i->>'producto_id')::uuid = (p_fila->>'producto_id')::uuid
          and (i->>'unidad_id')::uuid is not distinct from (p_fila->>'unidad_id')::uuid
          and (i->>'cantidad')::numeric = (p_fila->>'cantidad')::numeric
          and (i->>'precio_venta')::numeric = 0
     );
end;
$$;
revoke all on function kora_private.venta_cero_autorizada_tras_arqueo(text,text,jsonb,text,date)
  from public, anon, authenticated;

do $$
declare d text;
begin
  d := pg_get_functiondef('public.caja_guardar_movimiento()'::regprocedure);
  if position('  -- Ambas tiendas/fechas se verifican al reasignar' in d) = 0 then
    raise exception 'Cambió la guarda de Caja; revisar antes de aplicar la excepción';
  end if;
  d := replace(d, '  -- Ambas tiendas/fechas se verifican al reasignar',
  $guard$  -- El obsequio exacto, pendiente y autorizado no afecta efectivo del corte.
  if tg_table_name in ('ventas','venta_items') and tg_op in ('INSERT','UPDATE')
     and (tg_op = 'INSERT' or (tg_table_name = 'ventas'
       and to_jsonb(old)->>'id' = fila->>'id'
       and to_jsonb(old)->>'tienda_codigo' = fila->>'tienda_codigo'
       and to_jsonb(old)->>'fecha' = fila->>'fecha'
       and to_jsonb(old)->>'tipo' = fila->>'tipo'
       and to_jsonb(old)->>'total' = '0'))
     and kora_private.venta_cero_autorizada_tras_arqueo(tg_table_name,tg_op,fila,tienda,fecha_mov) then
    return new;
  end if;

  -- Ambas tiendas/fechas se verifican al reasignar$guard$);
  execute d;
end $$;

commit;
