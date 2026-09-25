-- Rectificación histórica aprobada por Gerencia: venta Addi #437 de Creditel Store.
-- El flujo 600000 + 96600 = 552600 ya estaba probado, pero la venta anterior
-- permaneció en 450000 + 0. Conserva el arqueo validado del 24/09 como
-- snapshot; los 96600 ingresan al arrastre explícito del día siguiente.
-- No aprueba la liquidación ni crea cobro bancario o compensación.
do $$
declare
  v_venta public.ventas%rowtype;
  v_credito public.creditos%rowtype;
  v_item public.venta_items%rowtype;
  v_addi public.addi_liquidaciones%rowtype;
  v_corte public.caja_cortes%rowtype;
  v_antes jsonb;
  v_despues jsonb;
  v_caja_antes jsonb;
  v_caja_despues jsonb;
  v_calculo jsonb;
  v_guard_original text;
  v_guard_temporal text;
  v_ajuste_id uuid;
  v_actor uuid := '6de0ad26-64af-4966-8cd9-d468880af627'; -- Oscar Pacheco
begin
  perform pg_advisory_xact_lock(hashtextextended('rectificar-addi-venta-437', 0));

  select * into v_venta from public.ventas
    where id='ecb3696b-ab1e-45b0-8d42-324a9c82cf10' for update;
  select * into v_credito from public.creditos
    where id='faf67c04-1267-476e-84ec-962adee15f91' for update;
  select * into v_item from public.venta_items
    where id='443f58c5-2bc5-4994-9eaa-b745777eb54a' for update;
  select * into v_addi from public.addi_liquidaciones
    where id='42150e68-f179-4b14-856c-d39fd77d21bc' for update;
  select * into v_corte from public.caja_cortes
    where tienda_codigo='CK-04' and fecha='2026-09-24' for update;

  -- Si una instalación posterior vuelve a encontrar la migración, no duplica
  -- el asiento de auditoría ni vuelve a poner la liquidación en revisión.
  if v_venta.total=552600 and v_item.precio_venta=552600
     and v_credito.valor_esperado_financiera=600000
     and v_credito.cuota_inicial=96600
     and v_credito.medio_pago_complementario='efectivo'
     and exists(select 1 from public.venta_ajustes_administrativos
                where venta_id=v_venta.id and motivo like 'Rectificación Addi #437:%') then
    return;
  end if;

  if v_venta.id is null or v_venta.consecutivo<>437
     or v_venta.tienda_codigo<>'CK-04' or v_venta.fecha<>'2026-09-24'
     or v_venta.tipo<>'credito' or v_venta.anulada or v_venta.total<>450000
     or v_credito.venta_id is distinct from v_venta.id
     or v_credito.financiera<>'addi' or v_credito.valor_esperado_financiera<>450000
     or v_credito.cuota_inicial<>0 or v_credito.medio_pago_complementario is not null
     or v_credito.estado_conciliacion<>'pendiente'
     or v_credito.valor_real_financiera is not null or v_credito.importacion_id is not null
     or v_item.venta_id is distinct from v_venta.id or v_item.precio_venta<>450000
     or (select count(*) from public.venta_items where venta_id=v_venta.id)<>1
     or v_addi.venta_id is distinct from v_venta.id
     or v_addi.credito_id is distinct from v_credito.id
     or v_addi.estado<>'revisada' or v_addi.aprobada_at is not null
     or v_addi.cobro_expected_id is not null or v_addi.pago_autorizado_at is not null
     or v_corte.estado<>'validada'
     or exists(select 1 from public.liquidation_operations where credito_id=v_credito.id)
     or exists(select 1 from public.venta_ajustes_administrativos
               where venta_id=v_venta.id and motivo like 'Rectificación Addi #437:%') then
    raise exception 'La venta Addi #437 cambió o tiene efectos posteriores; no se rectificó nada';
  end if;

  v_antes:=jsonb_build_object('venta',to_jsonb(v_venta),'item',to_jsonb(v_item),
    'credito',to_jsonb(v_credito),'addi',to_jsonb(v_addi));
  v_caja_antes:=public.caja_calcular_interno('CK-04','2026-09-25');

  -- Excepción estrictamente transitoria y transaccional para el único día
  -- validado. Al finalizar el bloque se reinstala la función byte a byte;
  -- ante cualquier error Postgres revierte también la definición temporal.
  v_guard_original:=pg_get_functiondef('public.caja_exigir_apertura(text,date,boolean)'::regprocedure);
  v_guard_temporal:=replace(v_guard_original,
    '  if exists(select 1 from public.caja_cortes',
    '  if current_setting(''app.rectificacion_addi_437'',true)=''1'' '
      ||'and p_tienda=''CK-04'' and p_fecha=date ''2026-09-24'' then return; end if;'
      ||E'\n  if exists(select 1 from public.caja_cortes');
  if v_guard_temporal=v_guard_original then
    raise exception 'La guarda de caja cambió; se canceló la rectificación';
  end if;
  execute v_guard_temporal;
  perform set_config('app.rectificacion_addi_437','1',true);
  perform set_config('app.ajuste_venta_autorizado','1',true);

  update public.ventas set total=552600 where id=v_venta.id;
  update public.venta_items set precio_venta=552600 where id=v_item.id;
  update public.creditos set valor_esperado_financiera=600000,
    cuota_inicial=96600,medio_pago_complementario='efectivo'
    where id=v_credito.id;

  perform set_config('app.rectificacion_addi_437','0',true);
  perform set_config('app.ajuste_venta_autorizado','0',true);
  execute v_guard_original;

  select * into v_venta from public.ventas where id=v_venta.id;
  select * into v_credito from public.creditos where id=v_credito.id;
  select * into v_item from public.venta_items where id=v_item.id;
  select * into v_addi from public.addi_liquidaciones where id=v_addi.id;
  v_calculo:=cobros_private.addi_calculo(v_venta.id);
  v_caja_despues:=public.caja_calcular_interno('CK-04','2026-09-25');

  if v_venta.total<>552600 or v_item.precio_venta<>552600
     or v_credito.valor_esperado_financiera<>600000 or v_credito.cuota_inicial<>96600
     or v_credito.medio_pago_complementario<>'efectivo'
     or v_addi.estado<>'pendiente_revision' or v_addi.aprobada_at is not null
     or v_addi.cobro_expected_id is not null
     or (v_calculo->>'pago_tienda')::numeric<>456000
     or (v_calculo->>'neto_estimado')::numeric<>546450
     or (v_calculo->>'utilidad_creditek')::numeric<>90450
     or (v_caja_despues->>'ajuste_arrastre_movimientos')::numeric
        -(v_caja_antes->>'ajuste_arrastre_movimientos')::numeric<>96600
     or (select estado from public.caja_cortes
         where tienda_codigo='CK-04' and fecha='2026-09-24')<>'validada' then
    raise exception 'No cuadraron Addi, caja o estado de revisión; rectificación revertida';
  end if;

  v_despues:=jsonb_build_object('venta',to_jsonb(v_venta),'item',to_jsonb(v_item),
    'credito',to_jsonb(v_credito),'addi',to_jsonb(v_addi));
  insert into public.venta_ajustes_administrativos
    (venta_id,tipo,motivo,valores_anteriores,valores_nuevos,usuario_id)
  values(v_venta.id,'correccion_datos',
    'Rectificación Addi #437: Gerencia confirmó crédito $600.000 y efectivo $96.600; venta preflujo registrada por $450.000. Arqueo 24/09 conservado; diferencia al arrastre siguiente.',
    v_antes,v_despues,v_actor) returning id into v_ajuste_id;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
  values(v_actor::text,'RECTIFICACION_ADDI_HISTORICA','ventas',v_venta.id::text,
    jsonb_build_object('ajuste_id',v_ajuste_id,'autorizacion','Gerencia confirmó $600.000 Addi + $96.600 efectivo el 2026-09-25',
      'antes',v_antes,'despues',v_despues,'caja_siguiente_antes',v_caja_antes,
      'caja_siguiente_despues',v_caja_despues,'cierre_2026_09_24','conservado'));
end $$;
