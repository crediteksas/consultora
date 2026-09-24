begin;

-- La diferencia entre el total del artículo y el crédito Addi es otra forma
-- de pago de la venta. No reduce el porcentaje pactado sobre el crédito.
create or replace function cobros_private.addi_calculo(p_venta_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  a public.addi_liquidaciones%rowtype;
  c public.creditos%rowtype;
  v_base numeric(16,2); v_pct numeric(8,6); v_fee numeric(16,2);
  v_iva numeric(16,2); v_neto numeric(16,2); v_neto_sin_redondeo numeric(16,2);
  v_pago numeric(16,2); v_utilidad numeric(16,2);
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
    raise exception 'Base Addi o forma de pago complementaria inválida';
  end if;
  v_fee:=round(v_base*0.075,2);
  v_iva:=round(v_fee*0.19,2);
  v_neto_sin_redondeo:=v_base-v_fee-v_iva;
  v_neto:=cobros_private.addi_redondear_peso(v_neto_sin_redondeo);
  v_pago:=cobros_private.addi_redondear_peso(v_base*v_pct);
  v_utilidad:=v_neto-v_pago;
  if v_pago<0 or v_utilidad<0 then raise exception 'Liquidación Addi negativa; revisión requerida'; end if;
  return jsonb_build_object(
    'credito_bruto',v_base,'credito_kora',c.valor_esperado_financiera,
    'diferencia_base',v_base-c.valor_esperado_financiera,
    'base_fuente',v_fuente,'referencia_addi',v_referencia,
    'tipo_establecimiento',v_tipo,'porcentaje_politica',v_pct,
    'otra_forma_pago_venta',c.cuota_inicial,'inicial_tienda',0,
    'pagamos_tienda',v_pago,'pago_tienda',v_pago,
    'tarifa_addi',v_fee,'iva_tarifa',v_iva,
    'neto_sin_redondeo',v_neto_sin_redondeo,
    'ajuste_redondeo',v_neto-v_neto_sin_redondeo,
    'neto_estimado',v_neto,'utilidad_creditek',v_utilidad,
    'rentabilidad_pct',round(v_utilidad/v_base*100,2));
end $$;

-- Rectificar únicamente snapshots Addi aprobados y todavía no compensados.
-- Nunca alterar el crédito de la venta, el cobro esperado ni el abono bancario.
do $$
declare r public.addi_liquidaciones%rowtype; calc jsonb;
begin
  for r in select * from public.addi_liquidaciones where estado='aprobada' for update loop
    if exists(select 1 from public.retail_b2b_compensations x
              where x.addi_liquidacion_id=r.id and x.reversed_at is null) then
      raise exception 'Hay una compensación Addi activa; requiere revisión individual';
    end if;
    calc:=cobros_private.addi_calculo(r.venta_id);
    if (calc->>'credito_bruto')::numeric is distinct from r.credito_bruto
       or (calc->>'neto_estimado')::numeric is distinct from r.neto_estimado
       or not exists(select 1 from public.cobros_expected e
                     where e.id=r.cobro_expected_id and e.estado='activo'
                       and e.importe=r.neto_estimado) then
      raise exception 'La base o el cobro aprobado de la venta #% cambió',r.consecutivo;
    end if;
    if r.inicial_tienda=0
       and r.pago_tienda=(calc->>'pago_tienda')::numeric
       and r.utilidad_creditek=(calc->>'utilidad_creditek')::numeric then
      continue;
    end if;
    insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(null,'addi_pago_tienda_rectificado','addi_liquidaciones',r.id,
      jsonb_build_object('motivo','Otra forma de pago de la venta no reduce el pago Addi a tienda',
        'consecutivo',r.consecutivo,'pago_anterior',r.pago_tienda,
        'utilidad_anterior',r.utilidad_creditek,'inicial_addi_anterior',r.inicial_tienda,
        'pago_nuevo',(calc->>'pago_tienda')::numeric,
        'utilidad_nueva',(calc->>'utilidad_creditek')::numeric,
        'otra_forma_pago_venta',(calc->>'otra_forma_pago_venta')::numeric));
    update public.addi_liquidaciones set
      inicial_tienda=0,
      pago_tienda=(calc->>'pago_tienda')::numeric,
      utilidad_creditek=(calc->>'utilidad_creditek')::numeric,
      updated_at=now()
    where id=r.id;
  end loop;
end $$;

commit;
