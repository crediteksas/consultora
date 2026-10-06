-- Retail: la utilidad se fija entre dos cortes físicos, nunca por días completos.
-- El primer tramo inicia en origenes.inventario_control_desde. No mueve caja,
-- existencias, cartera ni pagos; conserva un snapshot auditado de la liquidación.
begin;

create table inventario_control.cierres_utilidad (
  id uuid primary key default gen_random_uuid(),
  corte_id uuid not null unique references inventario_control.cortes(id),
  corte_inicio_id uuid references inventario_control.cortes(id),
  tienda_codigo text not null references public.origenes(codigo),
  inicio_at timestamptz not null,
  fin_at timestamptz not null,
  ventas_totales numeric not null,
  costo_vendido numeric not null,
  gastos_totales numeric not null,
  perdidas_ajustes numeric not null,
  ganancias_ajustes numeric not null,
  ajuste_conciliacion numeric not null,
  utilidad_neta numeric not null,
  inventario_inicial numeric,
  inventario_final numeric not null,
  detalle jsonb not null,
  cerrado_por uuid not null references public.perfiles(id),
  cerrado_at timestamptz not null default clock_timestamp(),
  constraint cierres_utilidad_tramo_valido check (fin_at > inicio_at),
  constraint cierres_utilidad_unico_fin unique (tienda_codigo, fin_at)
);
create index cierres_utilidad_tienda_fin on inventario_control.cierres_utilidad(tienda_codigo, fin_at desc);
alter table inventario_control.cierres_utilidad enable row level security;
revoke all on inventario_control.cierres_utilidad from public, anon, authenticated;

create function inventario_control.cierre_utilidad_api(
  p_accion text, p_corte_id uuid default null, p_huella text default null
) returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  v_perfil public.perfiles%rowtype;
  v_corte inventario_control.cortes%rowtype;
  v_origen public.origenes%rowtype;
  v_anterior inventario_control.cierres_utilidad%rowtype;
  v_existente inventario_control.cierres_utilidad%rowtype;
  v_inicio timestamptz;
  v_fin timestamptz;
  v_inicio_dia date;
  v_fin_dia date;
  v_ventas numeric := 0;
  v_costo numeric := 0;
  v_gastos numeric := 0;
  v_perdidas numeric := 0;
  v_no_conformes_antes numeric := 0;
  v_no_conformes_corte numeric := 0;
  v_ganancias numeric := 0;
  v_conciliacion numeric := 0;
  v_inv_final numeric := 0;
  v_inv_inicial numeric;
  v_ventas_count integer := 0;
  v_gastos_count integer := 0;
  v_sin_costo integer := 0;
  v_ventas_sin_items integer := 0;
  v_fechas_venta_inconsistentes integer := 0;
  v_gastos_limite_ambiguos integer := 0;
  v_gastos_pendientes integer := 0;
  v_corte_intermedio uuid;
  v_bloqueos text[] := array[]::text[];
  v_resultado jsonb;
  v_id uuid;
