-- Retención documentada de una inicial recibida; no representa una venta nueva.
create table kora_private.ventas_iniciales_retenidas (
  venta_id uuid primary key references public.ventas(id),
  credito_id uuid not null unique references public.creditos(id),
  ajuste_id uuid not null unique references public.venta_ajustes_administrativos(id),
  tienda_codigo text not null references public.origenes(codigo),
  monto numeric not null check (monto>0),
  motivo text not null check (length(btrim(motivo))>=10),
  autorizado_por uuid not null references public.perfiles(id),
  operador_sql text not null,
  created_at timestamptz not null default now()
);
alter table kora_private.ventas_iniciales_retenidas enable row level security;
revoke all on kora_private.ventas_iniciales_retenidas from public,anon,authenticated;

create function kora_private.anulacion_con_inicial_retenida_permitida(
  p_tabla text,p_operacion text,p_antes jsonb,p_despues jsonb
) returns boolean language plpgsql stable security definer set search_path='' as $$
declare solicitud uuid;
begin
  if session_user not in ('postgres','supabase_admin') or p_tabla<>'ventas' or p_operacion<>'UPDATE'
     or (p_antes->>'anulada')::boolean is distinct from false
     or (p_despues->>'anulada')::boolean is distinct from true
     or (p_antes-'anulada'-'nota') is distinct from (p_despues-'anulada'-'nota') then return false; end if;
  solicitud:=nullif(current_setting('app.venta_retencion_id',true),'')::uuid;
  return solicitud is not null and exists(
    select 1 from kora_private.ventas_iniciales_retenidas r
    join public.venta_ajustes_administrativos a on a.id=r.ajuste_id
    join public.creditos c on c.id=r.credito_id and c.venta_id=r.venta_id
    join public.perfiles p on p.id=r.autorizado_por and p.activo and p.rol='gerencia'
    where a.id=solicitud and r.venta_id::text=p_antes->>'id'
      and r.tienda_codigo=p_antes->>'tienda_codigo' and r.monto=c.cuota_inicial
      and r.operador_sql=session_user and a.usuario_id=r.autorizado_por
      and a.tipo='anulacion' and a.estado='aplicado'
      and a.valores_anteriores->'venta'=p_antes
      and a.valores_nuevos->'venta'=p_despues
  );
end $$;
revoke all on function kora_private.anulacion_con_inicial_retenida_permitida(text,text,jsonb,jsonb) from public,anon,authenticated;

