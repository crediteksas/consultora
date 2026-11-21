create role anon; create role authenticated; create schema auth; create schema kora_private;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.origenes(codigo text primary key,tipo text default 'propia',activo boolean default true);
create table public.perfiles(id uuid primary key,nombre text,rol text,activo boolean default true);
create table public.ventas(id uuid primary key,consecutivo bigint,tienda_codigo text,vendedor uuid,tipo text,cliente_id uuid,total numeric,fecha date,anulada boolean default false,nota text,created_at timestamptz default now(),efectivo_devuelto_registrado numeric default 0);
create table public.creditos(id uuid primary key,venta_id uuid unique,financiera text,cuota_inicial numeric,valor_esperado_financiera numeric,valor_real_financiera numeric,contrato_ref text,plazo_meses int,estado_conciliacion text default 'pendiente',conciliado_at timestamptz,importacion_id uuid,created_at timestamptz default now(),medio_pago_complementario text,referencia_pago_complementario text,check(estado_conciliacion in ('pendiente','conciliado','novedad')));
create table public.unidades(id uuid primary key,imei text,estado text,producto_id uuid,tienda_actual text,costo_remision numeric);
create table public.venta_items(id uuid primary key,venta_id uuid,producto_id uuid,unidad_id uuid,cantidad integer,precio_venta numeric,costo_congelado numeric);
create table public.movimientos(id bigserial primary key,tipo text,tienda_codigo text,producto_id uuid,unidad_id uuid,cantidad integer,costo numeric,precio numeric,referencia_tipo text,referencia_id text,reverso_de bigint references public.movimientos(id),usuario uuid,nota text,created_at timestamptz default now());
create table public.retail_b2b_compensations(id uuid primary key,operation_id uuid,liquidation_id uuid,store_code text,platform text,imei text,compensation_value numeric,initial_value numeric,applied_at timestamptz,reversed_at timestamptz,accepted_at timestamptz);
create table public.liquidation_operations(id uuid primary key,liquidation_id uuid,plataforma text,imei text,origen_codigo text,credito_id uuid);
create table public.cuenta_corriente(id bigserial primary key,tienda_codigo text,tipo text,concepto text,monto numeric check(monto>0),referencia_tipo text,referencia_id text,usuario uuid,nota text,created_at timestamptz default now());
create table public.venta_ajustes_administrativos(id uuid primary key default gen_random_uuid(),venta_id uuid references public.ventas(id),tipo text check(tipo in ('correccion_datos','anulacion')),motivo text,estado text default 'aplicado' check(estado in ('aplicado','revertido')),valores_anteriores jsonb,valores_nuevos jsonb,usuario_id uuid,created_at timestamptz default now());
create table public.audit_log(id bigserial primary key,usuario text,accion text,tabla text,registro_id text,detalle jsonb,created_at timestamptz default now());
create table public.kora_incidents(id uuid primary key,incident_code text);
create table public.caja_ciclo_config(id boolean,fecha_inicio date);
create table public.caja_diaria(id uuid default gen_random_uuid(),tienda_codigo text,fecha date,estado text,efectivo_contado numeric,efectivo_esperado numeric,apertura numeric,arrastre_movimientos_incorporado numeric default 0);
create table public.caja_cortes(tienda_codigo text,fecha date,estado text,efectivo_contado numeric);
create table public.movimientos_caja_tienda(id uuid default gen_random_uuid(),tienda_codigo text,fecha date,tipo text,monto numeric,creado_por uuid,autorizado_por uuid,idempotency_key uuid);
create table public.saldo_ajustes_auditoria(id uuid,tienda_codigo text,estado text,movimiento_caja_id uuid,caja_objetivo numeric,caja_base numeric);
create table public.periodos(tienda_codigo text,fecha_inicio date,fecha_fin date);
create table public.credit_portfolio_obligations(credito_id uuid); create table public.importacion_detalle(credito_id uuid);
create table public.conceptos_gasto(id uuid,preautorizado boolean);
create table public.gastos(id uuid,tienda_codigo text,fecha date,concepto_id uuid,monto numeric,estado text);
create table kora_private.rectificacion_cierre_corozal(cierre_id uuid,estado text,efectivo_corregido numeric,efectivo_original numeric);
create function kora_private.devolucion_parcial_permitida(text,text,jsonb,jsonb) returns boolean language sql as $$select false$$;
create function kora_private.venta_cero_autorizada_tras_arqueo(text,text,jsonb,text,date) returns boolean language sql as $$select false$$;
create function public.caja_pendiente_interno(text) returns date language sql as $$select null::date$$;