begin
  select * into v_perfil from public.perfiles
    where id=auth.uid() and activo=true and rol in ('gerencia','auditoria');
  if not found then raise exception 'Solo Gestión o Gerencia puede consultar cierres de utilidad'; end if;
  if p_accion is null or p_accion not in ('listar','vista','cerrar') then
    raise exception 'Acción de cierre no reconocida';
  end if;
  if p_accion='listar' then
    return jsonb_build_object('cortes',(
      select coalesce(jsonb_agg(to_jsonb(q) order by q.corte_at desc),'[]'::jsonb)
      from (
        select c.id,c.tienda_codigo,c.tienda_nombre,c.corte_at,c.estado,
          cu.id cierre_id,cu.utilidad_neta utilidad_cerrada,cu.cerrado_at
        from inventario_control.cortes c
        join public.origenes o on o.codigo=c.tienda_codigo and o.tipo='propia' and o.activo
        left join inventario_control.cierres_utilidad cu on cu.corte_id=c.id
        where c.base_conteo='corte_fijo'
          and not coalesce((c.revision_fuente->>'solo_comparativo')::boolean,false)
        order by c.corte_at desc
      ) q));
  end if;
  if p_corte_id is null then raise exception 'Selecciona un corte de inventario'; end if;
  select * into v_corte from inventario_control.cortes where id=p_corte_id;
  if not found then raise exception 'Corte de inventario no encontrado'; end if;
  select * into v_origen from public.origenes where codigo=v_corte.tienda_codigo and tipo='propia';
  if not found or v_origen.inventario_control_desde is null then
    raise exception 'La tienda no tiene fecha comprobada de inicio de inventario';
  end if;
  if v_corte.base_conteo is distinct from 'corte_fijo'
    or coalesce((v_corte.revision_fuente->>'solo_comparativo')::boolean,false) then
    raise exception 'Este registro no es un corte físico apto para utilidad';
  end if;
  if p_accion='cerrar' then
    if v_perfil.rol<>'gerencia' then raise exception 'Solo Gerencia puede cerrar la utilidad'; end if;
    perform pg_advisory_xact_lock(hashtextextended('cierre_utilidad:'||v_corte.tienda_codigo,0));
  end if;
  select * into v_existente from inventario_control.cierres_utilidad where corte_id=p_corte_id;
  if found then
    return v_existente.detalle || jsonb_build_object(
      'cerrado',true,'cierre_id',v_existente.id,'cerrado_at',v_existente.cerrado_at,
      'cerrado_por',v_existente.cerrado_por);
  end if;
  select * into v_anterior from inventario_control.cierres_utilidad
    where tienda_codigo=v_corte.tienda_codigo order by fin_at desc limit 1;
  v_inicio:=coalesce(v_anterior.fin_at,v_origen.inventario_control_desde);
  v_fin:=v_corte.corte_at;
  if v_fin<=v_inicio then raise exception 'El corte no es posterior al inicio del tramo pendiente'; end if;
  v_inicio_dia:=(v_inicio at time zone 'America/Bogota')::date;
  v_fin_dia:=(v_fin at time zone 'America/Bogota')::date;
  if v_corte.estado not in ('aplicado','sin_diferencias') or v_corte.autorizado_at is null then
    v_bloqueos:=array_append(v_bloqueos,'Falta que Mayte u Óscar revisen y aprueben el conteo físico.');
  end if;
  select c.id into v_corte_intermedio from inventario_control.cortes c
    where c.tienda_codigo=v_corte.tienda_codigo and c.corte_at>v_inicio and c.corte_at<v_fin
      and c.estado<>'rechazado' and c.base_conteo='corte_fijo'
      and not coalesce((c.revision_fuente->>'solo_comparativo')::boolean,false)
    order by c.corte_at limit 1;
  if v_corte_intermedio is not null then
    v_bloqueos:=array_append(v_bloqueos,'Hay un corte anterior sin cierre; los cierres deben seguir el orden de los inventarios.');
  end if;
  if exists(select 1 from public.periodos p where p.tienda_codigo=v_corte.tienda_codigo
    and p.fecha_inicio<=v_fin_dia and p.fecha_fin>=v_inicio_dia) then
    v_bloqueos:=array_append(v_bloqueos,'Existe un cierre de utilidad anterior por fechas que se cruza con este corte; requiere conciliación antes de cerrar.');
  end if;

  select coalesce(sum(v.total),0),count(*) into v_ventas,v_ventas_count
    from public.ventas v where v.tienda_codigo=v_corte.tienda_codigo
      and v.created_at>=v_inicio and v.created_at<v_fin and not coalesce(v.anulada,false);
  select coalesce(sum(vi.costo_tienda_congelado*vi.cantidad),0),
    count(*) filter(where vi.costo_tienda_congelado is null or vi.costo_tienda_congelado<=0
      or vi.cantidad is null or vi.cantidad<=0)
    into v_costo,v_sin_costo
    from public.venta_items vi join public.ventas v on v.id=vi.venta_id
    where v.tienda_codigo=v_corte.tienda_codigo
      and v.created_at>=v_inicio and v.created_at<v_fin and not coalesce(v.anulada,false);
  if v_sin_costo>0 then v_bloqueos:=array_append(v_bloqueos,'Hay artículos vendidos sin costo de tienda válido.'); end if;
  select count(*) into v_ventas_sin_items from public.ventas v
    where v.tienda_codigo=v_corte.tienda_codigo and not coalesce(v.anulada,false)
      and v.created_at>=v_inicio and v.created_at<v_fin
      and not exists(select 1 from public.venta_items vi where vi.venta_id=v.id);
  if v_ventas_sin_items>0 then
    v_bloqueos:=array_append(v_bloqueos,'Hay ventas sin artículos detallados; no se puede verificar su costo.');
  end if;
  select count(*) into v_fechas_venta_inconsistentes from public.ventas v
    where v.tienda_codigo=v_corte.tienda_codigo and not coalesce(v.anulada,false)
      and v.created_at>=v_inicio and v.created_at<v_fin
      and v.fecha is distinct from (v.created_at at time zone 'America/Bogota')::date;
  if v_fechas_venta_inconsistentes>0 then
    v_bloqueos:=array_append(v_bloqueos,'Hay ventas cuya fecha comercial no coincide con el registro horario; requieren conciliación.');
  end if;

  -- Gastos: la fecha comercial gobierna los días completos; en el día de un
  -- corte intradía solo se usa la hora de registro si coincide con esa fecha.
  select coalesce(sum(g.monto),0),count(*) into v_gastos,v_gastos_count
    from public.gastos g
    where g.tienda_codigo=v_corte.tienda_codigo and g.estado='aprobado'
      and g.fecha between v_inicio_dia and v_fin_dia
      and (g.fecha>v_inicio_dia or (v_inicio at time zone 'America/Bogota')::time='00:00:00'::time
           or (g.created_at>=v_inicio and (g.created_at at time zone 'America/Bogota')::date=g.fecha))
      and (g.fecha<v_fin_dia or (g.created_at<v_fin and (g.created_at at time zone 'America/Bogota')::date=g.fecha));
  select count(*) into v_gastos_limite_ambiguos from public.gastos g
    where g.tienda_codigo=v_corte.tienda_codigo and g.estado='aprobado'
      and g.fecha in (v_inicio_dia,v_fin_dia)
      and g.fecha is distinct from (g.created_at at time zone 'America/Bogota')::date
      and (g.fecha=v_fin_dia or (g.fecha=v_inicio_dia and (v_inicio at time zone 'America/Bogota')::time<>'00:00:00'::time));
  if v_gastos_limite_ambiguos>0 then
    v_bloqueos:=array_append(v_bloqueos,'Hay gastos fechados el día del corte pero registrados otro día; falta ubicar su tramo.');
  end if;
  select count(*) into v_gastos_pendientes from public.gastos g
    where g.tienda_codigo=v_corte.tienda_codigo and g.estado='pendiente'
      and g.fecha between v_inicio_dia and v_fin_dia
      and (g.fecha>v_inicio_dia or (v_inicio at time zone 'America/Bogota')::time='00:00:00'::time
           or (g.created_at>=v_inicio and (g.created_at at time zone 'America/Bogota')::date=g.fecha))
      and (g.fecha<v_fin_dia or (g.created_at<v_fin and (g.created_at at time zone 'America/Bogota')::date=g.fecha));
  if v_gastos_pendientes>0 then
    v_bloqueos:=array_append(v_bloqueos,'Hay gastos pendientes de decidir en este tramo.');
  end if;

  -- Antes de aplicar, valor_ajuste aún es NULL: mostrar el resultado provisional
  -- con el delta al costo congelado, sin modificar existencias ni asientos.
  select coalesce(sum(-coalesce(l.valor_ajuste,l.diferencia*l.costo_tienda)),0) into v_perdidas
    from inventario_control.lineas l where l.corte_id=p_corte_id and l.diferencia<0;
  -- Las bajas previas al corte son gasto de inventario sin salida de efectivo.
  -- Las vinculadas a este corte ya están en valor_ajuste: identificarlas para
  -- el desglose, pero nunca restarlas una segunda vez.
  if to_regclass('inventario_control.no_conformes') is not null then
    select coalesce(sum(n.cantidad*n.costo_tienda),0) into v_no_conformes_antes
      from inventario_control.no_conformes n
      where n.tienda_codigo=v_corte.tienda_codigo and n.corte_id is null
        and n.estado='separado_pendiente_destino'
        and n.autorizado_at>=v_inicio and n.autorizado_at<v_fin;
    select coalesce(sum(n.cantidad*n.costo_tienda),0) into v_no_conformes_corte
      from inventario_control.no_conformes n
      where n.corte_id=p_corte_id and n.estado='separado_pendiente_destino';
    v_perdidas:=v_perdidas+v_no_conformes_antes;
  end if;
  select coalesce(sum(coalesce(l.valor_ajuste,l.diferencia*l.costo_tienda)),0) into v_ganancias
    from inventario_control.lineas l where l.corte_id=p_corte_id and l.diferencia>0;
  select coalesce(sum(c.valor_real_financiera-c.valor_esperado_financiera),0)
    into v_conciliacion from public.creditos c join public.ventas v on v.id=c.venta_id
    where v.tienda_codigo=v_corte.tienda_codigo and not coalesce(v.anulada,false)
      and c.estado_conciliacion='conciliado'
      and c.conciliado_at>=v_inicio and c.conciliado_at<v_fin;
  select coalesce(sum(l.cantidad_fisica*l.costo_tienda),0) into v_inv_final
    from inventario_control.lineas l where l.corte_id=p_corte_id;
  if exists(
    select 1 from inventario_control.lineas l where l.corte_id=p_corte_id
      and (l.cantidad_fisica>0 or coalesce(l.diferencia,0)<>0)
      and (l.costo_tienda is null or l.costo_tienda<=0)
  ) then v_bloqueos:=array_append(v_bloqueos,'El corte tiene existencias sin costo de tienda válido.'); end if;
  v_inv_inicial:=v_anterior.inventario_final;
  v_resultado:=jsonb_build_object(
    'corte_id',p_corte_id,'tienda_codigo',v_corte.tienda_codigo,'tienda_nombre',v_corte.tienda_nombre,
    'corte_estado',v_corte.estado,'inicio_at',v_inicio,'fin_at',v_fin,
    'corte_inicio_id',v_anterior.corte_id,'origen_inicio',case when v_anterior.id is null then 'carga_inicial' else 'corte_anterior' end,
    'ventas_totales',v_ventas,'ventas_count',v_ventas_count,'costo_vendido',v_costo,
    'gastos_totales',v_gastos,'gastos_count',v_gastos_count,'perdidas_ajustes',v_perdidas,
    'gastos_inventario_no_monetarios',v_no_conformes_antes+v_no_conformes_corte,
    'ganancias_ajustes',v_ganancias,'ajuste_conciliacion',v_conciliacion,
    'utilidad_neta',v_ventas-v_costo-v_gastos-v_perdidas+v_ganancias+v_conciliacion,
    'inventario_inicial',v_inv_inicial,'inventario_final',v_inv_final,
    'fechas_venta_inconsistentes',v_fechas_venta_inconsistentes,
    'ventas_sin_items',v_ventas_sin_items,
    'gastos_limite_ambiguos',v_gastos_limite_ambiguos,'bloqueos',to_jsonb(v_bloqueos),
    'listo',cardinality(v_bloqueos)=0,'cerrado',false);
  v_resultado:=v_resultado||jsonb_build_object('huella',md5(v_resultado::text));
  if p_accion='vista' then return v_resultado; end if;
  if p_accion is distinct from 'cerrar' or v_perfil.rol<>'gerencia' then
    raise exception 'Solo Gerencia puede cerrar la utilidad';
  end if;
  if cardinality(v_bloqueos)>0 then raise exception 'El cierre no está listo: %',array_to_string(v_bloqueos,' '); end if;
  if coalesce(p_huella,'')<>v_resultado->>'huella' then
    raise exception 'La liquidación cambió desde la vista previa. Actualiza y revísala antes de confirmar';
  end if;
  insert into inventario_control.cierres_utilidad(
    corte_id,corte_inicio_id,tienda_codigo,inicio_at,fin_at,ventas_totales,costo_vendido,
    gastos_totales,perdidas_ajustes,ganancias_ajustes,ajuste_conciliacion,utilidad_neta,
    inventario_inicial,inventario_final,detalle,cerrado_por
  ) values (
    p_corte_id,v_anterior.corte_id,v_corte.tienda_codigo,v_inicio,v_fin,v_ventas,v_costo,
    v_gastos,v_perdidas,v_ganancias,v_conciliacion,
    v_ventas-v_costo-v_gastos-v_perdidas+v_ganancias+v_conciliacion,v_inv_inicial,v_inv_final,
    v_resultado,v_perfil.id
  ) returning id into v_id;
  return v_resultado||jsonb_build_object('cerrado',true,'cierre_id',v_id,
    'cerrado_at',(select cu.cerrado_at from inventario_control.cierres_utilidad cu where cu.id=v_id),
    'cerrado_por',v_perfil.id);