-- Conservar el resto de ambas funciones exactamente; abortar ante una forma inesperada.
do $$
declare d text; needle text;
begin
  d:=pg_get_functiondef('public.caja_guardar_movimiento()'::regprocedure);
  needle:='fila:=case when tg_op=''DELETE'' then to_jsonb(old) else to_jsonb(new) end;';
  if (length(d)-length(replace(d,needle,'')))/length(needle)<>1 then raise exception 'Forma de guarda de caja inesperada'; end if;
  d:=replace(d,needle,needle||E'\n  if tg_op=''UPDATE'' and tg_table_name=''ventas'' and\n    kora_private.anulacion_con_inicial_retenida_permitida(tg_table_name,tg_op,to_jsonb(old),to_jsonb(new)) then return new; end if;');
  execute d;
  d:=pg_get_functiondef('public.caja_componentes_rango(text,date,date)'::regprocedure);
  foreach needle in array array['with v as (', '''iniciales'',v.iniciales,', 'v.contado+v.iniciales+m.ingresos', 'from v,g,m;'] loop
    if (length(d)-length(replace(d,needle,'')))/length(needle)<>1 then raise exception 'Forma de componentes de caja inesperada: %',needle; end if;
  end loop;
  d:=replace(d,'with v as (', 'with retenidas as (
    select coalesce(sum(r.monto),0) monto from kora_private.ventas_iniciales_retenidas r
    join public.ventas v on v.id=r.venta_id and v.anulada
    where r.tienda_codigo=p_tienda and v.fecha between p_desde and p_hasta
  ), v as (');
  d:=replace(d,'''iniciales'',v.iniciales,','''iniciales'',v.iniciales+retenidas.monto,');
  d:=replace(d,'v.contado+v.iniciales+m.ingresos','v.contado+v.iniciales+retenidas.monto+m.ingresos');
  d:=replace(d,'from v,g,m;','from v,g,m,retenidas;');
  execute d;
end $$;

-- Soporte administrativo privado: el autorizante humano y el operador SQL son distintos.
-- No crea un endpoint ni suplanta una sesión de usuario.
create function kora_private.rectificar_credito_retail_con_inicial_retenida(
  p_solicitud uuid,p_incidencia uuid,p_venta uuid,p_compensacion uuid,
  p_autorizado_por uuid,p_motivo text,p_abono_esperado numeric,p_inicial_esperada numeric
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v public.ventas%rowtype; c public.creditos%rowtype; b public.retail_b2b_compensations%rowtype;
  i public.venta_items%rowtype; u public.unidades%rowtype; m public.movimientos%rowtype;
  lo public.liquidation_operations%rowtype; ab public.cuenta_corriente%rowtype;
  recibo public.venta_ajustes_administrativos%rowtype;
  antes jsonb; despues jsonb; venta_prevista jsonb; caja_antes jsonb; caja_despues jsonb;
  nota_nueva text; saldo_antes numeric; saldo_despues numeric; cargo bigint; movimiento bigint;
  cierres_antes jsonb; cierres_despues jsonb; cortes_antes jsonb; cortes_despues jsonb;
begin
  if session_user not in ('postgres','supabase_admin') or current_user not in ('postgres','supabase_admin') then raise exception 'Solo soporte SQL administrativo'; end if;
  if p_solicitud is null or p_incidencia is null or p_autorizado_por is null
    or length(btrim(coalesce(p_motivo,'')))<20 or coalesce(p_abono_esperado,0)<=0 or coalesce(p_inicial_esperada,0)<=0 then raise exception 'Solicitud incompleta'; end if;
  if not exists(select 1 from public.perfiles where id=p_autorizado_por and activo and rol='gerencia')
    or not exists(select 1 from public.kora_incidents where id=p_incidencia) then raise exception 'Falta autorización de Gerencia o incidencia'; end if;
  perform pg_advisory_xact_lock(hashtextextended('retencion-venta:'||p_venta::text,0));
  select * into recibo from public.venta_ajustes_administrativos where id=p_solicitud;
  if found then
    if recibo.venta_id is distinct from p_venta or recibo.tipo is distinct from 'anulacion' or recibo.estado is distinct from 'aplicado'
      or recibo.usuario_id is distinct from p_autorizado_por
      or recibo.valores_nuevos->>'compensacion_id' is distinct from p_compensacion::text
      or recibo.valores_nuevos->>'incidencia_id' is distinct from p_incidencia::text
      or (recibo.valores_nuevos->>'inicial_retenida_caja')::numeric is distinct from p_inicial_esperada
      or (recibo.valores_nuevos->>'abono_reversado')::numeric is distinct from p_abono_esperado then raise exception 'La solicitud ya corresponde a otra corrección'; end if;
    return recibo.valores_nuevos||jsonb_build_object('ok',true,'ya_aplicado',true,'ajuste_id',p_solicitud);
  end if;
  select * into v from public.ventas where id=p_venta for update;
  if not found or v.anulada is distinct from false or v.tipo is distinct from 'credito' or v.efectivo_devuelto_registrado is distinct from 0 then raise exception 'Venta no elegible'; end if;
  perform pg_advisory_xact_lock(hashtextextended('caja-arrastre:'||v.tienda_codigo,0));
  lock table public.cuenta_corriente in share row exclusive mode;
  select * into c from public.creditos where venta_id=p_venta for update;
  if not found or c.financiera is distinct from 'payjoy' or c.cuota_inicial is distinct from p_inicial_esperada
    or c.estado_conciliacion is distinct from 'pendiente' or c.conciliado_at is not null
    or c.importacion_id is not null or c.valor_real_financiera is not null then raise exception 'Crédito no elegible o inicial cambió'; end if;
  if exists(select 1 from public.credit_portfolio_obligations where credito_id=c.id)
    or exists(select 1 from public.importacion_detalle where credito_id=c.id)
    or exists(select 1 from public.liquidation_operations where credito_id=c.id)
    or exists(select 1 from public.periodos where tienda_codigo=v.tienda_codigo and v.fecha between fecha_inicio and fecha_fin) then raise exception 'Existe otro vínculo financiero o período cerrado que requiere conciliación'; end if;
  if (select count(*) from public.venta_items where venta_id=p_venta)<>1 then raise exception 'La corrección exige una sola unidad'; end if;
  select * into i from public.venta_items where venta_id=p_venta for update;
  if i.unidad_id is null or i.cantidad is distinct from 1 then raise exception 'No es una unidad individual'; end if;
  select * into u from public.unidades where id=i.unidad_id for update;
  if not found or u.estado is distinct from 'vendido' or u.tienda_actual is distinct from v.tienda_codigo then raise exception 'La unidad ya cambió de estado o tienda'; end if;
  select * into b from public.retail_b2b_compensations where id=p_compensacion for update;
  if not found or b.store_code is distinct from v.tienda_codigo or b.imei is distinct from u.imei or b.platform is distinct from 'payjoy'
    or b.reversed_at is not null or b.applied_at is null
    or b.compensation_value is distinct from p_abono_esperado then raise exception 'Compensación no elegible o ya reversada'; end if;
  select * into lo from public.liquidation_operations where id=b.operation_id for update;
  if not found or lo.imei is distinct from u.imei or lo.origen_codigo is distinct from v.tienda_codigo or lo.plataforma is distinct from 'payjoy'
    or lo.liquidation_id is distinct from b.liquidation_id then raise exception 'Liquidación no corresponde a la unidad'; end if;
  if (select count(*) from public.cuenta_corriente where referencia_tipo='compensacion_liquidacion_retail' and referencia_id=b.id::text)<>1 then raise exception 'El abono original no es único'; end if;
  select * into ab from public.cuenta_corriente where referencia_tipo='compensacion_liquidacion_retail' and referencia_id=b.id::text;
  if ab.tipo is distinct from 'abono' or ab.tienda_codigo is distinct from v.tienda_codigo or ab.monto is distinct from p_abono_esperado
    or exists(select 1 from public.cuenta_corriente where referencia_tipo='reversion_compensacion_retail' and referencia_id=b.id::text) then raise exception 'Abono no elegible o ya reversado'; end if;
  if (select count(*) from public.movimientos where referencia_tipo='venta' and referencia_id=p_venta::text and unidad_id=u.id)<>1 then raise exception 'Salida de inventario no es única'; end if;
  select * into m from public.movimientos where referencia_tipo='venta' and referencia_id=p_venta::text and unidad_id=u.id;
  if m.tipo is distinct from 'venta' or m.cantidad is distinct from 1
    or m.producto_id is distinct from i.producto_id then raise exception 'La salida no corresponde a la unidad vendida'; end if;
  if exists(select 1 from public.movimientos where reverso_de=m.id) then raise exception 'La salida de inventario ya fue reversada'; end if;
  if exists(select 1 from kora_private.ventas_iniciales_retenidas where venta_id=v.id) then raise exception 'La inicial ya tiene una retención'; end if;
  caja_antes:=public.caja_calcular_interno(v.tienda_codigo,(now() at time zone 'America/Bogota')::date);
  select coalesce(sum(case when tipo='cargo' then monto else -monto end),0) into saldo_antes from public.cuenta_corriente where tienda_codigo=v.tienda_codigo;
  select coalesce(jsonb_agg(to_jsonb(x) order by fecha),'[]') into cierres_antes from public.caja_diaria x where tienda_codigo=v.tienda_codigo;
  select coalesce(jsonb_agg(to_jsonb(x) order by fecha),'[]') into cortes_antes from public.caja_cortes x where tienda_codigo=v.tienda_codigo;
  nota_nueva:=concat_ws(E'\n',nullif(v.nota,''),'ANULADA: '||btrim(p_motivo)||' | Inicial retenida en caja, sin reembolso: $'||p_inicial_esperada::text);
  venta_prevista:=to_jsonb(v)||jsonb_build_object('anulada',true,'nota',nota_nueva);
  antes:=jsonb_build_object('venta',to_jsonb(v),'credito',to_jsonb(c),'unidad',to_jsonb(u),
    'compensacion',to_jsonb(b),'abono',to_jsonb(ab),'movimiento',to_jsonb(m),'caja',caja_antes,'saldo_cartera',saldo_antes);
  insert into public.venta_ajustes_administrativos(id,venta_id,tipo,motivo,estado,valores_anteriores,valores_nuevos,usuario_id)
    values(p_solicitud,v.id,'anulacion',btrim(p_motivo),'aplicado',antes,jsonb_build_object('venta',venta_prevista),p_autorizado_por);
  insert into kora_private.ventas_iniciales_retenidas(venta_id,credito_id,ajuste_id,tienda_codigo,monto,motivo,autorizado_por,operador_sql)
    values(v.id,c.id,p_solicitud,v.tienda_codigo,p_inicial_esperada,'Pendiente de confirmación de devolución por Gestión. '||btrim(p_motivo),p_autorizado_por,session_user);
  perform set_config('app.venta_retencion_id',p_solicitud::text,true);
  perform set_config('app.ajuste_venta_autorizado','1',true);
  update public.ventas set anulada=true,nota=nota_nueva where id=v.id;
  update public.unidades set estado='disponible' where id=u.id;
  insert into public.movimientos(tipo,tienda_codigo,producto_id,unidad_id,cantidad,costo,precio,referencia_tipo,referencia_id,reverso_de,usuario,nota)
    values('ajuste_entrada',v.tienda_codigo,i.producto_id,u.id,1,i.costo_congelado,i.precio_venta,'anulacion_venta',v.id::text,m.id,p_autorizado_por,btrim(p_motivo)) returning id into movimiento;
  update public.creditos set estado_conciliacion='novedad' where id=c.id;
  insert into public.cuenta_corriente(tienda_codigo,tipo,concepto,monto,referencia_tipo,referencia_id,usuario,nota)
    values(v.tienda_codigo,'cargo','Reversión de compensación PayJoy por venta anulada #'||v.consecutivo,p_abono_esperado,
      'reversion_compensacion_retail',b.id::text,p_autorizado_por,'Revierte abono #'||ab.id||'. '||btrim(p_motivo)) returning id into cargo;
  update public.retail_b2b_compensations set reversed_at=now() where id=b.id;
  perform set_config('app.ajuste_venta_autorizado','',true);
  perform set_config('app.venta_retencion_id','',true);
  caja_despues:=public.caja_calcular_interno(v.tienda_codigo,(now() at time zone 'America/Bogota')::date);
  select coalesce(sum(case when tipo='cargo' then monto else -monto end),0) into saldo_despues from public.cuenta_corriente where tienda_codigo=v.tienda_codigo;
  select coalesce(jsonb_agg(to_jsonb(x) order by fecha),'[]') into cierres_despues from public.caja_diaria x where tienda_codigo=v.tienda_codigo;
  select coalesce(jsonb_agg(to_jsonb(x) order by fecha),'[]') into cortes_despues from public.caja_cortes x where tienda_codigo=v.tienda_codigo;
  if caja_antes->'esperado' is distinct from caja_despues->'esperado'
    or caja_antes->'apertura' is distinct from caja_despues->'apertura'
    or cierres_antes is distinct from cierres_despues or cortes_antes is distinct from cortes_despues
    or saldo_despues-saldo_antes<>p_abono_esperado then raise exception 'Invariante de caja, cierre o cartera incumplida'; end if;
  despues:=jsonb_build_object('venta',(select to_jsonb(x) from public.ventas x where id=v.id),
    'credito',(select to_jsonb(x) from public.creditos x where id=c.id),
    'unidad',(select to_jsonb(x) from public.unidades x where id=u.id),
    'compensacion',(select to_jsonb(x) from public.retail_b2b_compensations x where id=b.id),
    'incidencia_id',p_incidencia,'compensacion_id',b.id,'cargo_reverso_id',cargo,'movimiento_reingreso_id',movimiento,
    'inicial_retenida_caja',p_inicial_esperada,'abono_reversado',p_abono_esperado,'saldo_cartera',saldo_despues,
    'caja',caja_despues,'operador_sql',session_user,'autorizado_por',p_autorizado_por,'pendiente_confirmar_inicial',true);
  update public.venta_ajustes_administrativos set valores_nuevos=despues where id=p_solicitud;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(p_autorizado_por::text,'RECTIFICAR_CREDITO_RETAIL_INICIAL_RETENIDA','ventas',v.id::text,
      jsonb_build_object('solicitud_id',p_solicitud,'incidencia_id',p_incidencia,'motivo',p_motivo,
        'operador_sql',session_user,'autorizacion','Instrucción expresa de Gerencia; inicial permanece en caja hasta confirmación de Gestión',
        'antes',antes,'despues',despues));
  return despues||jsonb_build_object('ok',true,'ya_aplicado',false,'ajuste_id',p_solicitud);
end $$;
revoke all on function kora_private.rectificar_credito_retail_con_inicial_retenida(uuid,uuid,uuid,uuid,uuid,text,numeric,numeric) from public,anon,authenticated;
