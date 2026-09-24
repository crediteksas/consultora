begin;

-- Regla autorizada: 0,50 baja; desde 0,51 sube. Se aplica al neto final,
-- no por separado a la tarifa y al IVA, que conservan precisión para auditoría.
create function cobros_private.addi_redondear_peso(p_valor numeric)
returns numeric language sql immutable strict security invoker set search_path='' as $$
  select floor(p_valor) + case when p_valor-floor(p_valor)>0.50 then 1 else 0 end
$$;
revoke all on function cobros_private.addi_redondear_peso(numeric) from public,anon,authenticated;

create or replace function cobros_private.addi_calculo(p_venta_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  a public.addi_liquidaciones%rowtype;
  c public.creditos%rowtype;
  v_base numeric(16,2); v_pct numeric(8,6); v_fee numeric(16,2);
  v_iva numeric(16,2); v_neto numeric(16,2); v_neto_sin_redondeo numeric(16,2);
  v_pagamos numeric(16,2); v_pago numeric(16,2); v_utilidad numeric(16,2);
  v_tipo text; v_fuente text; v_referencia text;
begin
  select * into a from public.addi_liquidaciones where venta_id=p_venta_id;
  if not found then raise exception 'Liquidación Addi no encontrada'; end if;
  select * into c from public.creditos where id=a.credito_id;
  select o.tipo,p.porcentaje into v_tipo,v_pct
    from public.origenes o join cobros_private.addi_politicas p
      on p.tipo_establecimiento=o.tipo and a.fecha_venta>=p.vigente_desde
    where o.codigo=a.tienda_codigo and o.activo;
  if v_pct is null then raise exception 'La tienda Addi no tiene política propia/aliado vigente'; end if;
  select r.credito_bruto,r.fuente,r.referencia_addi into v_base,v_fuente,v_referencia
    from cobros_private.addi_bases_reportadas r where r.venta_id=p_venta_id;
  v_base:=coalesce(v_base,c.valor_esperado_financiera);
  v_fuente:=coalesce(v_fuente,'credito_kora_sin_reporte_addi');
  if v_base is null or v_base<=0 or c.cuota_inicial is null or c.cuota_inicial<0 then
    raise exception 'Base o inicial Addi inválida';
  end if;
  v_fee:=round(v_base*0.075,2);
  v_iva:=round(v_fee*0.19,2);
  v_neto_sin_redondeo:=v_base-v_fee-v_iva;
  v_neto:=cobros_private.addi_redondear_peso(v_neto_sin_redondeo);
  v_pagamos:=round(v_base*v_pct,2);
  v_pago:=v_pagamos-c.cuota_inicial;
  v_utilidad:=v_neto-v_pago;
  if v_pago<0 or v_utilidad<0 then raise exception 'Liquidación Addi negativa; revisión requerida'; end if;
  return jsonb_build_object(
    'credito_bruto',v_base,'credito_kora',c.valor_esperado_financiera,
    'diferencia_base',v_base-c.valor_esperado_financiera,
    'base_fuente',v_fuente,'referencia_addi',v_referencia,
    'tipo_establecimiento',v_tipo,'porcentaje_politica',v_pct,
    'inicial_tienda',c.cuota_inicial,'pagamos_tienda',v_pagamos,
    'pago_tienda',v_pago,'tarifa_addi',v_fee,'iva_tarifa',v_iva,
    'neto_sin_redondeo',v_neto_sin_redondeo,
    'ajuste_redondeo',v_neto-v_neto_sin_redondeo,
    'neto_estimado',v_neto,'utilidad_creditek',v_utilidad,
    'rentabilidad_pct',round(v_utilidad/v_base*100,2));
end $$;

-- El registro previo a aprobación usa la misma regla; de otro modo una
-- edición sin cambio económico podría parecer distinta al cálculo aprobado.
create or replace function cobros_private.sincronizar_venta_addi()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v public.ventas%rowtype;
  a public.addi_liquidaciones%rowtype;
  fee numeric(16,2); tax numeric(16,2); net numeric(16,2);
begin
  select * into v from public.ventas where id=new.venta_id;
  if not found then raise exception 'Venta del crédito no encontrada'; end if;
  select * into a from public.addi_liquidaciones where venta_id=new.venta_id for update;
  if lower(btrim(coalesce(new.financiera,''))) <> 'addi' or v.anulada then
    if a.id is not null and a.estado <> 'anulada' then
      if a.cobro_expected_id is not null then
        if exists(select 1 from public.cobros_allocations ca
                  where ca.expected_id=a.cobro_expected_id and ca.estado='activo') then
          raise exception 'La venta Addi tiene abonos aplicados; Gestión debe conciliarla antes de cambiarla';
        end if;
        update public.cobros_expected set estado='anulado' where id=a.cobro_expected_id;
      end if;
      update public.addi_liquidaciones set estado='anulada',updated_at=now() where id=a.id;
    end if;
    return new;
  end if;
  if new.valor_esperado_financiera is null or new.valor_esperado_financiera<=0
     or new.cuota_inicial is null or new.cuota_inicial<0
     or new.cuota_inicial+new.valor_esperado_financiera<>v.total then
    raise exception 'El valor del crédito Addi y la cuota inicial deben sumar el total de la venta';
  end if;
  fee:=round(new.valor_esperado_financiera*0.075,2);
  tax:=round(fee*0.19,2);
  net:=cobros_private.addi_redondear_peso(new.valor_esperado_financiera-fee-tax);
  if a.id is not null then
    if a.estado='anulada' then
      raise exception 'La liquidación Addi fue anulada; Gestión debe revisarla antes de reactivarla';
    end if;
    if a.estado='aprobada' and
      (a.credito_bruto,a.fecha_venta,a.neto_estimado)
        is distinct from (new.valor_esperado_financiera,v.fecha,net) then
      raise exception 'La liquidación Addi ya fue aprobada; primero concilia o revierte el cobro';
    end if;
    if a.estado='aprobada' then return new; end if;
    update public.addi_liquidaciones set
      credito_bruto=new.valor_esperado_financiera,tarifa_addi=fee,
      iva_tarifa=tax,neto_estimado=net,fecha_esperada=v.fecha+15,
      fecha_venta=v.fecha,tienda_codigo=v.tienda_codigo,
      estado=case when (credito_bruto,fecha_venta,neto_estimado)
                     is distinct from (new.valor_esperado_financiera,v.fecha,net)
                  then 'pendiente_revision' else estado end,
      revisada_por=case when (credito_bruto,fecha_venta,neto_estimado)
                           is distinct from (new.valor_esperado_financiera,v.fecha,net)
                        then null else revisada_por end,
      revisada_at=case when (credito_bruto,fecha_venta,neto_estimado)
                          is distinct from (new.valor_esperado_financiera,v.fecha,net)
                       then null else revisada_at end,
      updated_at=now()
    where id=a.id;
    return new;
  end if;
  insert into public.addi_liquidaciones(
    venta_id,credito_id,fecha_venta,tienda_codigo,consecutivo,vendedor,
    credito_bruto,tarifa_addi,iva_tarifa,neto_estimado,fecha_esperada)
  values(v.id,new.id,v.fecha,v.tienda_codigo,v.consecutivo,v.vendedor,
         new.valor_esperado_financiera,fee,tax,net,v.fecha+15);
  return new;
end $$;

-- Histórico aprobado, sin recepción bancaria: conservar el antes/después.
create table cobros_private.addi_redondeos_peso (
  id uuid primary key default gen_random_uuid(),
  addi_liquidacion_id uuid not null unique references public.addi_liquidaciones(id),
  cobro_expected_id uuid not null unique references public.cobros_expected(id),
  neto_anterior numeric(16,2) not null,
  neto_nuevo numeric(16,2) not null,
  utilidad_anterior numeric(16,2) not null,
  utilidad_nueva numeric(16,2) not null,
  regla text not null default 'fraccion > 0.50 sube; fraccion <= 0.50 baja',
  registrado_at timestamptz not null default now()
);
alter table cobros_private.addi_redondeos_peso enable row level security;
revoke all on cobros_private.addi_redondeos_peso from public,anon,authenticated;

do $$
declare r record; v_neto numeric(16,2); v_utilidad numeric(16,2);
begin
  for r in
    select a.id,a.cobro_expected_id,a.neto_estimado,a.utilidad_creditek,
           a.pago_tienda,e.importe,e.estado as cobro_estado
      from public.addi_liquidaciones a
      join public.cobros_expected e on e.id=a.cobro_expected_id
     where a.estado='aprobada' and e.estado='activo'
     for update of a,e
  loop
    if r.importe is distinct from r.neto_estimado or r.pago_tienda is null
       or r.utilidad_creditek is distinct from r.neto_estimado-r.pago_tienda then
      raise exception 'Addi tiene un cálculo inconsistente; no aplicar redondeo';
    end if;
    if exists(select 1 from public.cobros_allocations x
              where x.expected_id=r.cobro_expected_id and x.estado='activo')
       or exists(select 1 from public.cobros_deposits d
                 where d.confirmation_expected_id=r.cobro_expected_id and d.estado='activo') then
      raise exception 'Addi tiene recepción bancaria; no cambiar el histórico';
    end if;
    v_neto:=cobros_private.addi_redondear_peso(r.neto_estimado);
    v_utilidad:=v_neto-r.pago_tienda;
    if v_neto is distinct from r.neto_estimado then
      insert into cobros_private.addi_redondeos_peso(
        addi_liquidacion_id,cobro_expected_id,neto_anterior,neto_nuevo,
        utilidad_anterior,utilidad_nueva)
      values(r.id,r.cobro_expected_id,r.neto_estimado,v_neto,
             r.utilidad_creditek,v_utilidad);
      update public.cobros_expected set importe=v_neto where id=r.cobro_expected_id;
      update public.addi_liquidaciones set neto_estimado=v_neto,
        utilidad_creditek=v_utilidad,updated_at=now() where id=r.id;
    end if;
  end loop;
end $$;

commit;