CREATE OR REPLACE FUNCTION public.caja_exigir_apertura(p_tienda text, p_fecha date, p_es_gasto boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare pendiente date; hoy date:=(now() at time zone 'America/Bogota')::date;
begin
  if not exists(select 1 from public.origenes where codigo=p_tienda and activo and tipo='propia') then return; end if;
  if p_fecha is null or p_fecha>hoy then raise exception 'La fecha del movimiento no puede ser futura ni estar vacía'; end if;
  perform pg_advisory_xact_lock(hashtextextended('caja-arrastre:'||p_tienda,0));
  if exists(select 1 from public.caja_cortes where tienda_codigo=p_tienda and fecha>=p_fecha and estado in ('validada','autorizada')) then
    raise exception 'El día ya tiene arqueo validado. La corrección requiere revisión de Gestión; no se modifica el cierre original';
  end if;
  if p_fecha<hoy and (p_es_gasto or exists(select 1 from public.perfiles where id=auth.uid() and activo and rol in ('gerencia','auditoria'))) then return; end if;
  pendiente:=public.caja_pendiente_interno(p_tienda);
  if pendiente is not null then raise exception 'CAJA_PENDIENTE: valida el efectivo y los gastos del % en Mi tienda > Caja antes de nuevos movimientos',pendiente; end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.caja_componentes_rango(p_tienda text, p_desde date, p_hasta date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with v as (
    select coalesce(sum(v.total+v.efectivo_devuelto_registrado) filter(where v.tipo='contado'),0) contado,
      coalesce(sum(case when lower(coalesce(c.financiera,''))='addi' and c.medio_pago_complementario is not null and c.medio_pago_complementario<>'efectivo' then 0 else c.cuota_inicial end) filter(where v.tipo='credito'),0) iniciales,
      coalesce(sum(c.valor_esperado_financiera) filter(where v.tipo='credito'),0) cartera,
      count(*) operaciones
    from public.ventas v left join public.creditos c on c.venta_id=v.id
    where v.tienda_codigo=p_tienda and v.fecha between p_desde and p_hasta
      and not coalesce(v.anulada,false)
  ), g as (
    select coalesce(sum(g.monto) filter(where g.estado='aprobado' or
      (cg.preautorizado and g.estado='registrado')),0) gastos,
      count(*) filter(where g.estado='registrado') pendientes
    from public.gastos g left join public.conceptos_gasto cg on cg.id=g.concepto_id
    where g.tienda_codigo=p_tienda and g.fecha between p_desde and p_hasta
  ), m as (
    select coalesce(sum(monto) filter(where tipo in ('otro_ingreso','abono')),0) ingresos,
      coalesce(sum(monto) filter(where tipo in ('transferencia_central',
        'pago_directo_central','retiro','consignacion','devolucion_efectivo')),0) salidas,
      coalesce(sum(monto) filter(where tipo='ajuste_auditoria_entrada'),0)
        -coalesce(sum(monto) filter(where tipo='ajuste_auditoria_salida'),0) ajuste
    from public.movimientos_caja_tienda
    where tienda_codigo=p_tienda and fecha between p_desde and p_hasta
  ) select jsonb_build_object('contado_ventas',v.contado,'iniciales',v.iniciales,
    'financiado_ventas',0,'saldo_por_cobrar',v.cartera,'otros_ingresos',m.ingresos,
    'gastos_efectivo',g.gastos,'salidas_explicitas',m.salidas,
    'ajustes_auditoria',m.ajuste,'gastos_pendientes',g.pendientes,
    'operaciones',v.operaciones,
    'neto',v.contado+v.iniciales+m.ingresos-g.gastos-m.salidas+m.ajuste)
  from v,g,m;
$function$;

CREATE OR REPLACE FUNCTION public.caja_calcular_interno(p_tienda text, p_fecha date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  anterior public.caja_diaria%rowtype;
  original public.caja_diaria%rowtype;
  desde date;
  dia jsonb;
  pasado jsonb;
  registrado numeric;
  arrastre numeric;
  incorporado numeric;
  ajuste numeric;
  apertura numeric;
  diferencia_rectificada numeric;
  rectificacion jsonb;
begin
  select * into anterior from public.caja_diaria where tienda_codigo=p_tienda and fecha<p_fecha
    and estado='cerrada' order by fecha desc limit 1;
  select min(fecha) into desde from public.caja_diaria where tienda_codigo=p_tienda and fecha<p_fecha and estado='cerrada';
  desde:=coalesce(desde,'1900-01-01'::date);
  pasado:=public.caja_componentes_rango(p_tienda,desde,p_fecha-1);
  -- Incluye los ajustes de auditoría ya incorporados al cierre, no solo ventas/gastos.
  select coalesce(sum(c.efectivo_esperado-c.apertura),0)
    into registrado from public.caja_diaria c where c.tienda_codigo=p_tienda and c.fecha between desde and p_fecha-1 and c.estado='cerrada';
  -- La diferencia entra al arrastre una sola vez. Un arqueo nuevo que ya la
  -- incorpora guarda el total del arrastre, igual que para otros movimientos.
  select coalesce(sum(r.efectivo_corregido-r.efectivo_original),0)
    into diferencia_rectificada
    from kora_private.rectificacion_cierre_corozal r
    join public.caja_diaria c on c.id=r.cierre_id
    where c.tienda_codigo=p_tienda and c.fecha between desde and p_fecha-1
      and r.estado='autorizada';
  arrastre:=(pasado->>'neto')::numeric-registrado+diferencia_rectificada;
  incorporado:=case when anterior.fecha=desde then 0
    else coalesce(anterior.arrastre_movimientos_incorporado,0) end;
  ajuste:=arrastre-incorporado;
  apertura:=coalesce(anterior.efectivo_contado,0)+ajuste;
  dia:=public.caja_componentes_rango(p_tienda,p_fecha,p_fecha);
  select * into original from public.caja_diaria where tienda_codigo=p_tienda and fecha=p_fecha;
  select jsonb_build_object('efectivo_original',r.efectivo_original,
    'efectivo_corregido',r.efectivo_corregido,'diferencia',r.efectivo_corregido-r.efectivo_original)
    into rectificacion from kora_private.rectificacion_cierre_corozal r
    where r.cierre_id=original.id and r.estado='autorizada';
  return dia || jsonb_build_object('ok',true,'tienda_codigo',p_tienda,'fecha',p_fecha,'apertura',apertura,'esperado',apertura+(dia->>'neto')::numeric,
    'apertura_cierre_anterior',coalesce(anterior.efectivo_contado,0),
    'rectificacion_cierre',rectificacion,
    'ajuste_arrastre_movimientos',ajuste,'arrastre_movimientos_total',arrastre,
    'apertura_sin_arqueo',anterior.id is null,
    'fecha_inicio_ciclo',(select fecha_inicio from public.caja_ciclo_config where id),
    'caja',case when original.id is null then null else to_jsonb(original) end);
end;
$function$;

CREATE OR REPLACE FUNCTION public.caja_guardar_movimiento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare fila jsonb; anterior jsonb; tienda text; fecha_mov date; venta uuid;
begin
  fila:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  if tg_table_name in ('ventas','venta_items') and tg_op in ('UPDATE','DELETE')
    and kora_private.devolucion_parcial_permitida(tg_table_name,tg_op,to_jsonb(old),case when tg_op='UPDATE' then to_jsonb(new) else null end) then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;

  if tg_table_name in ('creditos','venta_items') then
    venta:=(fila->>'venta_id')::uuid;
    select tienda_codigo,fecha into tienda,fecha_mov from public.ventas where id=venta;
  else tienda:=fila->>'tienda_codigo'; fecha_mov:=(fila->>'fecha')::date; end if;

  -- Solo el INSERT exacto de una propuesta auditada que el RPC está autorizando.
  -- El trigger proteger_ajuste_caja y la comprobación final del RPC siguen activos.
  if tg_op='INSERT' and tg_table_schema='public'
    and tg_table_name='movimientos_caja_tienda'
    and fila->>'tipo' in ('ajuste_auditoria_entrada','ajuste_auditoria_salida') then
    if auth.uid() is distinct from '6de0ad26-64af-4966-8cd9-d468880af627'::uuid
      or not exists(select 1 from public.perfiles p
        where p.id=auth.uid() and p.activo and p.rol='gerencia')
      or fecha_mov is distinct from (now() at time zone 'America/Bogota')::date
      or (fila->>'autorizado_por')::uuid is distinct from auth.uid()
      or (fila->>'creado_por')::uuid is distinct from auth.uid()
      or not exists(
        select 1 from public.saldo_ajustes_auditoria a
        where a.id::text=nullif(current_setting('app.saldo_ajuste_id',true),'')
          and a.id::text=fila->>'idempotency_key'
          and a.tienda_codigo=tienda and a.estado='pendiente'
          and a.movimiento_caja_id is null
          and a.caja_objetivo>=0 and a.caja_objetivo<>a.caja_base
          and (fila->>'monto')::numeric=abs(a.caja_objetivo-a.caja_base)
          and fila->>'tipo'=case when a.caja_objetivo>a.caja_base
            then 'ajuste_auditoria_entrada' else 'ajuste_auditoria_salida' end
      ) then
      raise exception 'El movimiento no corresponde a un ajuste auditado autorizado por Gerencia';
    end if;
    return new;
  end if;

  -- El obsequio exacto, pendiente y autorizado no afecta efectivo del corte.
  if tg_table_name in ('ventas','venta_items') and tg_op in ('INSERT','UPDATE')
     and (tg_op = 'INSERT' or (tg_table_name = 'ventas'
       and to_jsonb(old)->>'id' = fila->>'id'
       and to_jsonb(old)->>'tienda_codigo' = fila->>'tienda_codigo'
       and to_jsonb(old)->>'fecha' = fila->>'fecha'
       and to_jsonb(old)->>'tipo' = fila->>'tipo'
       and (to_jsonb(old)->>'total')::numeric = 0))
     and kora_private.venta_cero_autorizada_tras_arqueo(tg_table_name,tg_op,fila,tienda,fecha_mov) then
    return new;
  end if;

  -- Ambas tiendas/fechas se verifican al reasignar, no solo el destino nuevo.
  if tg_op='UPDATE' then
    anterior:=to_jsonb(old);
    if tg_table_name in ('creditos','venta_items') then
      if anterior->>'venta_id' is distinct from fila->>'venta_id' then
        perform public.caja_exigir_apertura(v.tienda_codigo,v.fecha,false) from public.ventas v where v.id=(anterior->>'venta_id')::uuid;
      end if;
    else
      perform public.caja_exigir_apertura(anterior->>'tienda_codigo',(anterior->>'fecha')::date,tg_table_name='gastos');
    end if;
  end if;
  perform public.caja_exigir_apertura(tienda,fecha_mov,tg_table_name='gastos');
  if tg_op='DELETE' then return old; else return new; end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.proteger_registro_venta_confirmada()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if current_setting('app.ajuste_venta_autorizado', true) = '1' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'UPDATE'
     and tg_table_name = 'ventas'
     and old.total = 0
     and not coalesce(old.anulada, false)
     and new.id = old.id
     and new.tienda_codigo = old.tienda_codigo
     and new.vendedor is not distinct from old.vendedor
     and new.tipo = old.tipo
     and new.cliente_id is not distinct from old.cliente_id
     and new.fecha = old.fecha
     and new.nota is not distinct from old.nota
     and not coalesce(new.anulada, false) then
    return new;
  end if;

  raise exception 'Registro de venta inmutable. Usa Corregir o anular venta para conservar la trazabilidad.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.proteger_libro_cartera_retail()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if coalesce(current_setting('app.mantenimiento_cartera_retail', true), '') <> 'autorizado' then
    raise exception 'El libro oficial de cartera Retail es inmutable; registre un ajuste compensatorio';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

create trigger caja_ciclo_ventas before update of total,tipo,fecha,tienda_codigo,anulada on public.ventas for each row execute function public.caja_guardar_movimiento();
create trigger ventas_confirmadas_inmutables before update or delete on public.ventas for each row execute function public.proteger_registro_venta_confirmada();
create trigger trg_cartera_inmutable before update or delete on public.cuenta_corriente for each row execute function public.proteger_libro_cartera_retail();
create function public.test_kardex_inmutable() returns trigger language plpgsql as $$begin raise exception 'Kardex inmutable'; end$$;
create trigger kardex_inmutable before update or delete on public.movimientos for each row execute function public.test_kardex_inmutable();
