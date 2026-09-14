-- Read projections: RLS stays on the original tables; internal columns are
-- available only through a private, centrally authorized lookup.
create or replace function kora_private.costo_interno_lectura(p_tabla text, p_id text, p_tienda text default null)
returns numeric language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.perfiles where id=auth.uid() and activo is true and rol in ('gerencia','auditoria')) then return null; end if;
 case p_tabla
 when 'unidades' then return (select costo_remision from public.unidades where id::text=p_id);
 when 'stock_cantidad' then return (select costo_promedio from public.stock_cantidad where producto_id::text=p_id and tienda_codigo=p_tienda);
 when 'movimientos' then return (select costo from public.movimientos where id::text=p_id);
 when 'venta_items' then return (select costo_remision_congelado from public.venta_items where id::text=p_id);
 when 'traslado_items' then return (select costo from public.traslado_items where id::text=p_id);
 else return null;
 end case;
end $$;
revoke all on function kora_private.costo_interno_lectura(text,text,text) from public,anon;
grant usage on schema kora_private to authenticated;
grant execute on function kora_private.costo_interno_lectura(text,text,text) to authenticated;

-- Freeze store cost for future adjustments/reversals as well as sales.
alter table public.movimientos add column if not exists costo_tienda numeric;
create or replace function kora_private.congelar_costo_movimiento_tienda()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 new.costo_tienda := null;
 if new.tienda_codigo = 'CENTRAL' then return new; end if;
 if new.tipo='venta' then
  select sum(vi.costo_tienda_congelado*vi.cantidad)/nullif(sum(vi.cantidad),0)
  into new.costo_tienda from public.venta_items vi
  where vi.venta_id::text=new.referencia_id and vi.producto_id=new.producto_id
  and vi.unidad_id is not distinct from new.unidad_id and vi.estado_costo_tienda='trazable';
 elsif new.tipo in ('carga_inicial','remision_entrada','traslado_entrada','traslado_salida') then
  new.costo_tienda := new.precio;
 elsif new.reverso_de is not null then
  select m.costo_tienda into new.costo_tienda from public.movimientos m where m.id=new.reverso_de;
 end if;
 if new.costo_tienda is null and new.tipo in ('ajuste','reverso') then
  if new.unidad_id is not null then
   select precio_tienda into new.costo_tienda from public.unidades where id=new.unidad_id;
  else
   select precio_tienda into new.costo_tienda from public.stock_cantidad where producto_id=new.producto_id and tienda_codigo=new.tienda_codigo;
  end if;
 end if;
 return new;
end $$;
revoke all on function kora_private.congelar_costo_movimiento_tienda() from public,anon,authenticated;
create trigger congelar_costo_movimiento_tienda before insert on public.movimientos
for each row execute function kora_private.congelar_costo_movimiento_tienda();

create or replace view public.unidades_lectura with(security_invoker=true) as
select id,producto_id,imei,estado,tienda_actual,
 case when public.es_central() then kora_private.costo_interno_lectura('unidades',id::text) else precio_tienda end as costo_remision,
 remision_item_id,created_at,factura_proveedor_id,precio_tienda
from public.unidades;
create or replace view public.stock_cantidad_lectura with(security_invoker=true) as
select producto_id,tienda_codigo,cantidad,
 case when public.es_central() then kora_private.costo_interno_lectura('stock_cantidad',producto_id::text,tienda_codigo) else precio_tienda end as costo_promedio,
 updated_at,precio_tienda,factura_proveedor_id from public.stock_cantidad;
create or replace view public.venta_items_lectura with(security_invoker=true) as
select id,venta_id,producto_id,unidad_id,cantidad,precio_venta,
 case when estado_costo_tienda='trazable' then costo_tienda_congelado end as costo_congelado,
 case when estado_costo_tienda='trazable' then (precio_venta-costo_tienda_congelado)*cantidad end as utilidad,
 costo_tienda_congelado,estado_costo_tienda,
 kora_private.costo_interno_lectura('venta_items',id::text) as costo_remision_congelado
from public.venta_items;
create or replace view public.traslado_items_lectura with(security_invoker=true) as
select id,traslado_id,producto_id,unidad_id,cantidad,precio_tienda,
 case when public.es_central() then kora_private.costo_interno_lectura('traslado_items',id::text) else precio_tienda end as costo
