-- Datos históricos confirmados por Gerencia: pagados y utilidad retirada.
-- No crea transferencias, órdenes ni comprobantes. PayJoy conserva importes
-- desconocidos como NULL hasta validar su fórmula histórica.
begin;
do $$
declare
  h public.creditos_historicos_plataforma%rowtype;
  v_before jsonb;
  v_pagamos numeric;
  v_giro numeric;
  v_utilidad numeric;
  v_count integer := 0;
  v_orders text;
begin
  select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.id)::text,'[]'))
    into v_orders from public.payment_orders p;
  for h in select * from public.creditos_historicos_plataforma
    where (plataforma='alo' and codigo_credito in
      ('216003','216668','216943','217025','217896','217812','218026','218517','267990','267747'))
      or (plataforma='payjoy' and codigo_credito in
      ('DXNZGQVP','DJXDZSN','DKVGMPQV','DGBWSQJ','DNBPZVW','DFJJCSD','DHTZWZQ'))
    order by id for update
  loop
    v_count := v_count + 1;
    if h.fecha_credito >= '2026-09-01'::timestamptz then
      raise exception 'Fecha fuera del histórico: %',h.codigo_credito;
    end if;
    if h.politica_historica_snapshot->>'cierre_confirmacion'='gerencia_2026_09_10' then
      continue;
    end if;
    if h.utilidad_neta_historica is not null or h.utilidad_final_historica is not null
      or h.datos_origen->>'modo_importacion' is distinct from 'solo_consulta' then
      raise exception 'Registro cambió; revisar antes de modificar: %',h.codigo_credito;
    end if;
    v_before := to_jsonb(h);
    if h.plataforma='alo' then
      v_pagamos := (h.datos_origen->'row'->>'pagamos')::numeric;
      v_giro := (h.datos_origen->'row'->>'ALO CREDIT PAGO al punto de venta')::numeric;
      v_utilidad := (h.datos_origen->'row'->>'UTILIDAD OSCAR')::numeric;
      if v_pagamos is null or v_giro is null or v_utilidad is null
        or v_pagamos-h.cuota_inicial <> v_giro
        or h.monto_credito+h.cuota_inicial-v_pagamos <> v_utilidad then
        raise exception 'Fuente ALO no concilia: %',h.codigo_credito;
      end if;
      update public.creditos_historicos_plataforma set
        tipo_establecimiento='propia',
        valor_comercial_historico=h.monto_credito+h.cuota_inicial,
        pagamos_historico=v_pagamos, pago_neto_historico=v_giro,
        bonos_historicos=0, gasto_financiero_historico=0, provision_historica=0,
        utilidad_antes_bonos_historica=v_utilidad,
        utilidad_neta_historica=v_utilidad, utilidad_final_historica=v_utilidad,
        resultado_cerrado_historico=v_utilidad,
        cierre_utilidad_at=now(),
        calculo_historico_estado='conciliado_fuente_historica',
        politica_historica_snapshot=politica_historica_snapshot || jsonb_build_object(
          'motor','valores_originales_archivo_alo',
          'formula_utilidad','monto_credito_mas_inicial_menos_pagamos',
          'campo_utilidad_fuente','UTILIDAD OSCAR',
          'excluye_utilidad_retail',true,
          'bonos','no_aplican_tienda_propia',
          'tarifa_actual_aplicada',false)
        where id=h.id;
    else
      update public.creditos_historicos_plataforma set
        calculo_historico_estado='pendiente_validar_formula_historica',
        politica_historica_snapshot=politica_historica_snapshot || jsonb_build_object(
          'calculo_pendiente','Confirmar base PayJoy antes de calcular PAGAMOS y utilidad',
          'utilidad_retirada_confirmada',true,
          'importe_retirado_pendiente_de_calculo',true)
        where id=h.id;
    end if;
    update public.creditos_historicos_plataforma set
      historico_inicial=true, pagado_antes_inicio=true, requiere_soporte=false,
      fecha_inicio_operacion='2026-09-01',
      cierre_utilidad_motivo='Gerencia confirma pago y retiro histórico; solo consulta. No es una transferencia nueva.',
      actualizado_at=now(),
      politica_historica_snapshot=politica_historica_snapshot || jsonb_build_object(
        'cierre_confirmacion','gerencia_2026_09_10',
        'base_confirmacion','Solicitud expresa de Gerencia: ya liquidados, pagados y utilidad retirada',
        'fecha_registro_confirmacion',now(),
        'fecha_pago_bancario','no_inferida',
        'no_generar_pagos',true)
      where id=h.id;
    insert into public.audit_log(accion,tabla,registro_id,detalle)
      select 'historico_pago_retiro_confirmado','creditos_historicos_plataforma',id,
        jsonb_build_object('antes',v_before,'despues',to_jsonb(x),'motivo','Confirmación expresa de Gerencia; sin movimiento bancario')
      from public.creditos_historicos_plataforma x where id=h.id;
  end loop;
  if v_count <> 17 then raise exception 'Se esperaban 17 registros, encontrados %',v_count; end if;
  if v_orders is distinct from (select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.id)::text,'[]')) from public.payment_orders p) then
    raise exception 'Las órdenes de pago no deben cambiar';
  end if;
end $$;
commit;
