-- KORA-2026-000072: revisar el retiro anterior desde el inventario que le corresponde.
-- No registra retiros/aportes ni cambia ventas, saldos, caja o períodos históricos.
begin;
create table inventario_control.socios_retiros_revisiones (
 id uuid primary key,
 corte_id uuid not null references inventario_control.cortes(id),
 retiro_id uuid not null references public.financial_entries(id),
 huella_fuente text not null check(huella_fuente ~ '^[a-f0-9]{32}$'),
 fuente jsonb not null,
 decision text not null check(decision in ('anterior','este_corte')),
 motivo text not null check(length(btrim(motivo)) between 12 and 2000),
 solicitud jsonb not null,
 validado_por uuid not null references public.perfiles(id),
 validado_at timestamptz not null default clock_timestamp(),
 unique(corte_id,retiro_id,huella_fuente)
);
alter table inventario_control.socios_retiros_revisiones enable row level security;
revoke all on inventario_control.socios_retiros_revisiones from public,anon,authenticated,service_role;
create trigger socios_retiros_revisiones_inmutable before update or delete on inventario_control.socios_retiros_revisiones
 for each row execute function inventario_control.socios_inmutable();

create function inventario_control.socios_retiro_fuente(p_retiro public.financial_entries,p_tienda text) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare fila jsonb; n integer;
begin
 if p_retiro.entry_type is distinct from 'retiro_utilidad' or p_retiro.business_unit is distinct from 'retail'
  or p_retiro.status is null or p_retiro.status not in ('pendiente_aprobacion','aprobado','pagado')
  or p_retiro.amount is null or p_retiro.amount<=0 or p_retiro.amount::text !~ '^[0-9]+(\.[0-9]+)?$'
  or p_retiro.retail_funding->>'inventory_operation_id' is not null
  or jsonb_typeof(p_retiro.retail_funding->'request'->'stores') is distinct from 'array' then return null;end if;
 select count(*) into n from jsonb_array_elements(p_retiro.retail_funding->'request'->'stores') a where a->>'store'=p_tienda;
 if n<>1 then return null;end if;
 select a into fila from jsonb_array_elements(p_retiro.retail_funding->'request'->'stores') a where a->>'store'=p_tienda;
 if (fila->>'amount') is null or (fila->>'amount') !~ '^[0-9]+(\.[0-9]{1,2})?$' then return null;end if;
 if (fila->>'amount')::numeric<=0 or (fila->>'amount')::numeric>p_retiro.amount
  or p_retiro.source_period_from>p_retiro.source_period_to then return null;end if;
 -- No incluir filas de otras tiendas ni el total multitienda en esta huella.
 return jsonb_build_object('retiro_id',p_retiro.id,'tienda_codigo',p_tienda,'monto',(fila->>'amount')::numeric,
  'estado',p_retiro.status,'periodo_desde',p_retiro.source_period_from,'periodo_hasta',p_retiro.source_period_to);
