-- KORA-2026-000072: pagos realizados desde resultados de inventario.
-- Esquema aditivo: no corrige saldos, retiros ni cortes históricos.
begin;

create table inventario_control.socios_grupos_tienda (
  tienda_codigo text primary key references public.origenes(codigo),
  grupo text not null check(length(btrim(grupo))>=3),
  configurado_at timestamptz not null default clock_timestamp()
);
-- Configuración autorizada: las nueve tiendas propias activas comparten socios.
-- Una tienda futura NO pertenece automáticamente a este grupo.
do $$ begin
  if (select count(*) from public.origenes where tipo='propia' and activo)<>9 then
    raise exception 'Cambió el conjunto de nueve tiendas propias autorizado; revisar los grupos antes de publicar';
  end if;
end $$;
insert into inventario_control.socios_grupos_tienda(tienda_codigo,grupo)
  select codigo,'socios-retail' from public.origenes where tipo='propia' and activo;

create table inventario_control.socios_resultados (
  corte_id uuid primary key references inventario_control.cortes(id),
  grupo text not null,
  detalle jsonb not null,
  utilidad numeric not null,
  fijado_por uuid not null references public.perfiles(id),
  fijado_at timestamptz not null default clock_timestamp()
);
create table inventario_control.socios_operaciones (
  id uuid primary key,
  corte_id uuid not null references inventario_control.socios_resultados(corte_id),
  fecha date not null,
  monto numeric(16,2) not null check(monto>0),
  motivo text not null check(length(btrim(motivo))>=8),
  solicitud jsonb not null,
  financial_entry_id uuid not null unique references public.financial_entries(id) deferrable initially deferred,
  movimiento_caja_id uuid not null unique references public.movimientos_caja_tienda(id) deferrable initially deferred,
  registrado_por uuid not null references public.perfiles(id),
  registrado_at timestamptz not null default clock_timestamp()
);
create index socios_operaciones_corte on inventario_control.socios_operaciones(corte_id);
create table inventario_control.socios_destinos (
  id uuid primary key default gen_random_uuid(),
  operacion_id uuid not null references inventario_control.socios_operaciones(id),
  orden integer not null,
  tipo text not null check(tipo in ('socio','aporte')),
  beneficiario text not null check(length(btrim(beneficiario))>=3),
  monto numeric(16,2) not null check(monto>0),
  soporte_path text not null unique,
  corte_destino_id uuid references inventario_control.socios_resultados(corte_id),
  factura_id uuid references public.facturas_proveedor(id),
  pago_id uuid unique references public.pagos_proveedor(id),
  cuenta_corriente_id bigint unique references public.cuenta_corriente(id),
  unique(operacion_id,orden),
  check((tipo='socio' and corte_destino_id is null and factura_id is null and pago_id is null and cuenta_corriente_id is null)
    or (tipo='aporte' and corte_destino_id is not null and factura_id is not null and pago_id is not null and cuenta_corriente_id is not null))
);
create index socios_destinos_corte on inventario_control.socios_destinos(corte_destino_id) where corte_destino_id is not null;
create index socios_destinos_factura on inventario_control.socios_destinos(factura_id) where factura_id is not null;
alter table inventario_control.socios_grupos_tienda enable row level security;
alter table inventario_control.socios_resultados enable row level security;
alter table inventario_control.socios_operaciones enable row level security;
alter table inventario_control.socios_destinos enable row level security;
revoke all on inventario_control.socios_grupos_tienda,inventario_control.socios_resultados,
  inventario_control.socios_operaciones,inventario_control.socios_destinos from public,anon,authenticated;

create function inventario_control.socios_inmutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'La liquidación y su resultado son inmutables; una corrección requiere un procedimiento autorizado'; end $$;
revoke all on function inventario_control.socios_inmutable() from public,anon,authenticated;
create trigger socios_resultados_inmutable before update or delete on inventario_control.socios_resultados for each row execute function inventario_control.socios_inmutable();
create trigger socios_operaciones_inmutable before update or delete on inventario_control.socios_operaciones for each row execute function inventario_control.socios_inmutable();
create trigger socios_destinos_inmutable before update or delete on inventario_control.socios_destinos for each row execute function inventario_control.socios_inmutable();

create function inventario_control.socios_resultado(p_corte uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c inventario_control.cortes%rowtype; d jsonb; fijado jsonb; grupo text; grupo_fijado text;
  usado numeric; cubierto numeric; antiguo numeric:=0; ambiguo boolean:=false; e record; a jsonb;
  inicio date; fin date;
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
    if jsonb_typeof(e.retail_funding->'request'->'stores') is distinct from 'array' then
      ambiguo:=true;
    else
      for a in select value from jsonb_array_elements(e.retail_funding->'request'->'stores') where value->>'store'=c.tienda_codigo loop
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
end $$;
revoke all on function inventario_control.socios_resultado(uuid) from public,anon,authenticated;

create function inventario_control.socios_finanzas_guardar() returns trigger
language plpgsql security definer set search_path='' as $$
declare op inventario_control.socios_operaciones%rowtype; v uuid;
begin
  if new.entry_type<>'retiro_utilidad' or new.business_unit<>'retail' then return new; end if;
  if new.retail_funding->>'inventory_operation_id' is not null then
    v:=(new.retail_funding->>'inventory_operation_id')::uuid;
    select * into op from inventario_control.socios_operaciones where id=v;
    if not found or auth.uid() is distinct from op.registrado_por or not public.es_controlador_financiero()
      or new.id<>op.financial_entry_id or new.amount<>op.monto or new.status<>'pagado'
      or new.approved_by is distinct from auth.uid() or new.paid_by is distinct from auth.uid()
      or new.retail_request_id is distinct from op.id or tg_op<>'INSERT' then
      raise exception 'La liquidación de inventario solo se registra mediante su operación trazada e inmutable';
    end if;
    return new;
  end if;
  -- Evaluar las fuentes de ESTA fila; nunca bloquear por otra tienda del sistema.
  if (tg_op='INSERT' or old.status is distinct from new.status or old.retail_funding is distinct from new.retail_funding)
    and new.status in ('pendiente_aprobacion','aprobado','pagado') and exists(
      select 1 from jsonb_array_elements(case when jsonb_typeof(new.retail_funding->'request'->'stores')='array'
        then new.retail_funding->'request'->'stores' else '[]'::jsonb end) a
      join public.origenes o on o.codigo=a->>'store' where o.tipo='propia' and o.activo
        and (o.inventario_control_activo or o.inventario_control_desde is not null)) then
    raise exception 'Para estas tiendas usa Liquidación de socios por inventario; no el retiro general por fechas';
  end if;
  return new;
end $$;
revoke all on function inventario_control.socios_finanzas_guardar() from public,anon,authenticated;
create trigger socios_inventario_finanzas_guard before insert or update on public.financial_entries
  for each row execute function inventario_control.socios_finanzas_guardar();

create function inventario_control.socios_api(p_accion text,p_datos jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
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
    for c in select distinct on (x.tienda_codigo) x.* from inventario_control.cortes x
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
end $$;
revoke all on function inventario_control.socios_api(text,jsonb,uuid) from public,anon;
grant execute on function inventario_control.socios_api(text,jsonb,uuid) to authenticated;
create function public.socios_inventario(p_accion text,p_datos jsonb default '{}',p_request_id uuid default null) returns jsonb
language sql security invoker set search_path='' as $$select inventario_control.socios_api(p_accion,p_datos,p_request_id)$$;
revoke all on function public.socios_inventario(text,jsonb,uuid) from public,anon;
grant execute on function public.socios_inventario(text,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
