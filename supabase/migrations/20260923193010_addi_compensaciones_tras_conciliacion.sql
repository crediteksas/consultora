begin;

-- Las compensaciones de Addi no pertenecen a un lote de las plataformas
-- importadas. Conservan la misma aprobación/aplicación/aceptación Retail.
alter table public.retail_b2b_compensations
  alter column liquidation_id drop not null,
  alter column operation_id drop not null,
  add column addi_liquidacion_id uuid references public.addi_liquidaciones(id);
alter table public.retail_b2b_compensations
  add constraint retail_compensacion_origen_exclusivo check (
    (addi_liquidacion_id is null and liquidation_id is not null and operation_id is not null)
    or (addi_liquidacion_id is not null and liquidation_id is null and operation_id is null and platform = 'addi')
  );
create unique index retail_compensacion_addi_activa
  on public.retail_b2b_compensations(addi_liquidacion_id)
  where addi_liquidacion_id is not null and reversed_at is null;

alter table public.addi_liquidaciones
  add column inicial_tienda numeric(16,2),
  add column pago_tienda numeric(16,2),
  add column utilidad_creditek numeric(16,2),
  add constraint addi_pago_tienda_valido check (pago_tienda is null or pago_tienda >= 0);

-- Los cuatro créditos ya aprobados reciben el mismo cálculo que vio Gerencia
-- al aprobar; las aprobaciones futuras se congelan en la función de aprobación.
update public.addi_liquidaciones a
set inicial_tienda=(cobros_private.addi_calculo(a.venta_id)->>'inicial_tienda')::numeric,
    pago_tienda=(cobros_private.addi_calculo(a.venta_id)->>'pago_tienda')::numeric,
    utilidad_creditek=(cobros_private.addi_calculo(a.venta_id)->>'utilidad_creditek')::numeric
where a.estado='aprobada';

create or replace function cobros_private.addi_liquidacion_aprobar(p_venta_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  a public.addi_liquidaciones%rowtype;
  calc jsonb; e_id uuid; v_tienda_nombre text;
begin
  if not cobros_private.autorizado(true) then raise exception 'Solo Gerencia puede aprobar Addi'; end if;
  select * into a from public.addi_liquidaciones where venta_id=p_venta_id for update;
  if not found or a.estado<>'revisada' then raise exception 'La venta Addi debe estar revisada antes de aprobarse'; end if;
  if exists(select 1 from public.ventas v where v.id=a.venta_id and v.anulada) then
    raise exception 'No se puede aprobar una venta anulada'; end if;
  calc:=cobros_private.addi_calculo(p_venta_id);
  select nullif(btrim(o.nombre),'') into v_tienda_nombre
    from public.origenes o where o.codigo=a.tienda_codigo;
  if v_tienda_nombre is null then raise exception 'La tienda no tiene nombre en el catálogo'; end if;
  insert into public.cobros_expected(
    plataforma,corte,fecha_esperada,concepto,importe,soporte,
    fuente_tipo,venta_id,credito_bruto,tarifa_addi,iva_tarifa,
    idempotency_key,created_by)
  values('addi',a.fecha_venta,a.fecha_esperada,
    'Venta Addi #'||a.consecutivo||' · '||v_tienda_nombre,
    (calc->>'neto_estimado')::numeric,
    'Venta KORA '||a.venta_id||coalesce(' · Crédito Addi '||(calc->>'referencia_addi'),''),
    'estimacion_venta',a.venta_id,(calc->>'credito_bruto')::numeric,
    (calc->>'tarifa_addi')::numeric,(calc->>'iva_tarifa')::numeric,
    gen_random_uuid(),auth.uid()) returning id into e_id;
  update public.addi_liquidaciones set estado='aprobada',
    credito_bruto=(calc->>'credito_bruto')::numeric,
    tarifa_addi=(calc->>'tarifa_addi')::numeric,
    iva_tarifa=(calc->>'iva_tarifa')::numeric,
    neto_estimado=(calc->>'neto_estimado')::numeric,
    inicial_tienda=(calc->>'inicial_tienda')::numeric,
    pago_tienda=(calc->>'pago_tienda')::numeric,
    utilidad_creditek=(calc->>'utilidad_creditek')::numeric,
    aprobada_por=auth.uid(),aprobada_at=now(),cobro_expected_id=e_id,
    updated_at=now() where id=a.id returning * into a;
  perform cobros_private.evento('expected_creado',e_id,
    jsonb_build_object('origen','venta_addi','venta_id',a.venta_id,'calculo',calc));
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(auth.uid(),'addi_liquidacion_aprobada','addi_liquidaciones',a.id,
           jsonb_build_object('venta_id',a.venta_id,'cobro_expected_id',e_id,'calculo',calc));
  return to_jsonb(a)||calc;
end $$;

create function cobros_private.addi_tesoreria_listar()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not cobros_private.autorizado(false) then raise exception 'Acceso a Addi no autorizado'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',a.id,'venta_id',a.venta_id,'consecutivo',a.consecutivo,
      'tienda_codigo',a.tienda_codigo,'tienda',o.nombre,'tipo_tienda',o.tipo,
      'fecha_venta',a.fecha_venta,'fecha_esperada',a.fecha_esperada,
      'credito_bruto',a.credito_bruto,'tarifa_addi',a.tarifa_addi,
      'iva_tarifa',a.iva_tarifa,'neto_estimado',a.neto_estimado,
      'pago_tienda',a.pago_tienda,'utilidad_creditek',a.utilidad_creditek,
      'recibido',coalesce(rec.valor,0),'cobro_estado',e.estado,
      'compensacion_id',comp.id,'compensacion_aplicada',comp.applied_at
    ) order by a.fecha_venta desc,a.consecutivo desc)
    from public.addi_liquidaciones a
    join public.origenes o on o.codigo=a.tienda_codigo
    join public.cobros_expected e on e.id=a.cobro_expected_id
    left join lateral (
      select sum(ca.importe) valor from public.cobros_allocations ca
      join public.cobros_deposits d on d.id=ca.deposit_id and d.estado='activo'
      where ca.expected_id=e.id and ca.estado='activo'
    ) rec on true
    left join lateral (
      select c.id,c.applied_at from public.retail_b2b_compensations c
      where c.addi_liquidacion_id=a.id and c.reversed_at is null limit 1
    ) comp on true
    where a.estado='aprobada'
  ),'[]'::jsonb);