from public.traslado_items;

-- Historical store cost comes only from a store price or frozen sale cost.
-- Never infer it from supplier cost or today's inventory price.
create or replace view public.movimientos_tienda_lectura with(security_invoker=true) as
select m.id,m.tipo,m.tienda_codigo,m.producto_id,m.unidad_id,m.cantidad,
 coalesce(m.costo_tienda,
  case when m.tipo in ('carga_inicial','remision_entrada','traslado_entrada','traslado_salida') then m.precio
       when m.tipo='venta' then
    (select sum(vi.costo_tienda_congelado*vi.cantidad)/nullif(sum(vi.cantidad),0)
     from public.venta_items vi where vi.venta_id::text=m.referencia_id
     and vi.producto_id=m.producto_id and vi.unidad_id is not distinct from m.unidad_id
     and vi.estado_costo_tienda='trazable')
  end) as costo,
 m.precio,m.referencia_tipo,m.referencia_id,m.reverso_de,m.usuario,m.nota,m.created_at
from public.movimientos m;
create or replace view public.movimientos_lectura with(security_invoker=true) as
select m.id,m.tipo,m.tienda_codigo,m.producto_id,m.unidad_id,m.cantidad,
 case when public.es_central() then kora_private.costo_interno_lectura('movimientos',m.id::text) else m.costo end as costo,
 m.precio,m.referencia_tipo,m.referencia_id,m.reverso_de,m.usuario,m.nota,m.created_at
from public.movimientos_tienda_lectura m;
revoke all on public.unidades_lectura,public.stock_cantidad_lectura,public.venta_items_lectura,public.traslado_items_lectura,public.movimientos_lectura,public.movimientos_tienda_lectura from public,anon,authenticated;
grant select on public.unidades_lectura,public.stock_cantidad_lectura,public.venta_items_lectura,public.traslado_items_lectura,public.movimientos_lectura,public.movimientos_tienda_lectura to authenticated;
-- Existing administrative profit views must honor remision_margenes RLS.
alter view public.utilidad_creditek_detalle set(security_invoker=true);
alter view public.utilidad_creditek_rango set(security_invoker=true);
alter view public.utilidad_creditek_por_periodo set(security_invoker=true);
notify pgrst,'reload schema';