end;
$fn$;
revoke all on function inventario_control.cierre_utilidad_api(text,uuid,text) from public,anon;
grant execute on function inventario_control.cierre_utilidad_api(text,uuid,text) to authenticated;

create function public.cierre_utilidad_retail(p_accion text,p_corte_id uuid default null,p_huella text default null)
returns jsonb language sql security invoker set search_path='' as $fn$
  select inventario_control.cierre_utilidad_api(p_accion,p_corte_id,p_huella);
$fn$;
revoke all on function public.cierre_utilidad_retail(text,uuid,text) from public,anon;
grant execute on function public.cierre_utilidad_retail(text,uuid,text) to authenticated;

-- El cierre antiguo no distingue las 08:54 del resto del día; impedir que
-- congele ventas posteriores al corte en tiendas con inventario controlado.
do $migration$
declare v_definition text;
  v_guard text := $guard$
  if exists(select 1 from public.origenes o where o.codigo=p_tienda_codigo
    and o.tipo='propia' and (o.inventario_control_activo or o.inventario_control_desde is not null)) then
    raise exception 'Retail cierra utilidad desde el corte físico aprobado, no por fecha completa';
  end if;$guard$;
begin
  v_definition:=pg_get_functiondef('public.cerrar_periodo(text,date,date)'::regprocedure);
  if regexp_count(v_definition,'if not es_central\(\) then')<>1
    or position('p_tienda_codigo text' in v_definition)=0
    or position(v_guard in v_definition)>0 then
    raise exception 'La función de cierre por fechas cambió; revisar antes de protegerla';
  end if;
  v_definition:=replace(v_definition,'if not es_central() then',v_guard||E'\n  if not es_central() then');
  execute v_definition;
end;
$migration$;

notify pgrst,'reload schema';
commit;