end $$;
revoke all on function inventario_control.socios_retiro_fuente(public.financial_entries,text) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION inventario_control.cierre_utilidad_api(p_accion text, p_corte_id uuid DEFAULT NULL::uuid, p_huella text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_perfil public.perfiles%rowtype;
  v_corte inventario_control.cortes%rowtype;
  v_corte_anterior inventario_control.cortes%rowtype;
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
  v_fechas_venta_limite integer := 0;
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
  v_fin:=v_corte.corte_at;
  select * into v_corte_anterior from inventario_control.cortes c
    where c.tienda_codigo=v_corte.tienda_codigo and c.corte_at<v_fin
      and c.corte_at>=v_origen.inventario_control_desde
      and c.estado in ('aplicado','sin_diferencias') and c.autorizado_at is not null
      and c.base_conteo='corte_fijo'
      and not coalesce((c.revision_fuente->>'solo_comparativo')::boolean,false)
    order by c.corte_at desc,c.id desc limit 1;
  select * into v_anterior from inventario_control.cierres_utilidad
    where corte_id=v_corte_anterior.id;
  v_inicio:=coalesce(v_corte_anterior.corte_at,v_origen.inventario_control_desde);
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
  select count(*),count(*) filter(where v.fecha is null or v.fecha<=v_inicio_dia or v.fecha>=v_fin_dia)
    into v_fechas_venta_inconsistentes,v_fechas_venta_limite from public.ventas v
    where v.tienda_codigo=v_corte.tienda_codigo and not coalesce(v.anulada,false)
      and v.created_at>=v_inicio and v.created_at<v_fin
      and v.fecha is distinct from (v.created_at at time zone 'America/Bogota')::date;
  if v_fechas_venta_limite>0 then
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
  if v_corte_anterior.id is not null and v_anterior.id is null then
    select case when bool_or(l.cantidad_fisica is null or
      (l.cantidad_fisica>0 and (l.costo_tienda is null or l.costo_tienda<=0))) then null
      else coalesce(sum(l.cantidad_fisica*l.costo_tienda),0) end into v_inv_inicial
      from inventario_control.lineas l where l.corte_id=v_corte_anterior.id;
  end if;
  v_resultado:=jsonb_build_object(
    'corte_id',p_corte_id,'tienda_codigo',v_corte.tienda_codigo,'tienda_nombre',v_corte.tienda_nombre,
    'corte_estado',v_corte.estado,'inicio_at',v_inicio,'fin_at',v_fin,
    'corte_inicio_id',v_corte_anterior.id,'origen_inicio',case when v_corte_anterior.id is null then 'carga_inicial' else 'corte_anterior' end,
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
  -- Solo los casos antes bloqueados ganan un aviso: los resultados ya válidos
  -- mantienen exactamente su JSON/huella; cierres guardados se retornan arriba.
  if v_fechas_venta_inconsistentes>v_fechas_venta_limite then
    v_resultado:=v_resultado||jsonb_build_object('avisos',jsonb_build_array(
      'Hay ventas con distinta fecha de registro; ambas fechas quedan dentro de este inventario y no cambian el período calculado.'));
  end if;
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
    p_corte_id,v_corte_anterior.id,v_corte.tienda_codigo,v_inicio,v_fin,v_ventas,v_costo,
    v_gastos,v_perdidas,v_ganancias,v_conciliacion,
    v_ventas-v_costo-v_gastos-v_perdidas+v_ganancias+v_conciliacion,v_inv_inicial,v_inv_final,
    v_resultado,v_perfil.id
  ) returning id into v_id;
  return v_resultado||jsonb_build_object('cerrado',true,'cierre_id',v_id,
    'cerrado_at',(select cu.cerrado_at from inventario_control.cierres_utilidad cu where cu.id=v_id),
    'cerrado_por',v_perfil.id);
end;
$function$;

CREATE OR REPLACE FUNCTION inventario_control.socios_resultado(p_corte uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare c inventario_control.cortes%rowtype; d jsonb; fijado jsonb; grupo text; grupo_fijado text;
  usado numeric; cubierto numeric; antiguo numeric:=0; ambiguo boolean:=false; e public.financial_entries%rowtype; a jsonb;
  inicio date; fin date; fuente_retiro jsonb; revision_retiro text;
begin
  select * into c from inventario_control.cortes where id=p_corte;
  if not found or c.estado not in ('aplicado','sin_diferencias') or c.autorizado_at is null
    or c.base_conteo<>'corte_fijo' or coalesce((c.revision_fuente->>'solo_comparativo')::boolean,false)
    or not exists(select 1 from public.origenes o where o.codigo=c.tienda_codigo and o.tipo='propia' and o.activo
      and (o.inventario_control_activo or o.inventario_control_desde is not null)) then
    raise exception 'Selecciona un inventario físico cerrado y autorizado de una tienda propia activa';
  end if;
  select g.grupo into grupo from inventario_control.socios_grupos_tienda g where g.tienda_codigo=c.tienda_codigo;
  if grupo is null then raise exception 'La tienda no tiene grupo de socios autorizado'; end if;
  d:=inventario_control.cierre_utilidad_api('vista',p_corte,null);
  if d is null or coalesce(d->>'utilidad_neta','') !~ '^-?[0-9]+(\.[0-9]+)?$'
    or nullif(d->>'huella','') is null or nullif(d->>'inicio_at','') is null
    or (d->>'corte_id')::uuid is distinct from p_corte or d->>'tienda_codigo' is distinct from c.tienda_codigo
    or (d->>'fin_at')::timestamptz is distinct from c.corte_at then
    raise exception 'El resultado económico del inventario está incompleto o no corresponde al corte';
  end if;
  select r.detalle,r.grupo into fijado,grupo_fijado from inventario_control.socios_resultados r where r.corte_id=p_corte;
  if fijado is not null and (fijado->>'huella' is distinct from d->>'huella' or grupo_fijado is distinct from grupo) then
    d:=d||jsonb_build_object('listo',false,'bloqueos',coalesce(d->'bloqueos','[]'::jsonb)||jsonb_build_array('El resultado cambió después de una liquidación; requiere revisión, no se libera nuevamente el importe.'));
  end if;
  inicio:=(nullif(d->>'inicio_at','')::timestamptz at time zone 'America/Bogota')::date;
  fin:=(c.corte_at at time zone 'America/Bogota')::date;
  for e in select * from public.financial_entries f where f.entry_type='retiro_utilidad' and f.business_unit='retail'
    and f.status in ('pendiente_aprobacion','aprobado','pagado')
    and f.retail_funding->>'inventory_operation_id' is null
    and (f.source_period_from is null or f.source_period_to is null or (f.source_period_from<=fin and f.source_period_to>=inicio)) loop
    if (case when jsonb_typeof(e.retail_funding->'request'->'stores')='array'
      then jsonb_array_length(e.retail_funding->'request'->'stores') else 0 end)=0 then
      ambiguo:=true;
    else
      if exists(select 1 from jsonb_array_elements(e.retail_funding->'request'->'stores') z where z->>'store'=c.tienda_codigo) then
        fuente_retiro:=inventario_control.socios_retiro_fuente(e,c.tienda_codigo);
        if fuente_retiro is null then ambiguo:=true;continue;end if;
      end if;
      for a in select value from jsonb_array_elements(e.retail_funding->'request'->'stores') where value->>'store'=c.tienda_codigo loop
        select r.decision into revision_retiro from inventario_control.socios_retiros_revisiones r
          where r.corte_id=p_corte and r.retiro_id=e.id and r.huella_fuente=md5(fuente_retiro::text);
        if found then
          if revision_retiro='este_corte' then antiguo:=antiguo+(a->>'amount')::numeric;end if;
          continue;
        end if;
        if e.source_period_from is null or e.source_period_to is null or e.source_period_from<inicio or e.source_period_to>fin
          or exists(select 1 from inventario_control.cortes otro where otro.tienda_codigo=c.tienda_codigo and otro.id<>c.id
            and otro.estado in ('aplicado','sin_diferencias') and otro.autorizado_at is not null and otro.base_conteo='corte_fijo'
            and not coalesce((otro.revision_fuente->>'solo_comparativo')::boolean,false)
            and (otro.corte_at at time zone 'America/Bogota')::date between e.source_period_from and e.source_period_to)
          or (a->>'amount') is null or (a->>'amount') !~ '^[0-9]+(\.[0-9]{1,2})?$' then ambiguo:=true;
        else antiguo:=antiguo+(a->>'amount')::numeric; end if;
      end loop;
    end if;
  end loop;
  if ambiguo then d:=d||jsonb_build_object('listo',false,'bloqueos',coalesce(d->'bloqueos','[]'::jsonb)||jsonb_build_array('Hay retiros anteriores cuyo período o distribución debe conciliarse con este corte.')); end if;
  select coalesce(sum(o.monto),0) into usado from inventario_control.socios_operaciones o where o.corte_id=p_corte;
  select coalesce(sum(x.monto),0) into cubierto from inventario_control.socios_destinos x where x.corte_destino_id=p_corte;
  return d||jsonb_build_object('grupo',grupo,'utilidad_neta',round((d->>'utilidad_neta')::numeric,2),
    'retirado',usado,'retiros_anteriores',antiguo,
    'disponible',greatest(round((d->>'utilidad_neta')::numeric,2)-usado-antiguo,0),
    'perdida_cubierta',cubierto,'perdida_pendiente',greatest(-round((d->>'utilidad_neta')::numeric,2)-cubierto,0));
end $function$;

CREATE OR REPLACE FUNCTION inventario_control.socios_api(p_accion text, p_datos jsonb, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare mes text; c record; cortes jsonb:='[]'; d jsonb; fuente jsonb; destino jsonb; a jsonb;
  ids uuid[]; id_corte uuid; id_destino uuid; origen inventario_control.cortes%rowtype;
  op inventario_control.socios_operaciones%rowtype; monto numeric; total numeric:=0; fecha date;
  financiero uuid:=gen_random_uuid(); caja uuid:=gen_random_uuid(); pago jsonb; cc bigint; orden integer:=0;
  disponible numeric; reservado numeric; motivo text; beneficiario text; factura public.facturas_proveedor%rowtype;
begin
  if auth.uid() is null or not public.es_controlador_financiero() then raise exception 'Solo Mayte u Óscar pueden gestionar esta liquidación'; end if;
  if p_accion='consultar' then
    mes:=p_datos->>'mes';
    if mes is null or mes !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'Selecciona el mes del inventario'; end if;
    for c in select x.* from inventario_control.cortes x
      join public.origenes o on o.codigo=x.tienda_codigo and o.tipo='propia' and o.activo
      where x.corte_at>=((mes||'-01')::date::timestamp at time zone 'America/Bogota')
        and x.corte_at<(((mes||'-01')::date+interval '1 month')::timestamp at time zone 'America/Bogota')
        and x.estado in ('aplicado','sin_diferencias') and x.autorizado_at is not null
        and x.base_conteo='corte_fijo' and not coalesce((x.revision_fuente->>'solo_comparativo')::boolean,false)
      order by x.tienda_codigo,x.corte_at desc,x.id desc loop
      begin d:=inventario_control.socios_resultado(c.id);
      exception when others then d:=jsonb_build_object('corte_id',c.id,'tienda_codigo',c.tienda_codigo,'tienda_nombre',c.tienda_nombre,
        'fin_at',c.corte_at,'listo',false,'bloqueos',jsonb_build_array(sqlerrm)); end;
      cortes:=cortes||jsonb_build_array(d);
    end loop;
    return jsonb_build_object('cortes',cortes,'operaciones',coalesce((
      select jsonb_agg(to_jsonb(o)||jsonb_build_object('tienda',x.tienda_nombre,'destinos',(
        select jsonb_agg(to_jsonb(z)||jsonb_build_object('tienda_destino',y.tienda_nombre,'proveedor',pr.nombre,'factura',f.numero) order by z.orden)
          from inventario_control.socios_destinos z left join inventario_control.cortes y on y.id=z.corte_destino_id
          left join public.facturas_proveedor f on f.id=z.factura_id left join public.proveedores pr on pr.id=f.proveedor_id
          where z.operacion_id=o.id)) order by o.registrado_at desc)
      from inventario_control.socios_operaciones o join inventario_control.cortes x on x.id=o.corte_id
      where x.corte_at>=((mes||'-01')::date::timestamp at time zone 'America/Bogota')
        and x.corte_at<(((mes||'-01')::date+interval '1 month')::timestamp at time zone 'America/Bogota')),'[]'::jsonb));
  end if;
  if p_accion is distinct from 'registrar' or p_request_id is null then raise exception 'Acción e identificador de solicitud obligatorios'; end if;
  perform pg_advisory_xact_lock(hashtextextended('socios-inventario:'||p_request_id::text,0));
  select * into op from inventario_control.socios_operaciones where id=p_request_id;
  if found then
    if op.solicitud is distinct from p_datos then raise exception 'La solicitud ya existe con otros datos'; end if;
    return jsonb_build_object('ok',true,'reutilizado',true,'operacion',op.id,'monto',op.monto);
  end if;
  if jsonb_typeof(p_datos->'destinos') is distinct from 'array'
    or jsonb_array_length(p_datos->'destinos') not between 1 and 20 then raise exception 'Indica entre uno y veinte destinos'; end if;
  if (p_datos->>'socios_comunes') is distinct from 'true' then raise exception 'Confirma el reparto de los mismos socios'; end if;
  id_corte:=(p_datos->>'corte_id')::uuid;
  if id_corte is null then raise exception 'Selecciona el inventario que entrega el dinero'; end if;
  select array_agg(x order by x) into ids from (select distinct x from (
    select id_corte x union all select (value->>'corte_id')::uuid from jsonb_array_elements(p_datos->'destinos') where value->>'tipo'='aporte') q where x is not null) s;
  perform 1 from inventario_control.cortes x where x.id=any(ids) order by x.id for update;
  perform 1 from inventario_control.socios_grupos_tienda g where g.tienda_codigo in (
    select x.tienda_codigo from inventario_control.cortes x where x.id=any(ids)) order by g.tienda_codigo for update;
  -- Un mismo soporte no puede respaldar dos pagos concurrentes de cortes distintos.
  for motivo in select distinct item->>'soporte_path' from jsonb_array_elements(p_datos->'destinos') item order by 1 loop
    if motivo is not null then perform pg_advisory_xact_lock(hashtextextended('socios-soporte:'||motivo,0)); end if;
  end loop;
  select * into origen from inventario_control.cortes where id=id_corte;
  fuente:=inventario_control.socios_resultado(id_corte);
  if (fuente->>'listo')::boolean is distinct from true or fuente->>'huella' is distinct from p_datos->>'huella'
    or (fuente->>'utilidad_neta')::numeric<=0 then raise exception 'El resultado fuente no está listo o cambió; actualiza y revisa sus pendientes'; end if;
  fecha:=(p_datos->>'fecha')::date; motivo:=btrim(p_datos->>'motivo');
  if fecha is null or fecha>(now() at time zone 'America/Bogota')::date
    or fecha<(origen.corte_at at time zone 'America/Bogota')::date then raise exception 'Confirma la fecha real del retiro, no anterior al inventario ni futura'; end if;
  if coalesce(length(motivo),0)<8 then raise exception 'Describe el retiro y los aportes realizados (mínimo ocho caracteres)'; end if;
  -- Locks compatibles con retiros y arqueos existentes; no reservar caja en el cliente.
  perform pg_advisory_xact_lock(hashtextextended('retiro-caja:'||origen.tienda_codigo,0));
  perform public.caja_exigir_apertura(origen.tienda_codigo,fecha,false);
  perform 1 from public.proveedores p where p.id in (
    select f.proveedor_id from public.facturas_proveedor f join jsonb_array_elements(p_datos->'destinos') item on f.id=(item->>'factura_id')::uuid
    where item->>'tipo'='aporte') order by p.id for update;
  perform 1 from public.facturas_proveedor f join jsonb_array_elements(p_datos->'destinos') item on f.id=(item->>'factura_id')::uuid
    where item->>'tipo'='aporte' order by f.id for update of f;
  for a in select value from jsonb_array_elements(p_datos->'destinos') loop
    if a->>'tipo' is null or a->>'tipo' not in ('socio','aporte') or coalesce(a->>'monto','') !~ '^[0-9]+(\.[0-9]{1,2})?$'
      or (a->>'monto')::numeric<=0 or (a->>'monto')::numeric>=1000000000000 then raise exception 'Importe de destino inválido; usa pesos y máximo dos decimales'; end if;
    monto:=(a->>'monto')::numeric; total:=total+monto;
    if coalesce(a->>'soporte_path','') !~ '^finanzas/[a-f0-9-]+\.(pdf|png|jpe?g)$'
      or not exists(select 1 from storage.objects s where s.bucket_id='soportes' and s.name=a->>'soporte_path') then raise exception 'Falta el soporte cargado de un destino'; end if;
    if exists(select 1 from inventario_control.socios_destinos z where z.soporte_path=a->>'soporte_path')
      or (select count(*) from jsonb_array_elements(p_datos->'destinos') x where x->>'soporte_path'=a->>'soporte_path')<>1 then raise exception 'El soporte ya se utilizó; no dupliques el pago'; end if;
    if a->>'tipo'='socio' then
      if coalesce(length(btrim(a->>'beneficiario')),0)<3 or a->>'corte_id' is not null or a->>'factura_id' is not null then raise exception 'Identifica al socio; este destino no aplica abonos de cartera'; end if;
    else
      id_destino:=(a->>'corte_id')::uuid;
      destino:=inventario_control.socios_resultado(id_destino);
      if id_destino=id_corte or destino->>'grupo' is distinct from fuente->>'grupo'
        or to_char((destino->>'fin_at')::timestamptz at time zone 'America/Bogota','YYYY-MM') is distinct from to_char(origen.corte_at at time zone 'America/Bogota','YYYY-MM') then
        raise exception 'El aporte debe ir a otra tienda de los mismos socios y mes de inventario'; end if;
      if (destino->>'listo')::boolean is distinct from true or destino->>'huella' is distinct from a->>'huella'
        or (destino->>'utilidad_neta')::numeric>=0 then raise exception 'El destino debe tener una pérdida final verificable; actualiza el inventario'; end if;
      if (select sum((x->>'monto')::numeric) from jsonb_array_elements(p_datos->'destinos') x where x->>'tipo'='aporte' and x->>'corte_id'=a->>'corte_id')>(destino->>'perdida_pendiente')::numeric then
        raise exception 'Los aportes superan la pérdida pendiente de cubrir'; end if;
      select * into factura from public.facturas_proveedor f where f.id=(a->>'factura_id')::uuid
        and exists(select 1 from public.proveedores p where p.id=f.proveedor_id and p.activo);
      if not found then raise exception 'Selecciona una factura de proveedor activo'; end if;
    end if;
  end loop;
  if total>(fuente->>'disponible')::numeric then raise exception 'El reparto supera la utilidad disponible del inventario'; end if;
  disponible:=(public.calcular_efectivo_esperado_tienda(origen.tienda_codigo,fecha)->>'esperado')::numeric;
  select coalesce(sum(i.valor_esperado),0) into reservado from public.instrucciones_consignacion i where i.tienda_codigo=origen.tienda_codigo
    and (i.estado in ('pendiente','en_validacion') or (i.tipo_destino='SOCIO' and i.estado='rechazado'));
  if disponible is null or total>disponible-reservado then raise exception 'No hay efectivo libre suficiente en la caja de la tienda fuente'; end if;
  for id_destino in select unnest(ids) loop
    d:=inventario_control.socios_resultado(id_destino);
    insert into inventario_control.socios_resultados(corte_id,grupo,detalle,utilidad,fijado_por)
      values(id_destino,d->>'grupo',d,round((d->>'utilidad_neta')::numeric,2),auth.uid()) on conflict(corte_id) do nothing;
  end loop;
  insert into inventario_control.socios_operaciones(id,corte_id,fecha,monto,motivo,solicitud,financial_entry_id,movimiento_caja_id,registrado_por)
    values(p_request_id,id_corte,fecha,total,motivo,p_datos,financiero,caja,auth.uid());
  insert into public.financial_entries(id,scope,business_unit,entry_type,category,concept,beneficiary,amount,due_date,status,source,
    source_period_from,source_period_to,created_by,approved_by,approved_at,paid_by,paid_at,support_path,retail_funding,retail_request_id)
    values(financiero,'business_general','retail','retiro_utilidad','retiro','Liquidación de socios por inventario','Socios Retail',total,fecha,'pagado','manual',
      ((fuente->>'inicio_at')::timestamptz at time zone 'America/Bogota')::date,(origen.corte_at at time zone 'America/Bogota')::date,
      auth.uid(),auth.uid(),now(),auth.uid(),now(),p_datos->'destinos'->0->>'soporte_path',
      jsonb_build_object('inventory_operation_id',p_request_id,'corte_id',id_corte,'request',jsonb_build_object('stores',jsonb_build_array(jsonb_build_object('store',origen.tienda_codigo,'amount',total::text)))),p_request_id);
  insert into public.movimientos_caja_tienda(id,tienda_codigo,fecha,tipo,monto,soporte_path,observacion,autorizado_por,creado_por,idempotency_key)
    values(caja,origen.tienda_codigo,fecha,'retiro',total,p_datos->'destinos'->0->>'soporte_path',
      'Retiro de utilidades a socios · inventario '||id_corte||' · liquidación '||p_request_id,auth.uid(),auth.uid(),p_request_id);
  for a in select value from jsonb_array_elements(p_datos->'destinos') loop
    orden:=orden+1; monto:=(a->>'monto')::numeric; pago:=null; cc:=null; id_destino:=null;
    if a->>'tipo'='aporte' then
      id_destino:=(a->>'corte_id')::uuid;
      pago:=public.registrar_pago_proveedor((a->>'factura_id')::uuid,monto,fecha,'consignacion_tienda',
        'Aporte socios · '||p_request_id,a->>'soporte_path',motivo,md5(p_request_id||':pago:'||orden)::uuid);
      insert into public.cuenta_corriente(tienda_codigo,tipo,concepto,monto,referencia_tipo,referencia_id,usuario)
        select x.tienda_codigo,'abono','Aporte de socios para cubrir pérdida de inventario · pago '||fecha,monto,'aporte_socios_inventario',p_request_id::text,auth.uid()
          from inventario_control.cortes x where x.id=id_destino returning id into cc;
      select 'Aporte de socios · '||x.tienda_nombre into beneficiario from inventario_control.cortes x where x.id=id_destino;
    else beneficiario:=btrim(a->>'beneficiario'); end if;
    insert into inventario_control.socios_destinos(operacion_id,orden,tipo,beneficiario,monto,soporte_path,corte_destino_id,factura_id,pago_id,cuenta_corriente_id)
      values(p_request_id,orden,a->>'tipo',beneficiario,monto,a->>'soporte_path',id_destino,(a->>'factura_id')::uuid,(pago->>'pago_id')::uuid,cc);
  end loop;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),'socios_inventario_registrado','financial_entries',financiero,
    jsonb_build_object('operacion',p_request_id,'corte',id_corte,'caja',caja,'monto',total,'destinos',orden,'fecha',fecha));
  return jsonb_build_object('ok',true,'reutilizado',false,'operacion',p_request_id,'monto',total);
end $function$;


create function inventario_control.socios_revision_api(p_accion text,p_datos jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c inventario_control.cortes%rowtype; f public.financial_entries%rowtype; r inventario_control.socios_retiros_revisiones%rowtype;
 d jsonb; fuente jsonb; huella text; inicio date; fin date; ambiguo boolean; lista jsonb:='[]';
 corte uuid; retiro uuid; v_decision text; motivo text;
begin
 if auth.uid() is null or not public.es_controlador_financiero() then raise exception 'Solo Mayte u Óscar pueden revisar retiros por inventario';end if;
 if p_accion not in ('revisar_retiros','conciliar_retiro') or jsonb_typeof(p_datos) is distinct from 'object' then raise exception 'Acción de revisión no reconocida';end if;
 corte:=(p_datos->>'corte_id')::uuid;
 if corte is null then raise exception 'Selecciona el inventario a revisar';end if;
 if p_accion='conciliar_retiro' then
   if p_request_id is null then raise exception 'Falta el identificador de la revisión';end if;
   perform pg_advisory_xact_lock(hashtextextended('socios-revision:'||p_request_id::text,0));
   select * into r from inventario_control.socios_retiros_revisiones where id=p_request_id;
   if found then
     if r.solicitud is distinct from p_datos then raise exception 'La revisión ya existe con otros datos';end if;
     return jsonb_build_object('ok',true,'reutilizado',true,'revision',r.id);
   end if;
   perform 1 from inventario_control.cortes where id=corte for update;
   if exists(select 1 from inventario_control.socios_operaciones where corte_id=corte)
    or exists(select 1 from inventario_control.socios_destinos where corte_destino_id=corte) then
     raise exception 'Este inventario ya tiene retiros o aportes registrados; una reclasificación requiere un procedimiento autorizado';end if;
 end if;
 -- Reutiliza los guardas de corte físico cerrado, autorizado, tienda/grupo activos.
 d:=inventario_control.socios_resultado(corte);
 select * into strict c from inventario_control.cortes where id=corte;
 inicio:=(nullif(d->>'inicio_at','')::timestamptz at time zone 'America/Bogota')::date;
 fin:=(c.corte_at at time zone 'America/Bogota')::date;
 if inicio is null then raise exception 'No se pudo comprobar el período del inventario';end if;
 if p_accion='revisar_retiros' then
   for f in select * from public.financial_entries e where e.entry_type='retiro_utilidad'and e.business_unit='retail'
    and e.status in('pendiente_aprobacion','aprobado','pagado')and e.retail_funding->>'inventory_operation_id' is null
    and(e.source_period_from is null or e.source_period_to is null or(e.source_period_from<=fin and e.source_period_to>=inicio))
    and(case when jsonb_typeof(e.retail_funding->'request'->'stores')='array'
      then jsonb_array_length(e.retail_funding->'request'->'stores') else 0 end=0 or exists(
      select 1 from jsonb_array_elements(case when jsonb_typeof(e.retail_funding->'request'->'stores')='array'
        then e.retail_funding->'request'->'stores'else '[]'::jsonb end)z where z->>'store'=c.tienda_codigo)) order by e.id loop
     fuente:=inventario_control.socios_retiro_fuente(f,c.tienda_codigo);
     huella:=case when fuente is null then null else md5(fuente::text)end;
     ambiguo:=fuente is null or f.source_period_from is null or f.source_period_to is null
      or f.source_period_from<inicio or f.source_period_to>fin or exists(
       select 1 from inventario_control.cortes otro where otro.tienda_codigo=c.tienda_codigo and otro.id<>c.id
       and otro.estado in('aplicado','sin_diferencias')and otro.autorizado_at is not null and otro.base_conteo='corte_fijo'
       and not coalesce((otro.revision_fuente->>'solo_comparativo')::boolean,false)
       and(otro.corte_at at time zone 'America/Bogota')::date between f.source_period_from and f.source_period_to);
     select * into r from inventario_control.socios_retiros_revisiones z where z.corte_id=corte and z.retiro_id=f.id and z.huella_fuente=huella;
     if ambiguo then lista:=lista||jsonb_build_array(jsonb_build_object('retiro_id',f.id,'monto',fuente->'monto',
       'estado',f.status,'periodo_desde',f.source_period_from,'periodo_hasta',f.source_period_to,
       'huella_fuente',huella,'fuente_valida',fuente is not null,'requiere_revision',r.id is null,
       'decision',r.decision,'motivo',r.motivo,'validado_at',r.validado_at,'revision_id',r.id));end if;
   end loop;
   return jsonb_build_object('inventario',jsonb_build_object('corte_id',corte,'tienda',c.tienda_nombre,
     'inicio_at',d->'inicio_at','fin_at',d->'fin_at'),'retiros',lista);
 end if;
 retiro:=(p_datos->>'retiro_id')::uuid;v_decision:=p_datos->>'decision';motivo:=btrim(p_datos->>'motivo');
 if retiro is null or v_decision is null or v_decision not in('anterior','este_corte')or coalesce(length(motivo),0)not between 12 and 2000 then
   raise exception 'Selecciona el período comprobado y explica la revisión (12 a 2000 caracteres)';end if;
 if p_datos->>'confirmado' is distinct from 'true' then raise exception 'Confirma que comprobaste el período del retiro';end if;
 select * into f from public.financial_entries where id=retiro for update;
 fuente:=inventario_control.socios_retiro_fuente(f,c.tienda_codigo);
 if not found or fuente is null then raise exception 'El retiro no tiene una distribución única y válida para esta tienda';end if;
 if f.source_period_from is not null and f.source_period_to is not null and(f.source_period_from>fin or f.source_period_to<inicio) then
   raise exception 'Este retiro no se cruza con el período del inventario';end if;
 huella:=md5(fuente::text);
 if huella is distinct from p_datos->>'huella_fuente' then raise exception 'El retiro cambió; vuelve a consultar antes de confirmar';end if;
 -- La fila de financial_entries está bloqueada: serializa revisiones de este
 -- mismo retiro incluso cuando llegan desde inventarios/tiendas diferentes.
 if exists(select 1 from inventario_control.socios_retiros_revisiones z join inventario_control.cortes x on x.id=z.corte_id
   where z.retiro_id=retiro and z.fuente->>'tienda_codigo'=c.tienda_codigo and z.decision='este_corte'and z.corte_id<>corte
   and(v_decision='este_corte'or x.corte_at>=c.corte_at)) then
   raise exception 'Este retiro ya corresponde a otro inventario; no se puede descontar de dos cortes';end if;
 ambiguo:=f.source_period_from is null or f.source_period_to is null or f.source_period_from<inicio or f.source_period_to>fin or exists(
   select 1 from inventario_control.cortes otro where otro.tienda_codigo=c.tienda_codigo and otro.id<>c.id
   and otro.estado in('aplicado','sin_diferencias')and otro.autorizado_at is not null and otro.base_conteo='corte_fijo'
   and not coalesce((otro.revision_fuente->>'solo_comparativo')::boolean,false)
   and(otro.corte_at at time zone 'America/Bogota')::date between f.source_period_from and f.source_period_to);
 if not ambiguo then raise exception 'El período de este retiro ya corresponde a este inventario; no requiere reclasificación';end if;
 select * into r from inventario_control.socios_retiros_revisiones where corte_id=corte and retiro_id=retiro and huella_fuente=huella;
 if found then
   if r.solicitud is distinct from p_datos then raise exception 'Este retiro ya tiene otra clasificación registrada; requiere revisión autorizada';end if;
   return jsonb_build_object('ok',true,'reutilizado',true,'revision',r.id);
 end if;
 insert into inventario_control.socios_retiros_revisiones(id,corte_id,retiro_id,huella_fuente,fuente,decision,motivo,solicitud,validado_por)
 values(p_request_id,corte,retiro,huella,fuente,v_decision,motivo,p_datos,auth.uid());
 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
 values(auth.uid()::text,'conciliar_retiro_por_inventario','inventario_control.socios_retiros_revisiones',p_request_id::text,
  jsonb_build_object('corte_id',corte,'retiro_id',retiro,'decision',v_decision,'huella_fuente',huella));
 return jsonb_build_object('ok',true,'reutilizado',false,'revision',p_request_id);
end $$;
revoke all on function inventario_control.socios_revision_api(text,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function inventario_control.socios_revision_api(text,jsonb,uuid) to authenticated;

create or replace function public.socios_inventario(p_accion text,p_datos jsonb default '{}'::jsonb,p_request_id uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 if p_accion in('revisar_retiros','conciliar_retiro')then return inventario_control.socios_revision_api(p_accion,p_datos,p_request_id);end if;
 return inventario_control.socios_api(p_accion,p_datos,p_request_id);
end $$;
commit;