-- Autorizado expresamente por Oscar: futuros cierres y metas Retail al costo
-- de remision. Solo cambian 11 lineas SELECT frente a las funciones vigentes.
-- No se ejecutan cierres, no se recalculan periodos ni comisiones existentes.
CREATE OR REPLACE FUNCTION public.calcular_resumen_periodo(p_tienda_codigo text, p_fecha_inicio date, p_fecha_fin date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rol text;
  v_inicio date;
  v_fin date;
  v_inv_inicial numeric := 0;
  v_inv_final numeric := 0;
  v_ventas_totales numeric := 0;
  v_costo_vendido numeric := 0;
  v_gastos_totales numeric := 0;
  v_perdidas numeric := 0;
  v_ganancias numeric := 0;
  v_ajuste_conciliacion numeric := 0;
  v_utilidad numeric := 0;
  v_ya_cerrado boolean;
  v_cajas_abiertas int;
  v_cajas_faltantes int;
  v_ajustes_pendientes int;
  v_comisiones jsonb;
begin
  v_rol := rol_actual();
  if v_rol is null then
    raise exception 'Tu usuario no tiene un perfil asignado. Contacta al administrador.';
  end if;
  -- ==================== GUARD CORREGIDO (R1) ====================
  -- Antes (laxo): es_central() or tienda_actual() = p_tienda_codigo or v_rol = 'admin_tienda'
  -- Ahora (estricto): admin_tienda solo puede operar sobre SU propia tienda
  if not (
    es_central()
    or (v_rol = 'admin_tienda' and tienda_actual() = p_tienda_codigo)
  ) then
    raise exception 'No autorizado para ver este período';
  end if;
  -- ================================================================
  if p_fecha_fin < p_fecha_inicio then
    raise exception 'La fecha de fin no puede ser anterior a la fecha de inicio';
  end if;

  v_inicio := p_fecha_inicio;
  v_fin := p_fecha_fin + 1;

  select exists(select 1 from periodos where tienda_codigo = p_tienda_codigo and fecha_inicio = p_fecha_inicio and fecha_fin = p_fecha_fin) into v_ya_cerrado;

  select coalesce(sum(case
    when tipo in ('remision_entrada','traslado_entrada','reverso') then costo * cantidad
    when tipo in ('venta','traslado_salida') then -costo * cantidad
    when tipo = 'ajuste' then costo * cantidad
    else 0 end), 0)
  into v_inv_inicial
  from public.movimientos_tienda_lectura where tienda_codigo = p_tienda_codigo and created_at < v_inicio;

  select coalesce(sum(case
    when tipo in ('remision_entrada','traslado_entrada','reverso') then costo * cantidad
    when tipo in ('venta','traslado_salida') then -costo * cantidad
    when tipo = 'ajuste' then costo * cantidad
    else 0 end), 0)
  into v_inv_final
  from public.movimientos_tienda_lectura where tienda_codigo = p_tienda_codigo and created_at < v_fin;

  select coalesce(sum(total), 0) into v_ventas_totales
  from ventas where tienda_codigo = p_tienda_codigo and fecha >= v_inicio and fecha < v_fin and coalesce(anulada, false) = false;

  select coalesce(sum(vi.costo_tienda_congelado * vi.cantidad), 0) into v_costo_vendido
  from venta_items vi join ventas v on v.id = vi.venta_id
  where v.tienda_codigo = p_tienda_codigo and v.fecha >= v_inicio and v.fecha < v_fin and coalesce(v.anulada, false) = false;

  select coalesce(sum(g.monto), 0) into v_gastos_totales
  from gastos g join conceptos_gasto cg on cg.id = g.concepto_id
  where g.tienda_codigo = p_tienda_codigo and g.fecha >= v_inicio and g.fecha < v_fin
    and (cg.preautorizado or g.estado = 'aprobado');

  select coalesce(sum(-costo * cantidad), 0) into v_perdidas
  from public.movimientos_tienda_lectura where tienda_codigo = p_tienda_codigo and tipo = 'ajuste' and cantidad < 0 and created_at >= v_inicio and created_at < v_fin;

  select coalesce(sum(costo * cantidad), 0) into v_ganancias
  from public.movimientos_tienda_lectura where tienda_codigo = p_tienda_codigo and tipo = 'ajuste' and cantidad > 0 and created_at >= v_inicio and created_at < v_fin;

  select coalesce(sum(c.valor_real_financiera - c.valor_esperado_financiera), 0) into v_ajuste_conciliacion
  from creditos c join ventas v on v.id = c.venta_id
  where v.tienda_codigo = p_tienda_codigo and c.estado_conciliacion = 'conciliado'
    and (
      (v.fecha >= v_inicio and v.fecha < v_fin)
      or (v.fecha < v_inicio and c.conciliado_at >= v_inicio and c.conciliado_at < v_fin)
    );

  v_utilidad := v_ventas_totales - v_costo_vendido - v_gastos_totales - v_perdidas + v_ajuste_conciliacion;

  select count(*) into v_cajas_abiertas
  from caja_diaria where tienda_codigo = p_tienda_codigo and fecha >= v_inicio and fecha < v_fin and estado <> 'cerrada';

  select count(*) into v_cajas_faltantes
  from (
    select fecha from ventas where tienda_codigo = p_tienda_codigo and fecha >= v_inicio and fecha < v_fin
    union
    select fecha from gastos where tienda_codigo = p_tienda_codigo and fecha >= v_inicio and fecha < v_fin
  ) dias
  where not exists (
    select 1 from caja_diaria cd where cd.tienda_codigo = p_tienda_codigo and cd.fecha = dias.fecha and cd.estado = 'cerrada'
  );

  select count(*) into v_ajustes_pendientes
  from ajustes_inventario where tienda_codigo = p_tienda_codigo and estado = 'pendiente' and created_at >= v_inicio and created_at < v_fin;

  select coalesce(jsonb_agg(c), '[]'::jsonb) into v_comisiones
  from (
    select p.id as perfil_id, p.nombre, 'admin_tienda' as rol, 10 as porcentaje, null::numeric as base_ventas,
      round(v_utilidad * 0.10, 0) as monto
    from perfiles p where p.rol = 'admin_tienda' and p.tienda_codigo = p_tienda_codigo and coalesce(p.activo, true)
    union all
    select p.id, p.nombre, 'asesor', 6,
      coalesce(sum(v.total), 0),
      round(v_utilidad * 0.06 * (coalesce(sum(v.total), 0) / nullif(v_ventas_totales, 0)), 0)
    from perfiles p
    join ventas v on v.vendedor = p.id and v.tienda_codigo = p_tienda_codigo and v.fecha >= v_inicio and v.fecha < v_fin and coalesce(v.anulada, false) = false
    where p.rol = 'asesor'
    group by p.id, p.nombre
  ) c;

  return jsonb_build_object(
    'ya_cerrado', v_ya_cerrado,
    'fecha_inicio', p_fecha_inicio,
    'fecha_fin', p_fecha_fin,
    'dias', (p_fecha_fin - p_fecha_inicio + 1),
    'inventario_inicial', v_inv_inicial,
    'inventario_final', v_inv_final,
    'ventas_totales', v_ventas_totales,
    'costo_vendido', v_costo_vendido,
    'gastos_totales', v_gastos_totales,
    'perdidas_ajustes', v_perdidas,
    'ganancias_ajustes', v_ganancias,
    'ajuste_conciliacion', v_ajuste_conciliacion,
    'utilidad_neta', v_utilidad,
    'cajas_abiertas', v_cajas_abiertas,
    'cajas_faltantes', v_cajas_faltantes,
    'ajustes_pendientes', v_ajustes_pendientes,
    'comisiones', v_comisiones
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.cerrar_periodo(p_tienda_codigo text, p_fecha_inicio date, p_fecha_fin date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rol text;
  v_inicio date;
  v_fin date;
  v_inv_inicial numeric := 0;
  v_inv_final numeric := 0;
  v_ventas_totales numeric := 0;
  v_costo_vendido numeric := 0;
  v_gastos_totales numeric := 0;
  v_perdidas numeric := 0;
  v_ganancias numeric := 0;
  v_ajuste_conciliacion numeric := 0;
  v_utilidad numeric := 0;
  v_cajas_abiertas int;
  v_cajas_faltantes int;
  v_ajustes_pendientes int;
  v_periodo_id uuid;
  v_comisiones jsonb;
begin
  v_rol := rol_actual();
  if v_rol is null then
    raise exception 'Tu usuario no tiene un perfil asignado. Contacta al administrador.';
  end if;
  if not es_central() then
    raise exception 'Solo gerencia/auditoría puede cerrar un período';
  end if;
  if p_fecha_fin < p_fecha_inicio then
    raise exception 'La fecha de fin no puede ser anterior a la fecha de inicio';
  end if;

  if exists(
    select 1 from periodos
    where tienda_codigo = p_tienda_codigo
      and fecha_inicio <= p_fecha_fin and fecha_fin >= p_fecha_inicio
  ) then
    raise exception 'Ya existe un período cerrado que se traslapa con este rango de fechas para esta tienda';
  end if;

  v_inicio := p_fecha_inicio;
  v_fin := p_fecha_fin + 1;

  select count(*) into v_cajas_abiertas
  from caja_diaria where tienda_codigo = p_tienda_codigo and fecha >= v_inicio and fecha < v_fin and estado <> 'cerrada';
  if v_cajas_abiertas > 0 then
    raise exception 'No se puede cerrar: hay % caja(s) sin cerrar en este período', v_cajas_abiertas;
  end if;

  select count(*) into v_cajas_faltantes
  from (
    select fecha from ventas where tienda_codigo = p_tienda_codigo and fecha >= v_inicio and fecha < v_fin
    union
    select fecha from gastos where tienda_codigo = p_tienda_codigo and fecha >= v_inicio and fecha < v_fin
  ) dias
  where not exists (
    select 1 from caja_diaria cd where cd.tienda_codigo = p_tienda_codigo and cd.fecha = dias.fecha and cd.estado = 'cerrada'
  );
  if v_cajas_faltantes > 0 then
    raise exception 'No se puede cerrar: hay % día(s) con ventas o gastos sin una caja cerrada', v_cajas_faltantes;
  end if;

  select count(*) into v_ajustes_pendientes
  from ajustes_inventario where tienda_codigo = p_tienda_codigo and estado = 'pendiente' and created_at >= v_inicio and created_at < v_fin;
  if v_ajustes_pendientes > 0 then
    raise exception 'No se puede cerrar: hay % ajuste(s) pendiente(s) de autorizar en este período', v_ajustes_pendientes;
  end if;

  select coalesce(sum(case
    when tipo in ('remision_entrada','traslado_entrada','reverso') then costo * cantidad
    when tipo in ('venta','traslado_salida') then -costo * cantidad
    when tipo = 'ajuste' then costo * cantidad
    else 0 end), 0)
  into v_inv_inicial
  from public.movimientos_tienda_lectura where tienda_codigo = p_tienda_codigo and created_at < v_inicio;

  select coalesce(sum(case
    when tipo in ('remision_entrada','traslado_entrada','reverso') then costo * cantidad
    when tipo in ('venta','traslado_salida') then -costo * cantidad
    when tipo = 'ajuste' then costo * cantidad
    else 0 end), 0)
  into v_inv_final
  from public.movimientos_tienda_lectura where tienda_codigo = p_tienda_codigo and created_at < v_fin;

  select coalesce(sum(total), 0) into v_ventas_totales
  from ventas where tienda_codigo = p_tienda_codigo and fecha >= v_inicio and fecha < v_fin and coalesce(anulada, false) = false;

  select coalesce(sum(vi.costo_tienda_congelado * vi.cantidad), 0) into v_costo_vendido
  from venta_items vi join ventas v on v.id = vi.venta_id
  where v.tienda_codigo = p_tienda_codigo and v.fecha >= v_inicio and v.fecha < v_fin and coalesce(v.anulada, false) = false;

  select coalesce(sum(g.monto), 0) into v_gastos_totales
  from gastos g join conceptos_gasto cg on cg.id = g.concepto_id
  where g.tienda_codigo = p_tienda_codigo and g.fecha >= v_inicio and g.fecha < v_fin
    and (cg.preautorizado or g.estado = 'aprobado');

  select coalesce(sum(-costo * cantidad), 0) into v_perdidas
  from public.movimientos_tienda_lectura where tienda_codigo = p_tienda_codigo and tipo = 'ajuste' and cantidad < 0 and created_at >= v_inicio and created_at < v_fin;

  select coalesce(sum(costo * cantidad), 0) into v_ganancias
  from public.movimientos_tienda_lectura where tienda_codigo = p_tienda_codigo and tipo = 'ajuste' and cantidad > 0 and created_at >= v_inicio and created_at < v_fin;

  select coalesce(sum(c.valor_real_financiera - c.valor_esperado_financiera), 0) into v_ajuste_conciliacion
  from creditos c join ventas v on v.id = c.venta_id
  where v.tienda_codigo = p_tienda_codigo and c.estado_conciliacion = 'conciliado'
    and (
      (v.fecha >= v_inicio and v.fecha < v_fin)
      or (v.fecha < v_inicio and c.conciliado_at >= v_inicio and c.conciliado_at < v_fin)
    );

  v_utilidad := v_ventas_totales - v_costo_vendido - v_gastos_totales - v_perdidas + v_ajuste_conciliacion;

  insert into periodos (
    tienda_codigo, fecha_inicio, fecha_fin, inventario_inicial, inventario_final, ventas_totales, costo_vendido,
    gastos_totales, perdidas_ajustes, ganancias_ajustes, ajuste_conciliacion, utilidad_neta, cerrado_por
  ) values (
    p_tienda_codigo, p_fecha_inicio, p_fecha_fin, v_inv_inicial, v_inv_final, v_ventas_totales, v_costo_vendido,
    v_gastos_totales, v_perdidas, v_ganancias, v_ajuste_conciliacion, v_utilidad, auth.uid()
  ) returning id into v_periodo_id;

  insert into comisiones (periodo_id, perfil_id, rol, porcentaje, base_ventas, monto)
  select v_periodo_id, p.id, 'admin_tienda', 10, null, round(v_utilidad * 0.10, 0)
  from perfiles p where p.rol = 'admin_tienda' and p.tienda_codigo = p_tienda_codigo and coalesce(p.activo, true);

  insert into comisiones (periodo_id, perfil_id, rol, porcentaje, base_ventas, monto)
  select v_periodo_id, p.id, 'asesor', 6, coalesce(sum(v.total), 0),
    round(v_utilidad * 0.06 * (coalesce(sum(v.total), 0) / nullif(v_ventas_totales, 0)), 0)
  from perfiles p
  join ventas v on v.vendedor = p.id and v.tienda_codigo = p_tienda_codigo and v.fecha >= v_inicio and v.fecha < v_fin and coalesce(v.anulada, false) = false
  where p.rol = 'asesor'
  group by p.id;

  select coalesce(jsonb_agg(jsonb_build_object('perfil_id', c.perfil_id, 'nombre', p.nombre, 'rol', c.rol, 'porcentaje', c.porcentaje, 'base_ventas', c.base_ventas, 'monto', c.monto)), '[]'::jsonb)
  into v_comisiones
  from comisiones c join perfiles p on p.id = c.perfil_id
  where c.periodo_id = v_periodo_id;

  return jsonb_build_object(
    'ok', true, 'periodo_id', v_periodo_id,
    'fecha_inicio', p_fecha_inicio, 'fecha_fin', p_fecha_fin, 'dias', (p_fecha_fin - p_fecha_inicio + 1),
    'inventario_inicial', v_inv_inicial, 'inventario_final', v_inv_final,
    'ventas_totales', v_ventas_totales, 'costo_vendido', v_costo_vendido,
    'gastos_totales', v_gastos_totales, 'perdidas_ajustes', v_perdidas, 'ganancias_ajustes', v_ganancias,
    'ajuste_conciliacion', v_ajuste_conciliacion,
    'utilidad_neta', v_utilidad, 'comisiones', v_comisiones
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.generar_presupuesto(p_mes date, p_pct_crecimiento numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rol text;
  v_inicio date;
  v_fin date;
  v_inicio_hist date;
  v_fin_hist date;
  v_tienda record;
  v_hist_creditos numeric;
  v_hist_uds_cel numeric;
  v_hist_uds_acc numeric;
  v_hist_utilidad numeric;
  v_hay_import boolean;
  v_meta_creditos_mes numeric;
  v_meta_uds_cel_mes numeric;
  v_meta_uds_acc_mes numeric;
  v_meta_utilidad_mes numeric;
  v_generado_desde text;
  v_tiendas_procesadas int := 0;
begin
  v_rol := rol_actual();
  if v_rol is null then raise exception 'Tu usuario no tiene un perfil asignado. Contacta al administrador.'; end if;
  if not es_central() then raise exception 'Solo gerencia o auditoría pueden generar presupuestos'; end if;
  if p_mes is null then raise exception 'Falta el mes'; end if;

  v_inicio := date_trunc('month', p_mes)::date;
  v_fin := (v_inicio + interval '1 month')::date;
  v_inicio_hist := (v_inicio - interval '1 year')::date;
  v_fin_hist := (v_fin - interval '1 year')::date;
  v_generado_desde := 'auto:+' || p_pct_crecimiento || '%';

  for v_tienda in select codigo from origenes where tipo = 'propia' and activo loop
    select exists(
      select 1 from historico_importado where tienda_codigo = v_tienda.codigo and fecha >= v_inicio_hist and fecha < v_fin_hist
    ) into v_hay_import;

    if v_hay_import then
      select coalesce(sum(creditos), 0), coalesce(sum(equipos_contado_cantidad), 0), coalesce(sum(accesorios_cantidad), 0), coalesce(sum(utilidad), 0)
      into v_hist_creditos, v_hist_uds_cel, v_hist_uds_acc, v_hist_utilidad
      from historico_importado
      where tienda_codigo = v_tienda.codigo and fecha >= v_inicio_hist and fecha < v_fin_hist;
    else
      select coalesce(count(*) filter (where v.tipo = 'credito'), 0),
             coalesce(count(*) filter (where v.tipo = 'contado' and exists (
               select 1 from venta_items vi join productos p on p.id = vi.producto_id
               where vi.venta_id = v.id and p.categoria = 'CELULAR'
             )), 0),
             coalesce(count(*) filter (where v.tipo = 'contado' and not exists (
               select 1 from venta_items vi join productos p on p.id = vi.producto_id
               where vi.venta_id = v.id and p.categoria = 'CELULAR'
             )), 0),
             coalesce(sum(vi_sum.utilidad), 0)
      into v_hist_creditos, v_hist_uds_cel, v_hist_uds_acc, v_hist_utilidad
      from ventas v
      left join lateral (select sum((vi.precio_venta-vi.costo_tienda_congelado)*vi.cantidad) as utilidad from venta_items vi where vi.venta_id = v.id) vi_sum on true
      where v.tienda_codigo = v_tienda.codigo and v.fecha >= v_inicio_hist and v.fecha < v_fin_hist and coalesce(v.anulada, false) = false;
    end if;

    v_meta_creditos_mes := round(coalesce(nullif(v_hist_creditos, 0), 25) * (1 + p_pct_crecimiento / 100.0));
    v_meta_uds_cel_mes := round(v_hist_uds_cel * (1 + p_pct_crecimiento / 100.0));
    v_meta_uds_acc_mes := round(v_hist_uds_acc * (1 + p_pct_crecimiento / 100.0));
    v_meta_utilidad_mes := round(v_hist_utilidad * (1 + p_pct_crecimiento / 100.0));

    insert into presupuestos (tienda_codigo, fecha, meta_creditos, meta_uds_cel, meta_uds_acc, meta_utilidad, generado_desde)
    select
      v_tienda.codigo, calc.d,
      calc.base_creditos + (case when calc.rn = 1 then (v_meta_creditos_mes - calc.suma_creditos) else 0 end),
      calc.base_uds_cel + (case when calc.rn = 1 then (v_meta_uds_cel_mes - calc.suma_uds_cel) else 0 end),
      calc.base_uds_acc + (case when calc.rn = 1 then (v_meta_uds_acc_mes - calc.suma_uds_acc) else 0 end),
      calc.base_utilidad + (case when calc.rn = 1 then (v_meta_utilidad_mes - calc.suma_utilidad) else 0 end),
      v_generado_desde
    from (
      select w.d, w.peso,
        round(v_meta_creditos_mes * w.peso / w.suma_pesos) as base_creditos,
        round(v_meta_uds_cel_mes * w.peso / w.suma_pesos) as base_uds_cel,
        round(v_meta_uds_acc_mes * w.peso / w.suma_pesos) as base_uds_acc,
        round(v_meta_utilidad_mes * w.peso / w.suma_pesos) as base_utilidad,
        row_number() over (order by w.peso desc, w.d) as rn,
        sum(round(v_meta_creditos_mes * w.peso / w.suma_pesos)) over () as suma_creditos,
        sum(round(v_meta_uds_cel_mes * w.peso / w.suma_pesos)) over () as suma_uds_cel,
        sum(round(v_meta_uds_acc_mes * w.peso / w.suma_pesos)) over () as suma_uds_acc,
        sum(round(v_meta_utilidad_mes * w.peso / w.suma_pesos)) over () as suma_utilidad
      from (
        select d::date as d,
          (case extract(dow from d) when 1 then 1.3 when 2 then 1.2 when 0 then 0.5 else 1.0 end)
          * (case when extract(day from d) in (1, 15) then 1.5 else 1.0 end) as peso,
          sum(
            (case extract(dow from d) when 1 then 1.3 when 2 then 1.2 when 0 then 0.5 else 1.0 end)
            * (case when extract(day from d) in (1, 15) then 1.5 else 1.0 end)
          ) over () as suma_pesos
        from generate_series(v_inicio, v_fin - interval '1 day', interval '1 day') d
      ) w
    ) calc
    on conflict (tienda_codigo, fecha) do update set
      meta_creditos = excluded.meta_creditos,
      meta_uds_cel = excluded.meta_uds_cel,
      meta_uds_acc = excluded.meta_uds_acc,
      meta_utilidad = excluded.meta_utilidad,
      generado_desde = excluded.generado_desde
    where presupuestos.generado_desde is distinct from 'manual';

    v_tiendas_procesadas := v_tiendas_procesadas + 1;
  end loop;

  return jsonb_build_object('ok', true, 'tiendas', v_tiendas_procesadas, 'mes', v_inicio);
end;
$function$
;
