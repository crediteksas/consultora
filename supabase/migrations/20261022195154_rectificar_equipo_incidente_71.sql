-- Rectificación puntual autorizada de equipo: configuración privada por el operador.
-- No cambia el cobro, no anula la venta y no borra/edita el kardex.
-- El congelador de costo se adapta SOLO dentro de esta transacción y se restaura
-- antes del commit; no se publica una excepción ni se conceden permisos nuevos.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '20s';
do $repair$
declare
  p jsonb := nullif(current_setting('kora.rectificacion_equipo_config',true),'')::jsonb;
  expected jsonb := nullif(current_setting('kora.rectificacion_equipo_huellas',true),'')::jsonb;
  v public.ventas%rowtype; i public.venta_items%rowtype;
  u0 public.unidades%rowtype; u1 public.unidades%rowtype;
  m public.movimientos%rowtype; a public.venta_ajustes_administrativos%rowtype;
  fn_before text; fn_temp text; fn_acl text; marker text := '  if tg_op = ''UPDATE'' then';
  financial_before jsonb; financial_after jsonb; before_data jsonb; after_data jsonb;
  reverse_id bigint; corrected_id bigint; affected integer; event_before bigint;
  previous_flag text; reason text;
  actor_id uuid; incident_id uuid;
begin
  if current_user <> 'postgres' then raise exception 'Rectificación administrativa: ejecutor no permitido'; end if;
  if p is null or expected is null then raise exception 'Falta la configuración privada de la rectificación autorizada'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p->>'code',0));
  perform pg_advisory_xact_lock(hashtextextended('caja-arrastre:'||(p->>'store'),0));
  select id into strict actor_id from public.perfiles where nombre=p->>'actor_name' and activo and rol='gerencia';
  select id into strict incident_id from public.kora_incidents where incident_code=p->>'code' and store_code=p->>'store';
  -- Se resuelven las claves desde identificadores de negocio; no se presuponen UUID/seriales generados.
  select * into strict v from public.ventas where consecutivo=(p->>'number')::bigint
    and tienda_codigo=p->>'store' and fecha=(p->>'date')::date for update;
  select * into strict i from public.venta_items where venta_id=v.id for update;
  select * into a from public.venta_ajustes_administrativos where venta_id=v.id and valores_nuevos->>'incidencia'=p->>'code';
  if found then
    select * into strict u0 from public.unidades where id=(a.valores_anteriores->'equipo_erroneo'->>'id')::uuid for update;
    select * into strict u1 from public.unidades where id=(a.valores_nuevos->'equipo_correcto'->>'id')::uuid for update;
    if a.venta_id=v.id and a.estado='aplicado'
       and i.unidad_id=u1.id and i.producto_id=u1.producto_id and u0.estado='disponible' and u1.estado='vendido'
       and to_jsonb(i)=a.valores_nuevos->'item'
       and (select count(*) from public.movimientos where id in ((a.valores_nuevos->>'reverso_id')::bigint,(a.valores_nuevos->>'salida_correcta_id')::bigint))=2 then
      return;
    end if;
    raise exception 'Identificador aplicado a un estado diferente';
  end if;
  select * into strict u1 from public.unidades where tienda_actual=p->>'store' and right(imei,4)=p->>'new_suffix';
  perform 1 from public.unidades where id in (i.unidad_id,u1.id) order by id for update;
  select * into strict u0 from public.unidades where id=i.unidad_id;
  select * into strict u1 from public.unidades where id=u1.id;
  select * into strict m from public.movimientos where referencia_tipo='venta' and referencia_id=v.id::text
    and unidad_id=u0.id and tipo='venta' for share;
  p:=p||jsonb_build_object('request_id',gen_random_uuid(),'actor',actor_id,'incident_id',incident_id,
    'sale_id',v.id,'item_id',i.id,'old_unit',u0.id,'new_unit',u1.id,'old_product',u0.producto_id,'new_product',u1.producto_id,'movement',m.id);
  if md5(to_jsonb(v)::text) is distinct from expected->>'sale_md5'
     or md5(to_jsonb(i)::text) is distinct from expected->>'item_md5'
     or md5(to_jsonb(u0)::text) is distinct from expected->>'old_unit_md5'
     or md5(to_jsonb(u1)::text) is distinct from expected->>'new_unit_md5'
     or md5(to_jsonb(m)::text) is distinct from expected->>'movement_md5' then
    raise exception 'El estado cambió desde el diagnóstico: no se rectificó nada';
  end if;
  if v.consecutivo is distinct from (p->>'number')::bigint or v.tienda_codigo is distinct from p->>'store'
     or v.fecha is distinct from (p->>'date')::date or v.tipo is distinct from 'contado'
     or v.anulada is distinct from false or v.total is distinct from (p->>'price')::numeric
     or v.efectivo_devuelto_registrado is distinct from 0::numeric
     or i.venta_id<>v.id or i.unidad_id<>u0.id or i.producto_id<>u0.producto_id
     or i.cantidad<>1 or i.precio_venta<>v.total
     or i.costo_congelado is distinct from (p->>'old_cost')::numeric
     or i.costo_remision_congelado is distinct from (p->>'old_cost')::numeric
     or i.costo_tienda_congelado is distinct from (p->>'old_retail')::numeric
     or u0.producto_id is distinct from (p->>'old_product')::uuid
     or u1.producto_id is distinct from (p->>'new_product')::uuid
     or u0.estado is distinct from 'vendido' or u1.estado is distinct from 'disponible'
     or u0.tienda_actual is distinct from v.tienda_codigo or u1.tienda_actual is distinct from v.tienda_codigo
     or right(u0.imei,4) is distinct from p->>'old_suffix' or right(u1.imei,4) is distinct from p->>'new_suffix'
     or u1.created_at>v.created_at
     or u1.costo_remision is distinct from (p->>'new_cost')::numeric
     or u1.precio_tienda is distinct from (p->>'new_retail')::numeric
     or m.tipo<>'venta' or m.unidad_id<>u0.id or m.producto_id<>u0.producto_id
     or m.tienda_codigo<>v.tienda_codigo or m.cantidad<>1 or m.costo<>i.costo_congelado
     or m.precio<>i.precio_venta or m.referencia_tipo<>'venta' or m.referencia_id<>v.id::text
     or m.reverso_de is not null then raise exception 'La venta, los equipos o los costos cambiaron: no se rectificó nada'; end if;
  if (select count(*) from public.venta_items where venta_id=v.id)<>1
     or exists(select 1 from public.creditos where venta_id=v.id)
     or exists(select 1 from public.periodos where tienda_codigo=v.tienda_codigo and v.fecha between fecha_inicio and fecha_fin)
     or exists(select 1 from public.venta_items x join public.ventas z on z.id=x.venta_id
       where x.unidad_id=u1.id and not z.anulada)
     or exists(select 1 from public.movimientos where reverso_de=m.id)
     or exists(select 1 from public.venta_ajustes_administrativos where venta_id=v.id) then
    raise exception 'Existen efectos posteriores o un período cerrado: revisión necesaria';
  end if;
  select pg_get_functiondef('public.aplicar_utilidad_tienda_costo_remision()'::regprocedure),
    coalesce(proacl::text,'') into fn_before,fn_acl from pg_proc
    where oid='public.aplicar_utilidad_tienda_costo_remision()'::regprocedure;
  if md5(fn_before)<>p->>'cost_function_md5'
     or (length(fn_before)-length(replace(fn_before,marker,'')))/length(marker)<>1 then
    raise exception 'El congelador de costo cambió; operación cancelada';
  end if;
  select jsonb_build_object('venta',to_jsonb(v),
    'caja',public.caja_calcular_interno(v.tienda_codigo,(now() at time zone 'America/Bogota')::date),
    'cierres',(select jsonb_agg(to_jsonb(x) order by fecha) from public.caja_cortes x where tienda_codigo=v.tienda_codigo),
    'caja_diaria',(select jsonb_agg(to_jsonb(x) order by fecha) from public.caja_diaria x where tienda_codigo=v.tienda_codigo),
    'cartera',(select jsonb_agg(to_jsonb(x) order by id) from public.cuenta_corriente x where tienda_codigo=v.tienda_codigo),
    'movimientos_caja',(select jsonb_agg(to_jsonb(x) order by id) from public.movimientos_caja_tienda x where tienda_codigo=v.tienda_codigo),
    'gastos',(select jsonb_agg(to_jsonb(x) order by id) from public.gastos x where tienda_codigo=v.tienda_codigo)) into financial_before;
  select coalesce(max(id),0) into event_before from inventario_control.eventos;
  before_data:=jsonb_build_object('item',to_jsonb(i),'equipo_erroneo',to_jsonb(u0),'equipo_correcto',to_jsonb(u1),'movimiento_original',to_jsonb(m));
  reason:=(p->>'code')||': rectificación autorizada del equipo de la venta '||(p->>'number')||'. Se conserva importe, fecha, cliente, vendedor, caja y cierres. Sin pago ni gasto.';
  previous_flag:=coalesce(current_setting('app.ajuste_venta_autorizado',true),'');
  perform set_config('app.ajuste_venta_autorizado','1',true);
  perform set_config('kora.incident71_scope',p->>'request_id',true);
  fn_temp:=replace(fn_before,marker,format(
    '  if tg_op = ''UPDATE'' and current_setting(''kora.incident71_scope'',true)=%L and old.id=%L::uuid and old.unidad_id=%L::uuid and new.unidad_id=%L::uuid and new.venta_id=old.venta_id and new.precio_venta=old.precio_venta and new.cantidad=old.cantidad then
    select costo_remision into v_costo_remision from public.unidades where id=new.unidad_id;
  elsif tg_op = ''UPDATE'' then',p->>'request_id',i.id::text,u0.id::text,u1.id::text));
  execute fn_temp;
  update public.venta_items set producto_id=u1.producto_id,unidad_id=u1.id,
    costo_congelado=u1.costo_remision,costo_remision_congelado=u1.costo_remision,
    costo_tienda_congelado=u1.precio_tienda,estado_costo_tienda='trazable' where id=i.id;
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'No se rectificó una única línea'; end if;
  execute fn_before;
  perform set_config('kora.incident71_scope','',true);
  perform set_config('app.ajuste_venta_autorizado',previous_flag,true);
  update public.unidades set estado='disponible' where id=u0.id and estado='vendido';
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'No se restituyó el equipo original'; end if;
  update public.unidades set estado='vendido' where id=u1.id and estado='disponible';
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'No se descontó el equipo correcto'; end if;
  insert into public.movimientos(tipo,tienda_codigo,producto_id,unidad_id,cantidad,costo,precio,
    referencia_tipo,referencia_id,reverso_de,usuario,nota)
  values('reverso',v.tienda_codigo,u0.producto_id,u0.id,m.cantidad,m.costo,m.precio,
    'rectificacion_venta',p->>'request_id',m.id,(p->>'actor')::uuid,reason) returning id into reverse_id;
  -- El kardex conserva un reverso y la salida correcta. El dinero sigue en la
  -- misma fila de ventas: no se inserta otra venta ni un movimiento de caja.
  insert into public.movimientos(tipo,tienda_codigo,producto_id,unidad_id,cantidad,costo,precio,
    referencia_tipo,referencia_id,usuario,nota,costo_tienda)
  values('venta',v.tienda_codigo,u1.producto_id,u1.id,1,u1.costo_remision,i.precio_venta,
    'venta',v.id::text,(p->>'actor')::uuid,reason,u1.precio_tienda) returning id into corrected_id;
  select jsonb_build_object('venta',to_jsonb(x),
    'caja',public.caja_calcular_interno(v.tienda_codigo,(now() at time zone 'America/Bogota')::date),
    'cierres',(select jsonb_agg(to_jsonb(z) order by fecha) from public.caja_cortes z where tienda_codigo=v.tienda_codigo),
    'caja_diaria',(select jsonb_agg(to_jsonb(z) order by fecha) from public.caja_diaria z where tienda_codigo=v.tienda_codigo),
    'cartera',(select jsonb_agg(to_jsonb(z) order by id) from public.cuenta_corriente z where tienda_codigo=v.tienda_codigo),
    'movimientos_caja',(select jsonb_agg(to_jsonb(z) order by id) from public.movimientos_caja_tienda z where tienda_codigo=v.tienda_codigo),
    'gastos',(select jsonb_agg(to_jsonb(z) order by id) from public.gastos z where tienda_codigo=v.tienda_codigo)) into financial_after
    from public.ventas x where x.id=v.id;
  select * into strict i from public.venta_items where id=i.id;
  if financial_before is distinct from financial_after
     or i.unidad_id<>u1.id or i.producto_id<>u1.producto_id
     or i.costo_congelado<>u1.costo_remision or i.costo_remision_congelado<>u1.costo_remision
     or i.costo_tienda_congelado<>u1.precio_tienda or i.utilidad<>(i.precio_venta-u1.costo_remision)*i.cantidad
     or (select to_jsonb(x)-'estado' from public.unidades x where id=u0.id) is distinct from (to_jsonb(u0)-'estado')
     or (select to_jsonb(x)-'estado' from public.unidades x where id=u1.id) is distinct from (to_jsonb(u1)-'estado')
     or (select to_jsonb(x) from public.movimientos x where id=m.id) is distinct from to_jsonb(m)
     or pg_get_functiondef('public.aplicar_utilidad_tienda_costo_remision()'::regprocedure)<>fn_before
     or (select coalesce(proacl::text,'') from pg_proc where oid='public.aplicar_utilidad_tienda_costo_remision()'::regprocedure)<>fn_acl
     or (select count(*) from inventario_control.eventos where id>event_before and tienda_codigo=v.tienda_codigo and ((imei=u0.imei and delta=1) or (imei=u1.imei and delta=-1)))<>2 then
    raise exception 'La comprobación final falló; rectificación revertida por completo';
  end if;
  after_data:=jsonb_build_object('incidencia',p->>'code','item',to_jsonb(i),
    'equipo_erroneo',(select to_jsonb(x) from public.unidades x where id=u0.id),
    'equipo_correcto',(select to_jsonb(x) from public.unidades x where id=u1.id),
    'reverso_id',reverse_id,'salida_correcta_id',corrected_id,'finanzas_sin_cambios',true);
  insert into public.venta_ajustes_administrativos(id,venta_id,tipo,motivo,valores_anteriores,valores_nuevos,usuario_id)
    values((p->>'request_id')::uuid,v.id,'correccion_datos',reason,before_data,after_data,(p->>'actor')::uuid);
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(current_user,'RECTIFICACION_EQUIPO_AUTORIZADA','ventas',v.id::text,
      jsonb_build_object('incidencia',p->>'code','ajuste_id',p->>'request_id','autorizante',(p->>'actor')::uuid,
        'autorizacion','Autorización expresa de Gerencia en el chat de soporte; no se suplantó una sesión.',
        'ejecutor_db',current_user,'antes',before_data,'despues',after_data));
end $repair$;
commit;
