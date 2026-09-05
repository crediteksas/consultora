-- Ejecutar como propietario SQL DESPUÉS de instalar la migración Krediya v2.
-- Fixtures sintéticos; no llama a bancos ni procesa órdenes reales. Los únicos
-- datos existentes usados son perfiles/permisos y reglas/beneficiarios vigentes.
-- La aprobación de prueba puede mover saldos internos durante ESTA transacción;
-- ROLLBACK elimina todos esos efectos, incluidos eventos y auditoría de prueba.
-- No separar este archivo en consultas, ni sustituir ROLLBACK por COMMIT.
begin;
set local statement_timeout = '60s';
set local lock_timeout = '5s';
set local plpgsql.check_asserts = on;

create temporary table kv2_fixture(k text primary key, v text) on commit drop;
grant select on kv2_fixture to authenticated;
create temporary table kv2_before(k text primary key, v jsonb) on commit drop;

-- Este helper es INVOKER: ejecuta con la misma identidad del caso probado.
create function pg_temp.kv2_expect_error(q text, pattern text)
returns void language plpgsql security invoker as $$
declare failed boolean := false;
begin
  begin
    execute q;
  exception when others then
    failed := true;
    if sqlerrm !~* pattern then
      raise exception 'Error inesperado: %, esperado: %', sqlerrm, pattern;
    end if;
  end;
  if not failed then raise exception 'La operación debía ser rechazada: %', q; end if;
end $$;
grant execute on function pg_temp.kv2_expect_error(text,text) to authenticated;

do $$
declare
  gerencia uuid; auditoria uuid; tienda uuid; ejecutivo uuid := gen_random_uuid();
  aliado uuid := gen_random_uuid(); lote uuid := gen_random_uuid(); ejecutivo_beneficiario uuid := gen_random_uuid();
  propia uuid := gen_random_uuid(); ganancia uuid := gen_random_uuid(); perdida uuid := gen_random_uuid();
  prefix text := 'KV2TEST' || replace(gen_random_uuid()::text,'-','');
  extra numeric; p text; ref text; lid uuid; oid uuid;
