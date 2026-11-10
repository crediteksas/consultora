create table public.retenciones_factura_proveedor (
  id uuid primary key default gen_random_uuid(),
  factura_id uuid not null references public.facturas_proveedor(id),
  tipo text not null check (tipo in ('ReteFuente', 'ReteIVA', 'ReteICA')),
  base numeric(16,2) not null check (base > 0),
  tarifa_porcentaje numeric(8,5) not null check (tarifa_porcentaje > 0 and tarifa_porcentaje <= 100),
  valor numeric(16,2) not null check (valor > 0 and valor <= base),
  fecha date not null,
  descontada_al_registrar boolean not null default false,
  referencia text not null check (char_length(referencia) between 1 and 250),
  registrado_por uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (factura_id, tipo, fecha, base, tarifa_porcentaje, valor)
);

alter table public.retenciones_factura_proveedor enable row level security;
revoke all on public.retenciones_factura_proveedor from public, anon, authenticated;
grant select on public.retenciones_factura_proveedor to authenticated;

create policy retenciones_proveedor_lectura_central
  on public.retenciones_factura_proveedor for select to authenticated
  using ((select public.es_central()));

create function public.registrar_retencion_factura_proveedor(
  p_factura_id uuid, p_tipo text, p_base numeric, p_tarifa_porcentaje numeric,
  p_valor numeric, p_fecha date, p_referencia text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_factura public.facturas_proveedor%rowtype;
  v_id uuid;
begin
  if v_usuario is null or not coalesce(public.es_central(), false) then
    raise exception 'Solo gerencia o auditoría pueden registrar retenciones' using errcode = '42501';
  end if;

  select * into v_factura
  from public.facturas_proveedor
  where id = p_factura_id
  for update;

  if not found or v_factura.origen_registro in ('saldo_inicial', 'ajuste_gerencia', 'anticipo_proveedor')
      or coalesce(v_factura.total, 0) <= 0 then
    raise exception 'Selecciona una factura de compra válida';
  end if;

  if p_fecha is null or p_fecha < v_factura.fecha
      or p_fecha > (now() at time zone 'America/Bogota')::date then
    raise exception 'La fecha debe estar entre la fecha de la factura y hoy';
  end if;

  if p_base is null or p_tarifa_porcentaje is null or p_valor is null
      or p_base <> round(p_base, 2) or p_valor <> round(p_valor, 2)
      or p_tarifa_porcentaje <> round(p_tarifa_porcentaje, 5)
      or p_valor > v_factura.total then
    raise exception 'Revisa la base, la tarifa y el importe de la retención';
  end if;

  if abs(p_valor - round(p_base * p_tarifa_porcentaje / 100, 2)) > 0.02 then
    raise exception 'El valor retenido debe coincidir con la base y la tarifa';
  end if;

  if p_valor + coalesce((select sum(valor) from public.retenciones_factura_proveedor
                         where factura_id = p_factura_id), 0) > v_factura.total then
    raise exception 'Las retenciones superan el total de la factura';
  end if;

  insert into public.retenciones_factura_proveedor
    (factura_id, tipo, base, tarifa_porcentaje, valor, fecha, referencia, registrado_por)
  values (p_factura_id, p_tipo, p_base, p_tarifa_porcentaje, p_valor,
          p_fecha, btrim(p_referencia), v_usuario)
  on conflict (factura_id, tipo, fecha, base, tarifa_porcentaje, valor) do nothing
  returning id into v_id;

  if v_id is null then
    raise exception 'Esta retención ya está registrada en la factura';
  end if;

  return v_id;
end;
$$;

revoke all on function public.registrar_retencion_factura_proveedor(uuid, text, numeric, numeric, numeric, date, text)
  from public, anon, authenticated;
grant execute on function public.registrar_retencion_factura_proveedor(uuid, text, numeric, numeric, numeric, date, text)
  to authenticated;

create or replace function public.registrar_compra_proveedor_operativa(
  p_proveedor_id uuid,
  p_numero_factura text,
  p_fecha date,
  p_tipo_compra text,
  p_fecha_vencimiento date,
  p_fuente_fondos text,
  p_items jsonb,
  p_soporte_path text,
  p_nota text,
  p_idempotency_key uuid,
  p_retenciones jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resultado jsonb;
  v_retencion record;
  v_retencion_id uuid;
  v_total_retenido numeric := 0;
  v_neto numeric;
  v_factura_id uuid;
  v_total numeric;
begin
  if not coalesce(public.es_central(), false) then
    raise exception 'Solo gerencia o auditoría pueden registrar compras';
  end if;
  if jsonb_typeof(p_retenciones) is distinct from 'array' then
    raise exception 'Las retenciones deben enviarse como una lista';
  end if;
  if p_idempotency_key is null then
    raise exception 'La llave de idempotencia es requerida';
  end if;
  if p_tipo_compra not in ('credito', 'contado') then
    raise exception 'Tipo de compra inválido';
  end if;
  if p_tipo_compra = 'credito' and p_fecha_vencimiento is null then
    raise exception 'La fecha de vencimiento es requerida';
  end if;
  if p_tipo_compra = 'contado'
     and p_fuente_fondos not in ('caja_central', 'banco_corporativo') then
    raise exception 'La fuente de fondos es requerida para compras de contado';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 0));
  select id, total into v_factura_id, v_total
  from public.facturas_proveedor
  where operacion_idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object(
      'ok', true, 'reutilizado', true, 'factura_id', v_factura_id,
      'total', v_total, 'tipo_compra', p_tipo_compra,
      'total_retenido', coalesce((select sum(valor) from public.retenciones_factura_proveedor
        where factura_id = v_factura_id and descontada_al_registrar), 0)
    );
  end if;

  v_resultado := public.registrar_compra_proveedor(
    p_proveedor_id, p_numero_factura, p_fecha, p_items,
    p_soporte_path, p_nota
  );
  v_factura_id := (v_resultado->>'factura_id')::uuid;
  v_total := (v_resultado->>'total')::numeric;

  update public.facturas_proveedor
  set tipo_compra = p_tipo_compra,
      fecha_vencimiento = case when p_tipo_compra = 'credito' then p_fecha_vencimiento else null end,
      operacion_idempotency_key = p_idempotency_key
  where id = v_factura_id;

  for v_retencion in
    select * from jsonb_to_recordset(p_retenciones)
      as r(tipo text, base numeric, tarifa numeric, valor numeric)
  loop
    v_retencion_id := public.registrar_retencion_factura_proveedor(
      v_factura_id, v_retencion.tipo, v_retencion.base, v_retencion.tarifa,
      v_retencion.valor, p_fecha, 'Registrada con la factura ' || p_numero_factura
    );
    update public.retenciones_factura_proveedor set descontada_al_registrar = true
    where id = v_retencion_id;
    v_total_retenido := v_total_retenido + v_retencion.valor;
  end loop;

  v_neto := v_total - v_total_retenido;
  if v_total_retenido > 0 then
    if v_neto < 0 then
      raise exception 'Las retenciones superan el total de la factura';
    end if;
    update public.facturas_proveedor set saldo = saldo - v_total_retenido
    where id = v_factura_id;
  end if;

  if p_tipo_compra = 'contado' and (v_neto > 0 or v_total_retenido = 0) then
    perform public.registrar_pago_proveedor(
      v_factura_id, v_neto, p_fecha, p_fuente_fondos,
      p_numero_factura, p_soporte_path, 'Compra pagada de contado',
      p_idempotency_key
    );
    insert into public.movimientos_tesoreria_central(
      fecha, tipo, fuente_fondos, monto, referencia_tipo, referencia_id,
      soporte_path, observacion, idempotency_key
    ) values (
      p_fecha, 'compra_contado', p_fuente_fondos, v_neto,
      'factura_proveedor', v_factura_id, p_soporte_path,
      coalesce(nullif(btrim(coalesce(p_nota, '')), ''), 'Compra de contado ' || p_numero_factura),
      p_idempotency_key
    );
  end if;

  return v_resultado || jsonb_build_object(
    'tipo_compra', p_tipo_compra,
    'pagada', p_tipo_compra = 'contado',
    'total_retenido', v_total_retenido,
    'fuente_fondos', p_fuente_fondos
  );
end;
$$;

revoke all on function public.registrar_compra_proveedor_operativa(
  uuid, text, date, text, date, text, jsonb, text, text, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.registrar_compra_proveedor_operativa(
  uuid, text, date, text, date, text, jsonb, text, text, uuid, jsonb
) to authenticated;

create or replace function public.registrar_compra_proveedor_operativa(
  p_proveedor_id uuid,
  p_numero_factura text,
  p_fecha date,
  p_tipo_compra text,
  p_fecha_vencimiento date,
  p_fuente_fondos text,
  p_items jsonb,
  p_soporte_path text default null,
  p_nota text default null,
  p_idempotency_key uuid default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.registrar_compra_proveedor_operativa(
    p_proveedor_id, p_numero_factura, p_fecha, p_tipo_compra, p_fecha_vencimiento,
    p_fuente_fondos, p_items, p_soporte_path, p_nota, p_idempotency_key, '[]'::jsonb
  );
$$;
