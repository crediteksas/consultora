-- Una remisión directa a cartera B2B ya no tiene recepción pendiente ni
-- inventario de destino. Su corrección posterior se limita al precio: conserva
-- referencia, cantidad, factura y costo, y registra únicamente el diferencial
-- en el libro de cartera para no reescribir el movimiento original.
create function remisiones_b2b_private.corregir_precios(
  p_remision_id uuid,
  p_revision integer,
  p_precios jsonb,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_remision public.remisiones%rowtype;
  v_entrada jsonb;
  v_anterior jsonb;
  v_posterior jsonb;
  v_total_anterior numeric;
  v_total_nuevo numeric;
  v_diferencia numeric;
  v_cuenta_id uuid;
  v_revision_nueva integer;
  v_cantidad integer;
begin
  if auth.uid() is null or not remisiones_edicion_private.permitido() then
    raise exception 'Solo Maite o Gerencia puede corregir precios de remisiones B2B';
  end if;

  select * into v_remision
  from public.remisiones
  where id = p_remision_id
  for update;

  if not found or v_remision.estado <> 'cartera_b2b' then
    raise exception 'Solo se corrigen precios de remisiones ya cargadas a cartera B2B';
  end if;
  if p_revision is null or p_revision <> v_remision.revision then
    raise exception 'La remisión cambió. Cierra y vuelve a abrir antes de guardar';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escribe el motivo de la corrección (mínimo 5 caracteres)';
  end if;
  if p_precios is null or jsonb_typeof(p_precios) <> 'array' or jsonb_array_length(p_precios) = 0 then
    raise exception 'Incluye el precio de cada línea de la remisión';
  end if;

  select count(*) into v_cantidad
  from public.remision_items
  where remision_id = v_remision.id;
  if v_cantidad <> jsonb_array_length(p_precios) then
    raise exception 'No se puede agregar ni quitar productos; incluye todas las líneas originales';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_precios) e
    group by e->>'id'
    having e->>'id' is null or count(*) > 1
  ) then
    raise exception 'Hay líneas faltantes o repetidas';
  end if;

  for v_entrada in select value from jsonb_array_elements(p_precios)
  loop
    if not exists (
      select 1 from public.remision_items i
      where i.id = (v_entrada->>'id')::uuid
        and i.remision_id = v_remision.id
    ) then
      raise exception 'Una línea no pertenece a esta remisión';
    end if;
    if coalesce((v_entrada->>'precio_remision')::numeric, 0) <= 0
       or (v_entrada->>'precio_remision')::numeric::text in ('NaN','Infinity','-Infinity') then
      raise exception 'El precio de cada línea debe ser mayor que cero';
    end if;
  end loop;

  select jsonb_agg(to_jsonb(i) order by i.id), sum(i.cantidad * i.precio_remision)
    into v_anterior, v_total_anterior
  from public.remision_items i
  where i.remision_id = v_remision.id;

  for v_entrada in select value from jsonb_array_elements(p_precios)
  loop
    update public.remision_items
    set precio_remision = (v_entrada->>'precio_remision')::numeric
    where id = (v_entrada->>'id')::uuid
      and remision_id = v_remision.id;
  end loop;

  select jsonb_agg(to_jsonb(i) order by i.id), sum(i.cantidad * i.precio_remision)
    into v_posterior, v_total_nuevo
  from public.remision_items i
  where i.remision_id = v_remision.id;

  if v_anterior = v_posterior then
    raise exception 'No hay cambios de precio para guardar';
  end if;

  select count(*) into v_cantidad
  from public.movimientos_cartera m
  where m.referencia_tipo = 'remision_cliente_b2b'
    and m.referencia_id = v_remision.id::text
    and m.efecto = 'debito';
  if v_cantidad <> 1 then
    raise exception 'La remisión no tiene un cargo original único; requiere revisión de cartera';
  end if;

  select m.cuenta_id into v_cuenta_id
  from public.movimientos_cartera m
  where m.referencia_tipo = 'remision_cliente_b2b'
    and m.referencia_id = v_remision.id::text
    and m.efecto = 'debito';

  v_diferencia := v_total_nuevo - v_total_anterior;
  v_revision_nueva := v_remision.revision + 1;
  if v_diferencia <> 0 then
    insert into public.movimientos_cartera(
      cuenta_id, tienda_codigo, efecto, monto, concepto,
      referencia_tipo, referencia_id, fecha_efectiva, metadatos, creado_por
    ) values (
      v_cuenta_id,
      v_remision.tienda_codigo,
      case when v_diferencia > 0 then 'debito' else 'credito' end,
      abs(v_diferencia),
      'Ajuste precio Remisión B2B #' || v_remision.consecutivo,
      'ajuste_precio_remision_cliente_b2b',
      v_remision.id::text || ':' || v_revision_nueva::text,
      (now() at time zone 'America/Bogota')::date,
      jsonb_build_object(
        'remision_id', v_remision.id,
        'revision', v_revision_nueva,
        'total_anterior', v_total_anterior,
        'total_nuevo', v_total_nuevo,
        'diferencia', v_diferencia,
        'motivo', btrim(p_motivo),
        'unidad_negocio', 'b2b'
      ),
      auth.uid()
    );
  end if;

  update public.remisiones
  set revision = v_revision_nueva
  where id = v_remision.id;

  insert into remisiones_edicion_private.historial(
    remision_id, revision, usuario_id, motivo, anterior, posterior
  ) values (
    v_remision.id, v_revision_nueva, auth.uid(), btrim(p_motivo), v_anterior, v_posterior
  );

  return jsonb_build_object(
    'ok', true,
    'remision_id', v_remision.id,
    'revision', v_revision_nueva,
    'total_anterior', v_total_anterior,
    'total_nuevo', v_total_nuevo,
    'diferencia_cartera', v_diferencia
  );
end;
$$;

revoke all on function remisiones_b2b_private.corregir_precios(uuid,integer,jsonb,text)
  from public, anon, authenticated;
grant execute on function remisiones_b2b_private.corregir_precios(uuid,integer,jsonb,text)
  to authenticated;

create function public.corregir_precios_remision_b2b(
  p_remision_id uuid,
  p_revision integer,
  p_precios jsonb,
  p_motivo text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select remisiones_b2b_private.corregir_precios(
    p_remision_id, p_revision, p_precios, p_motivo
  );
$$;

revoke all on function public.corregir_precios_remision_b2b(uuid,integer,jsonb,text)
  from public, anon;
grant execute on function public.corregir_precios_remision_b2b(uuid,integer,jsonb,text)
  to authenticated;

comment on function public.corregir_precios_remision_b2b(uuid,integer,jsonb,text) is
  'Corrige solo precios de una remisión en cartera B2B. Conserva mercancía y registra el diferencial contable con auditoría.';

notify pgrst, 'reload schema';