end $$;
revoke all on function cobros_private.addi_tesoreria_listar() from public,anon,authenticated;
grant execute on function cobros_private.addi_tesoreria_listar() to authenticated;
create function public.addi_tesoreria_listar()
returns jsonb language sql stable security invoker set search_path=''
as $$ select cobros_private.addi_tesoreria_listar() $$;
revoke all on function public.addi_tesoreria_listar() from public,anon;
grant execute on function public.addi_tesoreria_listar() to authenticated;

create function cobros_private.addi_preparar_compensacion(p_addi_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  a public.addi_liquidaciones%rowtype; e public.cobros_expected%rowtype;
  v_tipo text; v_recibido numeric; v_saldo numeric; v_id uuid;
  v_inicial numeric; v_pct numeric;
begin
  if not cobros_private.autorizado(true) then raise exception 'Solo Gerencia puede preparar la compensación Addi'; end if;
  select * into a from public.addi_liquidaciones where id=p_addi_id for update;
  if not found or a.estado<>'aprobada' or a.cobro_expected_id is null then
    raise exception 'La liquidación Addi debe estar aprobada'; end if;
  select id into v_id from public.retail_b2b_compensations
    where addi_liquidacion_id=a.id and reversed_at is null;
  if found then return v_id; end if;
  select tipo into v_tipo from public.origenes where codigo=a.tienda_codigo and activo;
  if v_tipo<>'propia' or v_tipo is null then
    raise exception 'Esta acción solo prepara compensaciones de tiendas propias'; end if;
  select * into e from public.cobros_expected where id=a.cobro_expected_id for update;
  if e.estado<>'activo' or e.importe<>a.neto_estimado then
    raise exception 'El cobro esperado Addi no coincide con la liquidación aprobada'; end if;
  select coalesce(sum(ca.importe),0) into v_recibido
    from public.cobros_allocations ca
    join public.cobros_deposits d on d.id=ca.deposit_id and d.estado='activo'
    where ca.expected_id=e.id and ca.estado='activo';
  if v_recibido<>e.importe then
    raise exception 'Primero concilia el pago bancario completo de Addi'; end if;
  if a.pago_tienda is null or a.utilidad_creditek is null then
    raise exception 'Falta la liquidación aprobada de la tienda'; end if;
  v_inicial:=a.inicial_tienda;
  if v_inicial is null then raise exception 'Falta la inicial congelada de la tienda'; end if;
  v_pct:=round((a.pago_tienda+v_inicial)/a.credito_bruto,6);
  perform pg_advisory_xact_lock(hashtextextended('compensation-store:'||a.tienda_codigo,0));
  select coalesce(sum(case when tipo='cargo' then monto else -monto end),0)
    into v_saldo from public.cuenta_corriente where tienda_codigo=a.tienda_codigo;
  insert into public.retail_b2b_compensations(
    addi_liquidacion_id,store_code,platform,cutoff_date,imei,commercial_value,
    initial_value,policy_percentage,compensation_value,outsourcing_commission,
    account_balance_before,account_balance_after,created_by)
  values(a.id,a.tienda_codigo,'addi',a.fecha_venta,'Venta #'||a.consecutivo,
    a.credito_bruto,v_inicial,v_pct,a.pago_tienda,a.utilidad_creditek,
    v_saldo,v_saldo-a.pago_tienda,auth.uid())
  returning id into v_id;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(auth.uid(),'addi_compensacion_preparada','retail_b2b_compensations',v_id,
      jsonb_build_object('addi_liquidacion_id',a.id,'cobro_expected_id',e.id,
        'recibido',v_recibido,'pago_tienda',a.pago_tienda));
  return v_id;
end $$;
revoke all on function cobros_private.addi_preparar_compensacion(uuid) from public,anon,authenticated;
grant execute on function cobros_private.addi_preparar_compensacion(uuid) to authenticated;
create function public.addi_preparar_compensacion(p_addi_id uuid)
returns uuid language sql security invoker set search_path=''
as $$ select cobros_private.addi_preparar_compensacion(p_addi_id) $$;
revoke all on function public.addi_preparar_compensacion(uuid) from public,anon;
grant execute on function public.addi_preparar_compensacion(uuid) to authenticated;

-- Una anulación bancaria revierte solo una preparación aún no aplicada.
-- Un abono ya aplicado exige conciliación administrativa, no una edición silenciosa.
create function cobros_private.addi_proteger_aplicacion()
returns trigger language plpgsql security definer set search_path='' as $$
declare c public.retail_b2b_compensations%rowtype;
begin
  if old.estado='activo' and new.estado<>'activo' then
    select comp.* into c
      from public.retail_b2b_compensations comp
      join public.addi_liquidaciones a on a.id=comp.addi_liquidacion_id
      where a.cobro_expected_id=old.expected_id and comp.reversed_at is null
      for update of comp;
    if found then
      if c.applied_at is not null then
        raise exception 'La compensación Addi ya se aplicó; conciliar el abono antes de anularlo';
      end if;
      update public.retail_b2b_compensations set reversed_at=now() where id=c.id;
      insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
      values(auth.uid(),'addi_compensacion_preparada_revertida','retail_b2b_compensations',c.id,
        jsonb_build_object('allocation_id',old.id));
    end if;
  end if;
  return new;
end $$;
create trigger addi_proteger_aplicacion_bancaria
  before update of estado on public.cobros_allocations
  for each row execute function cobros_private.addi_proteger_aplicacion();
revoke all on function cobros_private.addi_proteger_aplicacion() from public,anon,authenticated;

-- Gestión usa la misma cola y el mismo abono de Cuenta Corriente que las demás
-- tiendas propias. Para Addi verifica otra vez la conciliación bancaria.
create or replace function compensaciones_private.aplicar(p_ids uuid[])
returns integer language plpgsql security definer set search_path='' as $$
declare
  p public.perfiles; c public.retail_b2b_compensations%rowtype;
  a public.addi_liquidaciones%rowtype; e public.cobros_expected%rowtype;
  before_value numeric; received numeric; b jsonb; utility_balance jsonb;
  total integer:=0; k uuid;
begin
  select * into p from public.perfiles where id=auth.uid() and activo;
  if p.id is null or p.rol not in ('gerencia','auditoria') or p.rol is null
    or not coalesce(public.tiene_capacidad_aliados('revisor'),false)
  then raise exception 'Solo Gestión o Gerencia autorizada puede aplicar abonos'; end if;
  if coalesce(cardinality(p_ids),0)=0 or cardinality(p_ids)>200 or array_position(p_ids,null) is not null
  then raise exception 'Selecciona entre 1 y 200 abonos'; end if;
  for k in select distinct unnest(p_ids) order by 1 loop
    select * into c from public.retail_b2b_compensations where id=k for update;
    if c.id is null or c.reversed_at is not null then raise exception 'Abono no disponible'; end if;
    if c.applied_at is not null then continue; end if;
    if c.addi_liquidacion_id is not null then
      select * into a from public.addi_liquidaciones where id=c.addi_liquidacion_id for update;
      select * into e from public.cobros_expected where id=a.cobro_expected_id for update;
      select coalesce(sum(ca.importe),0) into received
        from public.cobros_allocations ca
        join public.cobros_deposits d on d.id=ca.deposit_id and d.estado='activo'
        where ca.expected_id=e.id and ca.estado='activo';
      if a.estado<>'aprobada' or e.estado<>'activo'
        or received<>e.importe or e.importe<>a.neto_estimado
        or c.compensation_value<>a.pago_tienda
        or c.outsourcing_commission<>a.utilidad_creditek
      then raise exception 'La conciliación Addi ya no coincide con la compensación'; end if;
    elsif not exists(
      select 1 from public.liquidations l where l.id=c.liquidation_id
      and l.estado in ('aprobada','pagada','cerrada') and l.frozen_at is not null
    ) then raise exception 'La liquidación no está autorizada'; end if;
    if exists(select 1 from public.cuenta_corriente
      where referencia_tipo='compensacion_liquidacion_retail' and referencia_id=c.id::text)
    then raise exception 'Existe un movimiento previo: conciliar, no duplicar'; end if;
    perform pg_advisory_xact_lock(hashtextextended('compensation-store:'||c.store_code,0));
    select coalesce(sum(case when tipo='cargo' then monto else -monto end),0)
      into before_value from public.cuenta_corriente where tienda_codigo=c.store_code;
    insert into public.cuenta_corriente(tienda_codigo,tipo,concepto,monto,referencia_tipo,referencia_id,usuario)
    values(c.store_code,'abono','Compensación liquidación Retail — '||
      case c.platform when 'alo' then 'ALO Credit' when 'krediya' then 'Krediya'
        when 'addi' then 'Addi' else 'PayJoy' end||
      ' — corte '||coalesce(c.cutoff_date::text,'sin fecha'),c.compensation_value,
      'compensacion_liquidacion_retail',c.id::text,auth.uid());
    if c.compensation_value>0 then
      b:=public.tesoreria_aplicar_saldo('b2b','credit',c.compensation_value,'compensation:'||c.id);
      insert into public.treasury_movements(unit,direction,type,beneficiary,concept,amount,movement_date,
        liquidation_id,compensation_id,balance_before,balance_after,status,requested_by,idempotency_key)
      values('b2b','credit','compensacion_retail',c.store_code,'Compensación aplicada por Gestión — '||c.platform,
        c.compensation_value,(now() at time zone 'America/Bogota')::date,c.liquidation_id,c.id,
        (b->>'before')::numeric,(b->>'after')::numeric,'pagado',auth.uid(),'compensation:'||c.id);
    end if;
    if c.addi_liquidacion_id is not null and c.outsourcing_commission>0 then
      utility_balance:=public.tesoreria_aplicar_saldo('tercerizacion','credit',
        c.outsourcing_commission,'addi-commission:'||c.id);
      insert into public.treasury_movements(unit,direction,type,beneficiary,concept,amount,movement_date,
        compensation_id,balance_before,balance_after,status,requested_by,idempotency_key)
      values('tercerizacion','credit','comision_retail',c.store_code,
        'Utilidad Addi liquidada — venta #'||a.consecutivo,
        c.outsourcing_commission,(now() at time zone 'America/Bogota')::date,c.id,
        (utility_balance->>'before')::numeric,(utility_balance->>'after')::numeric,
        'pagado',auth.uid(),'addi-commission:'||c.id);
    end if;
    update public.retail_b2b_compensations set applied_at=now(),applied_by=auth.uid(),
      account_balance_before=before_value,
      account_balance_after=before_value-c.compensation_value where id=c.id;
    insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(auth.uid(),'compensacion_aplicada_gestion','retail_b2b_compensations',c.id,
      jsonb_build_object('tienda',c.store_code,'imei',c.imei,'monto',c.compensation_value,
        'saldo_antes',before_value,'saldo_despues',before_value-c.compensation_value));
    total:=total+1;
  end loop;
  return total;
end $$;

commit;