begin
  if to_regprocedure('public.krediya_calcular_y_enviar_aprobacion(uuid)') is null then
    raise exception 'Instala la migración Krediya v2 antes de ejecutar estas pruebas';
  end if;
  select p.id into gerencia from public.perfiles p join public.aliados_operadores o on o.perfil_id=p.id
    where p.activo and p.rol='gerencia' and o.activo and o.capacidad='aprobador' limit 1;
  select p.id into auditoria from public.perfiles p join public.aliados_operadores o on o.perfil_id=p.id
    where p.activo and p.rol='auditoria' and o.activo and o.capacidad='revisor' limit 1;
  select p.id into tienda from public.perfiles p where p.activo and p.rol='admin_tienda'
    and not exists(select 1 from public.aliados_operadores o where o.perfil_id=p.id and o.activo) limit 1;
  assert gerencia is not null and auditoria is not null and tienda is not null,
    'Se necesitan perfiles activos Gerencia, Auditoría y tienda para validar permisos reales';
  perform set_config('request.jwt.claim.sub',gerencia::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',gerencia,'role','authenticated')::text,true);

  -- Captura inmutable de lotes de otras plataformas para detectar cambios laterales.
  insert into kv2_before values
    ('otros_lotes',(select coalesce(jsonb_agg(to_jsonb(l) order by id),'[]') from public.liquidations l where plataforma<>'krediya')),
    ('otras_operaciones',(select coalesce(jsonb_agg(to_jsonb(o) order by id),'[]') from public.liquidation_operations o where plataforma<>'krediya')),
    ('reglas_bonos',(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]') from public.krediya_bonus_rules r));

  assert (select count(*)=4 from public.krediya_bonus_rules r where r.activo
    and vigente_desde<=date '2026-08-24' and (vigente_hasta is null or vigente_hasta>=date '2026-08-24')
    and ((concepto='gestion_krediya' and valor=5000) or (concepto='operacion' and valor=15000))),
    'La configuración operativa debe ser Mayte 5.000 y Operación 15.000, aliado y propia';
  -- Copia del esquema fijo de Alex, sin identidad ni ventas personales.
  insert into public.ejecutivos(id,nombre,activo,esquema_comision)
    values(ejecutivo,prefix||' EJECUTIVO',true,'{"tipo":"fijo","valor":30000}');
  insert into public.origenes(codigo,nombre,tipo,activo,ejecutivo_id) values
    (prefix||'A',prefix||' ALIADO','aliado',true,ejecutivo),
    (prefix||'R',prefix||' RETAIL','propia',true,null);
  insert into public.liquidation_beneficiaries(id,tipo,identificacion,nombre,origen_codigo)
    values(aliado,'aliado',prefix||'A',prefix||' BENEFICIARIO SIN CUENTA',prefix||'A');
  insert into public.liquidation_beneficiaries(id,tipo,identificacion,nombre,ejecutivo_id)
    values(ejecutivo_beneficiario,'ejecutivo',prefix||'E',prefix||' EJECUTIVO',ejecutivo);
  -- Cuenta inequívocamente sintética. No se llama a una API bancaria; sólo se
  -- prueba el registro interno de un pago ficticio que desaparece en ROLLBACK.
  insert into public.beneficiary_bank_accounts(beneficiary_id,banco,tipo_cuenta,numero_cuenta,
    validada,validada_por,validada_at,activo)
    values(ejecutivo_beneficiario,'BANCO SINTETICO PRUEBAS','ahorros','0000000000',true,gerencia,now(),true);

  -- Mantener los overrides vigentes: la prueba no cambia reglas de ejecutivos.
  select coalesce(sum((e.esquema_comision->>'valor_override_otros_ejecutivos')::numeric),0) into extra
    from public.ejecutivos e where e.activo and e.esquema_comision->>'tipo'='fijo_mas_override'
    and exists(select 1 from public.liquidation_beneficiaries b where b.ejecutivo_id=e.id and b.activo and b.tipo='ejecutivo');
  ref := prefix||' TELEFONO 128GB 4RAM';
  insert into public.krediya_price_rules(referencia_clave,referencia,precio_venta,pagamos,vigente_desde)
    values('ref:'||regexp_replace(lower(ref),'[^a-z0-9]','','g'),ref,1000000,750000,'2026-08-01');
  insert into public.liquidations(id,plataforma,fecha_corte,periodo_desde,periodo_hasta,idempotency_key)
    values(lote,'krediya','2026-08-30','2026-08-24','2026-08-30',gen_random_uuid());
  insert into public.liquidation_operations(id,liquidation_id,plataforma,source_key,external_id,
    operation_at,establishment_name,origen_codigo,tipo_establecimiento,ejecutivo_id,cliente_nombre,
    imei,referencia,modelo,monto_credito,monto_base,inicial,reconocida,normalized_data)
  values
    (ganancia,lote,'krediya',gen_random_uuid()::text,prefix||'G','2026-08-24 15:00Z',prefix||' ALIADO',prefix||'A','aliado',ejecutivo,
      'CLIENTE SINTETICO G','000000000000001',ref,ref,880000,880000,100000,true,'{"valorComercial":980000,"pagamosArchivo":123}'),
    (perdida,lote,'krediya',gen_random_uuid()::text,prefix||'P','2026-08-24 16:00Z',prefix||' ALIADO',prefix||'A','aliado',ejecutivo,
      'CLIENTE SINTETICO P','000000000000002',ref,ref,600000,600000,100000,true,'{"valorComercial":700000,"pagamosArchivo":123}'),
    (propia,lote,'krediya',gen_random_uuid()::text,prefix||'R','2026-08-24 17:00Z',prefix||' RETAIL',prefix||'R','propia',null,
      'CLIENTE SINTETICO R','000000000000003',ref,ref,900000,900000,100000,true,'{"valorComercial":1000000,"pagamosArchivo":123}');
  -- Anulada sin precios ni reconocimiento: se excluye, no suma ni bloquea.
  insert into public.liquidation_operations(liquidation_id,plataforma,source_key,external_id,operation_at,
    establishment_name,tipo_establecimiento,monto_base,inicial,reconocida,normalized_data)
    values(lote,'krediya',gen_random_uuid()::text,prefix||'ANULADA','2026-08-24 18:00Z',prefix||' ANULADA',
      'no_reconocido',0,0,false,'{"estado":"ANULADO"}');
  insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion,bloquea_aprobacion)
    values(lote,ganancia,'krediya_precio_venta_diferente','Prueba: PVP diferente',true),
      (lote,ganancia,'krediya_bono_sin_configurar','Prueba: alerta antigua de bono',true);
  insert into kv2_fixture values ('gerencia',gerencia::text),('auditoria',auditoria::text),('tienda',tienda::text),
    ('lote',lote::text),('ganancia',ganancia::text),('perdida',perdida::text),('propia',propia::text),
    ('aliado',aliado::text),('ejecutivo_beneficiario',ejecutivo_beneficiario::text),
    ('prefix',prefix),('extra',extra::text),('ref',ref);

  -- Lotes negativos independientes: verifican preflight atómico.
  foreach p in array array['faltante','duplicado','inicial'] loop
    lid:=gen_random_uuid();
    insert into public.liquidations(id,plataforma,fecha_corte,idempotency_key)
      values(lid,'krediya','2026-08-30',gen_random_uuid());
    insert into kv2_fixture values(p,lid::text);
    insert into public.liquidation_operations(liquidation_id,plataforma,source_key,external_id,operation_at,
      establishment_name,origen_codigo,tipo_establecimiento,ejecutivo_id,referencia,modelo,
      monto_credito,monto_base,inicial,reconocida,normalized_data)
    values(lid,'krediya',gen_random_uuid()::text,prefix||p,'2026-08-24 15:00Z',prefix||' ALIADO',prefix||'A','aliado',ejecutivo,
      case when p='faltante' then prefix||' SIN TARIFA' else ref end,
      case when p='faltante' then prefix||' SIN TARIFA' else ref end,
      880000,880000,case when p='inicial' then 800000 else 100000 end,true,'{"valorComercial":980000}');
    if p='duplicado' then
      -- El índice existente impide duplicados antes incluso del preflight.
      begin
        insert into public.liquidation_operations(liquidation_id,plataforma,source_key,external_id,operation_at,
          establishment_name,origen_codigo,tipo_establecimiento,ejecutivo_id,referencia,modelo,
          monto_credito,monto_base,inicial,reconocida,normalized_data)
        values(lid,'krediya',gen_random_uuid()::text,prefix||p,'2026-08-24 15:00Z',prefix||' ALIADO',prefix||'A','aliado',ejecutivo,
          ref,ref,880000,880000,100000,true,'{"valorComercial":980000}');
        raise exception 'El índice debió rechazar el crédito duplicado';
      exception when unique_violation then null;
      end;
    end if;
  end loop;
end $$;

-- Ejecución por Auditoría: puede calcular y enviar, nunca aprobar ni pagar.
select set_config('request.jwt.claim.sub',(select v from kv2_fixture where k='auditoria'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',(select v from kv2_fixture where k='auditoria'),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare l public.liquidations%rowtype; test_lote uuid; g uuid; p uuid; r uuid; extra numeric; b numeric;
  before_orders jsonb; before_calc jsonb; snap jsonb; original_net numeric;
begin
  select v::uuid into test_lote from kv2_fixture where k='lote';
  select v::uuid into g from kv2_fixture where k='ganancia';
  select v::uuid into p from kv2_fixture where k='perdida';
  select v::uuid into r from kv2_fixture where k='propia';
  select v::numeric into extra from kv2_fixture where k='extra'; b:=50000+extra;
  l:=public.krediya_calcular_y_enviar_aprobacion(test_lote);
  assert l.estado='revisada' and l.reviewed_by=auth.uid() and l.frozen_at is null and l.approved_at is null,
    'Calcular debe enviar a aprobación, sin aprobar ni congelar';
  assert (select count(*)=3 from public.liquidation_calculations where liquidation_id=test_lote), 'Sólo 3 reconocidas';
  assert (select count(*)=2 from public.krediya_diferencias where liquidation_id=test_lote and estado='pendiente'),
    'Las 2 diferencias PVP pasan a seguimiento independiente';
  assert not exists(select 1 from public.liquidation_incidents where liquidation_id=test_lote and estado='abierta' and bloquea_aprobacion),
    'Diferencias PVP y bonos ya configurados no deben bloquear';
  assert (select sum(valor)=10000 from public.liquidation_bonuses where operation_id in(g,p) and tipo_bono='krediya_gestion'),
    'Mayte recibe 5.000 por crédito aliado';
  assert (select sum(valor)=30000 from public.liquidation_bonuses where operation_id in(g,p) and tipo_bono='krediya_operacion'),
    'Operación recibe 15.000 por crédito aliado';
  assert not exists(select 1 from public.liquidation_bonuses lb where lb.liquidation_id=test_lote and lb.tipo_bono='automatico_universal'
    and exists(select 1 from public.krediya_bonus_rules br where br.concepto='gestion_krediya' and br.activo and br.beneficiary_id=lb.beneficiary_id)),
    'Mayte universal no se duplica con Mayte operativo';
  assert (select total_bonos=b and pagamos=750000 and pago_aliado=650000 from public.liquidation_calculations where operation_id=g),
    'PAGAMOS pactado menos inicial y bonos ejecutivos más operativos';
  select policy_snapshot into snap from public.liquidation_calculations where operation_id=g;
  assert (snap->>'pvp_liquidado')::numeric=980000 and (snap->>'gasto_financiero')::numeric=3520,
    'Utilidad usa PVP recibido y gasto financiero 0,4% del crédito';
  assert (snap->>'utilidad_bruta')::numeric=980000-750000-b-3520,
    'La inicial NO se descuenta otra vez de utilidad';
  assert (snap->>'provision')::numeric=round((980000-750000-b-3520)*0.28,2), 'Provisión 28%';
  assert (snap->>'impacto_bruto')::numeric=-20000 and (snap->>'impacto_neto')::numeric=-14400,
    'Informe diferencia PVP: impacto comparable manteniendo el mismo Pagamos, bonos y gasto';
  assert (select utilidad_creditek=(980000-750000-b-3520)-round((980000-750000-b-3520)*0.28,2)
    from public.liquidation_calculations where operation_id=g), 'Utilidad neta exacta';
  assert (select utilidad_creditek<0 and utilidad_creditek=(700000-750000-b-2400)-round((700000-750000-b-2400)*0.28,2)
    from public.liquidation_calculations where operation_id=p), 'Pérdida real conservada, no truncada a cero';
  assert (select total_bonos=20000 and pago_aliado=650000 and utilidad_creditek=163008
    from public.liquidation_calculations where operation_id=r), 'Retail lleva sólo bonos operativos y resultado propio';
  assert l.total_pago_aliados=1300000 and l.total_pago_tiendas=650000 and l.total_bonos=2*b+20000,
    'Totales aliados/retail/bonos separados';
  assert (select count(*)=1 from public.payment_orders where liquidation_id=test_lote
    and beneficiary_id=(select v::uuid from kv2_fixture where k='aliado') and valor=1300000 and bank_account_id is null
    and estado='pendiente' and not historico_inicial and requiere_soporte),
    'Una orden por aliado, sin cuenta ni falso pago histórico en agosto';
  assert not exists(select 1 from public.payment_orders where liquidation_id=test_lote and estado<>'pendiente'),
    'Nunca autorizar/programar/pagar durante cálculo';

  select jsonb_agg(to_jsonb(po) order by po.id) into before_orders from public.payment_orders po where liquidation_id=test_lote;
  select jsonb_agg(to_jsonb(c) order by c.id) into before_calc from public.liquidation_calculations c where liquidation_id=test_lote;
  -- Reintento admitido como no-op o rechazo explícito: ninguna duplicación ni recálculo silencioso.
  begin perform public.krediya_calcular_y_enviar_aprobacion(test_lote);
  exception when others then
    if sqlerrm !~* 'editable|revisada|aprobación|ya calculada' then raise; end if;
  end;
  assert before_orders=(select jsonb_agg(to_jsonb(po) order by po.id) from public.payment_orders po where liquidation_id=test_lote),
    'Reintento debe conservar órdenes e identidades';
  assert before_calc=(select jsonb_agg(to_jsonb(c) order by c.id) from public.liquidation_calculations c where liquidation_id=test_lote),
    'Reintento debe conservar cálculo e identidades';
  perform pg_temp.kv2_expect_error(format('select public.aliados_cambiar_estado(%L::uuid,''aprobada'',''Prueba'')',test_lote),'Óscar|Oscar|aprobador');
  select utilidad_creditek into original_net from public.liquidation_calculations where operation_id=g;
  perform public.krediya_gestionar_diferencia(g,'en_gestion','Prueba: revisar el PVP en Krediya','Referencia sintética');
  assert (select utilidad_creditek=original_net from public.liquidation_calculations where operation_id=g),
    'Gestionar diferencia no altera liquidación';

  for test_lote in select v::uuid from kv2_fixture where k in ('faltante','inicial') loop
    perform pg_temp.kv2_expect_error(format('select public.krediya_calcular_y_enviar_aprobacion(%L::uuid)',test_lote),'PAGAMOS|duplicados|Inicial');
    assert not exists(select 1 from public.liquidation_calculations where liquidation_id=test_lote)
      and not exists(select 1 from public.payment_orders where liquidation_id=test_lote), 'Preflight falla atómicamente';
  end loop;
end $$;
reset role;

-- Gerencia aprueba únicamente el lote ficticio; la falta de cuenta no bloquea.
-- Evita falsos fallos de saldo por actividad concurrente: bloqueo transaccional
-- breve, con lock_timeout de 5 segundos y liberado por ROLLBACK.
select unit from public.treasury_unit_balances where unit in ('tercerizacion','b2b') order by unit for update;
select set_config('request.jwt.claim.sub',(select v from kv2_fixture where k='gerencia'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',(select v from kv2_fixture where k='gerencia'),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare test_lote uuid; g uuid; po public.payment_orders%rowtype; l public.liquidations%rowtype;
  saldo_antes numeric; saldo_aprobado numeric; saldo_pagado numeric; destino_id uuid;
begin
  select v::uuid into test_lote from kv2_fixture where k='lote';
  select v::uuid into g from kv2_fixture where k='ganancia';
  select balance into saldo_antes from public.treasury_unit_balances where unit='tercerizacion';
  assert saldo_antes is not null, 'Unidad Tercerización disponible';
  l:=public.aliados_cambiar_estado(test_lote,'aprobada','Prueba sintética que será deshecha');
  assert l.estado='aprobada' and l.frozen_at is not null and l.approved_by=auth.uid(), 'Aprobación auditada';
  assert exists(select 1 from public.liquidation_treasury_destinations where liquidation_id=test_lote), 'Destinos generados';
  assert (select compensation_value=650000 from public.retail_b2b_compensations
    where operation_id=(select v::uuid from kv2_fixture where k='propia')), 'Compensación retail conserva Pagamos menos inicial';
  -- Tesorería no es el estado de resultados: conserva margen PVP−PAGAMOS;
  -- los bonos se debitan cuando se pagan, la provisión no es un giro bancario.
  -- (980.000−750.000)+(700.000−750.000)+(1.000.000−750.000)=430.000.
  select balance into saldo_aprobado from public.treasury_unit_balances where unit='tercerizacion';
  assert saldo_aprobado=saldo_antes+430000,
    'Aprobar suma margen 430.000: incluye pérdida, sin deducir bonos/provisión/gasto como pagos';
  assert (select total_outsourcing_commission=430000 from public.liquidation_treasury_destinations where liquidation_id=test_lote),
    'Destino Tercerización cuadra con margen y no omite el aliado sin cuenta';
  assert (select coalesce(sum(case when direction='credit' then amount else -amount end),0)=430000
    from public.treasury_movements where liquidation_id=test_lote and unit='tercerizacion'),
    'Movimientos contabilizan también el margen negativo de 50.000';
  select d.id into destino_id from public.liquidation_treasury_destinations d where liquidation_id=test_lote;
  perform public.tesoreria_generar_destinos_liquidacion(test_lote);
  assert (select balance=saldo_aprobado from public.treasury_unit_balances where unit='tercerizacion')
    and (select d.id=destino_id from public.liquidation_treasury_destinations d where liquidation_id=test_lote),
    'Reintentar destinos conserva saldo e identidad';
  perform pg_temp.kv2_expect_error(format('select public.krediya_calcular_y_enviar_aprobacion(%L::uuid)',test_lote),'editable|aprobada|inmutable');
  select * into po from public.payment_orders where liquidation_id=test_lote
    and beneficiary_id=(select v::uuid from kv2_fixture where k='aliado');
  assert po.bank_account_id is null and po.estado='pendiente', 'Sin cuenta permanece pendiente después de aprobación';
  po:=public.aliados_cambiar_estado_pago(po.id,'programado',null);
  assert po.estado='programado' and po.authorized_by=auth.uid(), 'Gerencia puede autorizar antes de completar cuenta';
  perform pg_temp.kv2_expect_error(format('select public.aliados_cambiar_estado_pago(%L::uuid,''pagado'',''kv2-test-soporte'')',po.id),'cuenta');
  assert (select estado='programado' and fecha_pagada is null from public.payment_orders where payment_orders.id=po.id),
    'Registro de pago sin cuenta no produce efectos parciales';
  assert (select balance=saldo_aprobado from public.treasury_unit_balances where unit='tercerizacion'),
    'Intento fallido de pagar aliado sin cuenta no cambia saldo';

  select * into po from public.payment_orders where liquidation_id=test_lote
    and beneficiary_id=(select v::uuid from kv2_fixture where k='ejecutivo_beneficiario');
  assert po.valor=60000 and po.bank_account_id is not null and po.payment_kind='ejecutivo',
    'Orden ficticia agrupa dos bonos ejecutivos de 30.000';
  po:=public.aliados_cambiar_estado_pago(po.id,'programado',null);
  assert (select balance=saldo_aprobado from public.treasury_unit_balances where unit='tercerizacion'),
    'Autorizar bono no lo descuenta anticipadamente';
  po:=public.aliados_cambiar_estado_pago(po.id,'pagado','kv2-test-no-es-soporte-real');
  assert po.estado='pagado' and po.fecha_pagada is not null and po.paid_by=auth.uid(), 'Registro ficticio de bono pagado';
  select balance into saldo_pagado from public.treasury_unit_balances where unit='tercerizacion';
  assert saldo_pagado=saldo_aprobado-60000, 'Bono se debita una sola vez al pagar';
  assert (select count(*)=1 and sum(amount)=60000 from public.treasury_movements
    where payment_order_id=po.id and unit='tercerizacion' and direction='debit' and type='pago_ejecutivo'),
    'Un movimiento de débito para el pago ejecutivo';
  perform pg_temp.kv2_expect_error(format('select public.aliados_cambiar_estado_pago(%L::uuid,''pagado'',''kv2-test-no-es-soporte-real'')',po.id),'Transición|ya.*pag');
  assert (select balance=saldo_pagado from public.treasury_unit_balances where unit='tercerizacion'),
    'Reintentar pago no duplica el débito';
end $$;
reset role;

-- Trigger de congelación se prueba además como propietario, sin depender de RLS.
select pg_temp.kv2_expect_error(format('update public.liquidation_operations set inicial=1 where id=%L::uuid',
  (select v from kv2_fixture where k='ganancia')),'aprobada|inmutable|congelad');

-- Tienda no puede llamar cálculo, editar tarifa ni gestionar diferencias.
select set_config('request.jwt.claim.sub',(select v from kv2_fixture where k='tienda'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',(select v from kv2_fixture where k='tienda'),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare test_lote uuid;
begin
  select v::uuid into test_lote from kv2_fixture where k='lote';
  perform pg_temp.kv2_expect_error(format('select public.krediya_calcular_y_enviar_aprobacion(%L::uuid)',test_lote),'autorizado|permission');
  perform pg_temp.kv2_expect_error(format('select public.krediya_gestionar_diferencia(%L::uuid,''en_gestion'',''Prueba acceso indebido'',null)',
    (select v from kv2_fixture where k='ganancia')),'autorizado|permission');
  perform pg_temp.kv2_expect_error('select public.krediya_guardar_tarifa(gen_random_uuid(),now(),100,75,current_date,''Prueba acceso indebido'')','autorizado|permission');
  assert not exists(select 1 from public.krediya_diferencias), 'RLS oculta diferencias a tienda';
end $$;
reset role;

-- Motor sólo Krediya; mismas restricciones de cuentas/pérdidas para PayJoy y ALO.
select set_config('request.jwt.claim.sub',(select v from kv2_fixture where k='gerencia'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',(select v from kv2_fixture where k='gerencia'),'role','authenticated')::text,true);
do $$
declare p text; test_lote uuid; op uuid; pol uuid; ben uuid; snapshot jsonb; prefix text;
begin
  select v::uuid into ben from kv2_fixture where k='aliado';
  select v into prefix from kv2_fixture where k='prefix';
  foreach p in array array['payjoy','alo'] loop
    -- Subtransacción de cada sentinel se deshace incluso antes del ROLLBACK final.
    begin
      test_lote:=gen_random_uuid(); op:=gen_random_uuid();
      insert into public.liquidations(id,plataforma,fecha_corte,idempotency_key)
        values(test_lote,p,'2026-09-05',gen_random_uuid());
      snapshot:=(select to_jsonb(l) from public.liquidations l where l.id=test_lote);
      perform pg_temp.kv2_expect_error(format('select public.krediya_calcular_y_enviar_aprobacion(%L::uuid)',test_lote),'editable|encontrada|Krediya');
      assert snapshot=(select to_jsonb(l) from public.liquidations l where l.id=test_lote), 'Motor no cambia lote de otra plataforma';
      perform pg_temp.kv2_expect_error(format(
        'insert into public.payment_orders(liquidation_id,beneficiary_id,valor,idempotency_key) values(%L::uuid,%L::uuid,100,gen_random_uuid())',test_lote,ben),
        'cuenta_pendiente_solo_krediya|bank_account_id');
      select v.id into pol from public.settlement_policy_versions v where v.plataforma=p limit 1;
      assert pol is not null, 'Falta política existente para comprobar aislamiento';
      insert into public.liquidation_operations(id,liquidation_id,plataforma,source_key,external_id,establishment_name,
        tipo_establecimiento,monto_base,reconocida,normalized_data)
        values(op,test_lote,p,gen_random_uuid()::text,prefix||p,'SENTINEL','aliado',100,true,'{}');
      perform pg_temp.kv2_expect_error(format(
        'insert into public.liquidation_calculations(liquidation_id,operation_id,policy_version_id,policy_snapshot,pagamos,pago_aliado,total_bonos,utilidad_creditek,explanation) values(%L::uuid,%L::uuid,%L::uuid,''{}'',100,100,0,-1,''{}'')',test_lote,op,pol),
        'liquidation_calculations_check');
      raise exception using errcode='K0001',message='Sentinel validado y deshecho';
    exception when sqlstate 'K0001' then null;
    end;
  end loop;
  assert (select v from kv2_before where k='otros_lotes')=(select coalesce(jsonb_agg(to_jsonb(l) order by id),'[]') from public.liquidations l where plataforma<>'krediya'),
    'Lotes reales PayJoy/ALO intactos';
  assert (select v from kv2_before where k='otras_operaciones')=(select coalesce(jsonb_agg(to_jsonb(o) order by id),'[]') from public.liquidation_operations o where plataforma<>'krediya'),
    'Operaciones reales PayJoy/ALO intactas';
  assert (select v from kv2_before where k='reglas_bonos')=(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]') from public.krediya_bonus_rules r),
    'Reglas operativas existentes intactas';
end $$;

rollback;
select 'PASS: Krediya v2; cálculo, pérdida, bonos, provisión, seguimiento, reintento, aprobación, saldo de Tercerización +430.000, pago ejecutivo -60.000 una vez, cuenta pendiente, permisos, PayJoy/ALO. Todas las escrituras de prueba revertidas.' as resultado;
