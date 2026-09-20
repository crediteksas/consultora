begin;

-- Activación prospectiva: nunca convertir el histórico en arqueos automáticos.
create table public.caja_ciclo_config (
  id boolean primary key default true check (id),
  fecha_inicio date not null default ((now() at time zone 'America/Bogota')::date+1)
);
insert into public.caja_ciclo_config(id) values(true);
alter table public.caja_ciclo_config enable row level security;
revoke all on public.caja_ciclo_config from anon, authenticated;

create table public.caja_cortes (
  tienda_codigo text not null references public.origenes(codigo),
  fecha date not null,
  corte_at timestamptz not null default now(),
  resumen_corte jsonb not null,
  estado text not null default 'pendiente' check (estado in ('pendiente','observada','validada','autorizada')),
  efectivo_contado numeric,
  diferencia numeric,
  resumen_validado jsonb,
  validado_por uuid references public.perfiles(id),
  validado_at timestamptz,
  nota text,
  primary key(tienda_codigo,fecha),
  check (efectivo_contado is null or efectivo_contado >= 0),
  check (estado not in ('validada','autorizada') or
    (efectivo_contado is not null and validado_por is not null and validado_at is not null))
);
create table public.caja_arqueo_intentos (
  id uuid primary key default gen_random_uuid(),
  tienda_codigo text not null,
  fecha date not null,
  creado_por uuid not null references public.perfiles(id),
  creado_at timestamptz not null default now(),
  idempotency_key uuid not null unique,
  efectivo_contado numeric not null check (efectivo_contado >= 0),
  resumen jsonb not null,
  nota text,
  resultado jsonb not null,
  foreign key(tienda_codigo,fecha) references public.caja_cortes(tienda_codigo,fecha)
);
alter table public.caja_cortes enable row level security;
alter table public.caja_arqueo_intentos enable row level security;
revoke all on public.caja_cortes,public.caja_arqueo_intentos from anon,authenticated;
grant select on public.caja_cortes,public.caja_arqueo_intentos to authenticated;
create policy caja_cortes_lectura on public.caja_cortes for select to authenticated using (
  exists(select 1 from public.perfiles p where p.id=(select auth.uid()) and p.activo
    and (p.rol in ('gerencia','auditoria') or (p.rol='admin_tienda' and p.tienda_codigo=caja_cortes.tienda_codigo)))
);
create policy caja_arqueos_lectura on public.caja_arqueo_intentos for select to authenticated using (
  exists(select 1 from public.perfiles p where p.id=(select auth.uid()) and p.activo
    and (p.rol in ('gerencia','auditoria') or (p.rol='admin_tienda' and p.tienda_codigo=caja_arqueo_intentos.tienda_codigo)))
);

-- Helpers internos: sin permisos RPC para clientes. Conservan NUMERIC.
create function public.caja_componentes_rango(p_tienda text,p_desde date,p_hasta date)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  with v as (
    select coalesce(sum(v.total) filter(where v.tipo='contado'),0) contado,
      coalesce(sum(c.cuota_inicial) filter(where v.tipo='credito'),0) iniciales,
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
      coalesce(sum(monto) filter(where tipo in ('transferencia_central','pago_directo_central','retiro','consignacion','devolucion_efectivo')),0) salidas
    from public.movimientos_caja_tienda where tienda_codigo=p_tienda and fecha between p_desde and p_hasta
  ) select jsonb_build_object('contado_ventas',v.contado,'iniciales',v.iniciales,
    'financiado_ventas',0,'saldo_por_cobrar',v.cartera,'otros_ingresos',m.ingresos,
    'gastos_efectivo',g.gastos,'salidas_explicitas',m.salidas,'gastos_pendientes',g.pendientes,
    'operaciones',v.operaciones,'neto',v.contado+v.iniciales+m.ingresos-g.gastos-m.salidas)
  from v,g,m;
$$;
revoke all on function public.caja_componentes_rango(text,date,date) from public,anon,authenticated;

create function public.caja_calcular_interno(p_tienda text,p_fecha date)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare
  anterior public.caja_diaria%rowtype;
  original public.caja_diaria%rowtype;
  desde date;
  dia jsonb;
  pasado jsonb;
  registrado numeric;
  arrastre numeric;
  ajuste numeric;
  apertura numeric;
begin
  select * into anterior from public.caja_diaria where tienda_codigo=p_tienda and fecha<p_fecha
    and estado='cerrada' order by fecha desc limit 1;
  select min(fecha) into desde from public.caja_diaria where tienda_codigo=p_tienda and fecha<p_fecha and estado='cerrada';
  -- La primera apertura histórica es el ancla declarada, no un arqueo nuevo.
  -- Sin ancla, se muestra todo el flujo registrado y se advierte que falta arqueo.
  desde:=coalesce(desde,'1900-01-01'::date);
  pasado:=public.caja_componentes_rango(p_tienda,desde,p_fecha-1);
  select coalesce(sum(contado_ventas+financiado_ventas+iniciales+otros_ingresos-gastos_efectivo-salidas_explicitas),0)
    into registrado from public.caja_diaria where tienda_codigo=p_tienda and fecha between desde and p_fecha-1 and estado='cerrada';
  arrastre:=(pasado->>'neto')::numeric-registrado;
  ajuste:=arrastre-coalesce(anterior.arrastre_movimientos_incorporado,0);
  apertura:=coalesce(anterior.efectivo_contado,0)+ajuste;
  dia:=public.caja_componentes_rango(p_tienda,p_fecha,p_fecha);
  select * into original from public.caja_diaria where tienda_codigo=p_tienda and fecha=p_fecha;
  return dia || jsonb_build_object('ok',true,'tienda_codigo',p_tienda,'fecha',p_fecha,'apertura',apertura,'esperado',apertura+(dia->>'neto')::numeric,
    'apertura_cierre_anterior',coalesce(anterior.efectivo_contado,0),
    'ajuste_arrastre_movimientos',ajuste,'arrastre_movimientos_total',arrastre,
    'apertura_sin_arqueo',anterior.id is null,
    'fecha_inicio_ciclo',(select fecha_inicio from public.caja_ciclo_config where id),
    'caja',case when original.id is null then null else to_jsonb(original) end);
end;
$$;
revoke all on function public.caja_calcular_interno(text,date) from public,anon,authenticated;

create or replace function public.calcular_efectivo_esperado_tienda(p_tienda_codigo text,p_fecha date)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.perfiles p where p.id=auth.uid() and p.activo and
    (p.rol in ('gerencia','auditoria') or (p.rol='admin_tienda' and p.tienda_codigo=p_tienda_codigo))) then
    raise exception 'No autorizado para consultar esta caja';
  end if;
  if p_fecha is null or p_fecha>(now() at time zone 'America/Bogota')::date then
    raise exception 'Selecciona una fecha válida de Colombia, no una fecha futura';
  end if;
  return public.caja_calcular_interno(p_tienda_codigo,p_fecha);
end;
$$;
revoke all on function public.calcular_efectivo_esperado_tienda(text,date) from public,anon;
grant execute on function public.calcular_efectivo_esperado_tienda(text,date) to authenticated;

create function public.caja_asegurar_corte(p_tienda text,p_fecha date)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_fecha<(select fecha_inicio from public.caja_ciclo_config where id) or
    p_fecha>(now() at time zone 'America/Bogota')::date then return; end if;
  perform pg_advisory_xact_lock(hashtextextended('caja-arrastre:'||p_tienda,0));
  insert into public.caja_cortes(tienda_codigo,fecha,resumen_corte)
    values(p_tienda,p_fecha,public.caja_calcular_interno(p_tienda,p_fecha)) on conflict do nothing;
end;
$$;
revoke all on function public.caja_asegurar_corte(text,date) from public,anon,authenticated;

-- El programador solo puede hacer cortes, nunca contar ni autorizar dinero.
create function public.generar_cortes_caja(p_fecha date)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare t record; resultado jsonb:='[]';
begin
  if p_fecha is null or p_fecha>(now() at time zone 'America/Bogota')::date then raise exception 'Fecha de corte inválida'; end if;
  for t in select codigo,nombre from public.origenes where activo and tipo='propia' order by codigo loop
    perform public.caja_asegurar_corte(t.codigo,p_fecha);
    resultado:=resultado||jsonb_build_array(jsonb_build_object('tienda_codigo',t.codigo,'origen',jsonb_build_object('nombre',t.nombre),
      'estado',coalesce((select estado from public.caja_cortes where tienda_codigo=t.codigo and fecha=p_fecha),'historica'),
      'efectivo_esperado',case when p_fecha<(select fecha_inicio from public.caja_ciclo_config where id)
        then coalesce((select efectivo_esperado from public.caja_diaria where tienda_codigo=t.codigo and fecha=p_fecha and estado='cerrada'),(public.caja_calcular_interno(t.codigo,p_fecha)->>'esperado')::numeric)
        else (public.caja_calcular_interno(t.codigo,p_fecha)->>'esperado')::numeric end,
      'efectivo_contado',case when p_fecha<(select fecha_inicio from public.caja_ciclo_config where id)
        then (select efectivo_contado from public.caja_diaria where tienda_codigo=t.codigo and fecha=p_fecha and estado='cerrada')
        else (select efectivo_contado from public.caja_cortes where tienda_codigo=t.codigo and fecha=p_fecha) end,
      'diferencia',case when p_fecha<(select fecha_inicio from public.caja_ciclo_config where id)
        then (select diferencia from public.caja_diaria where tienda_codigo=t.codigo and fecha=p_fecha and estado='cerrada')
        else (select diferencia from public.caja_cortes where tienda_codigo=t.codigo and fecha=p_fecha) end));
  end loop;
  return resultado;
end;
$$;
revoke all on function public.generar_cortes_caja(date) from public,anon,authenticated;
grant execute on function public.generar_cortes_caja(date) to service_role;

create function public.caja_pendiente_interno(p_tienda text)
returns date language sql stable security definer set search_path=public,pg_temp as $$
  select min(d::date) from public.caja_ciclo_config cfg,
    generate_series(cfg.fecha_inicio::timestamp,((now() at time zone 'America/Bogota')::date-1)::timestamp,interval '1 day') d
  where cfg.id and not exists(select 1 from public.caja_cortes c where c.tienda_codigo=p_tienda and c.fecha=d::date and c.estado in ('validada','autorizada'));
$$;
revoke all on function public.caja_pendiente_interno(text) from public,anon,authenticated;

create function public.estado_apertura_caja(p_tienda_codigo text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare pendiente date; resumen jsonb;
begin
  if not exists(select 1 from public.perfiles p where p.id=auth.uid() and p.activo and
    (p.rol in ('gerencia','auditoria') or (p.rol='admin_tienda' and p.tienda_codigo=p_tienda_codigo))) then raise exception 'No autorizado'; end if;
  pendiente:=public.caja_pendiente_interno(p_tienda_codigo);
  if pendiente is not null then
    perform public.caja_asegurar_corte(p_tienda_codigo,pendiente);
    resumen:=public.caja_calcular_interno(p_tienda_codigo,pendiente);
  end if;
  return jsonb_build_object('bloqueada',pendiente is not null,'fecha_pendiente',pendiente,
    'hoy',(now() at time zone 'America/Bogota')::date,'resumen',resumen,
    'corte',(select to_jsonb(c) from public.caja_cortes c where c.tienda_codigo=p_tienda_codigo and c.fecha=pendiente));
end;
$$;
revoke all on function public.estado_apertura_caja(text) from public,anon;
grant execute on function public.estado_apertura_caja(text) to authenticated;

create function public.validar_arqueo_caja(p_tienda_codigo text,p_fecha date,p_efectivo_contado numeric,
  p_idempotency_key uuid,p_nota text default null,p_autorizar boolean default false)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare perfil public.perfiles%rowtype; c jsonb; dif numeric; estado_nuevo text; res jsonb;
  intento public.caja_arqueo_intentos%rowtype; pendiente date; corte public.caja_cortes%rowtype;
begin
  select * into perfil from public.perfiles where id=auth.uid() and activo;
  if not found or not (perfil.rol in ('gerencia','auditoria') or
    (perfil.rol='admin_tienda' and perfil.tienda_codigo=p_tienda_codigo)) then raise exception 'No autorizado'; end if;
  if p_autorizar and perfil.rol not in ('gerencia','auditoria') then raise exception 'Solo Gestión o Gerencia puede autorizar diferencias'; end if;
  if p_fecha is null or p_fecha>=(now() at time zone 'America/Bogota')::date or
    p_fecha<(select fecha_inicio from public.caja_ciclo_config where id) then raise exception 'El arqueo corresponde al día anterior, no al día en curso ni al histórico anterior a la activación'; end if;
  if p_efectivo_contado is null or p_efectivo_contado<0 or p_efectivo_contado::text in ('NaN','Infinity','-Infinity') or p_idempotency_key is null then raise exception 'Ingresa el efectivo contado real'; end if;
  perform pg_advisory_xact_lock(hashtextextended('caja-arrastre:'||p_tienda_codigo,0));
  select * into intento from public.caja_arqueo_intentos where idempotency_key=p_idempotency_key;
  if found then
    if intento.creado_por<>auth.uid() or intento.tienda_codigo<>p_tienda_codigo or intento.fecha<>p_fecha or intento.efectivo_contado<>p_efectivo_contado then raise exception 'Identificador de intento ya utilizado'; end if;
    return intento.resultado;
  end if;
  pendiente:=public.caja_pendiente_interno(p_tienda_codigo);
  if pendiente is distinct from p_fecha then raise exception 'Primero valida la caja pendiente de %',pendiente; end if;
  if exists(select 1 from public.caja_diaria where tienda_codigo=p_tienda_codigo and fecha=p_fecha and estado='cerrada') then
    raise exception 'Ya existe un cierre original en esta fecha. Gestión debe revisar la transición sin sustituirlo';
  end if;
  perform public.caja_asegurar_corte(p_tienda_codigo,p_fecha);
  select * into corte from public.caja_cortes where tienda_codigo=p_tienda_codigo and fecha=p_fecha for update;
  if p_autorizar and (corte.efectivo_contado is null or corte.efectivo_contado<>p_efectivo_contado or length(trim(coalesce(p_nota,'')))<5) then
    raise exception 'La autorización requiere un arqueo registrado por la tienda y un motivo';
  end if;
  c:=public.caja_calcular_interno(p_tienda_codigo,p_fecha);
  dif:=p_efectivo_contado-(c->>'esperado')::numeric;
  if dif<>0 and length(trim(coalesce(p_nota,'')))<5 then raise exception 'Explica la diferencia para enviarla a Gestión'; end if;
  estado_nuevo:=case when (c->>'gastos_pendientes')::int>0 then 'observada'
    when dif=0 then 'validada' when p_autorizar then 'autorizada' else 'observada' end;
  res:=jsonb_build_object('ok',estado_nuevo in ('validada','autorizada'),'estado',estado_nuevo,
    'diferencia',dif,'esperado',(c->>'esperado')::numeric,'gastos_pendientes',(c->>'gastos_pendientes')::int,
    'mensaje',case when (c->>'gastos_pendientes')::int>0 then 'Hay gastos pendientes de aprobación. Gestión debe resolverlos antes de habilitar la caja.'
      when estado_nuevo='observada' then 'Diferencia registrada. Solicita revisión a Gestión; la caja continúa bloqueada.' else 'Arqueo registrado. Ciclo anterior cerrado.' end);
  update public.caja_cortes set estado=estado_nuevo,efectivo_contado=p_efectivo_contado,diferencia=dif,
    resumen_validado=c,nota=nullif(trim(p_nota),''),
    validado_por=case when estado_nuevo in ('validada','autorizada') then auth.uid() end,
    validado_at=case when estado_nuevo in ('validada','autorizada') then now() end
    where tienda_codigo=p_tienda_codigo and fecha=p_fecha;
  insert into public.caja_arqueo_intentos(tienda_codigo,fecha,creado_por,idempotency_key,efectivo_contado,resumen,nota,resultado)
    values(p_tienda_codigo,p_fecha,auth.uid(),p_idempotency_key,p_efectivo_contado,c,p_nota,res);
  if estado_nuevo in ('validada','autorizada') then
    insert into public.caja_diaria(tienda_codigo,fecha,estado,apertura,contado_ventas,financiado_ventas,iniciales,otros_ingresos,
      gastos_efectivo,salidas_explicitas,efectivo_esperado,efectivo_contado,diferencia,cerrada_por,cerrada_at,nota,
      cierre_idempotency_key,arrastre_movimientos_incorporado)
    values(p_tienda_codigo,p_fecha,'cerrada',(c->>'apertura')::numeric,(c->>'contado_ventas')::numeric,0,(c->>'iniciales')::numeric,
      (c->>'otros_ingresos')::numeric,(c->>'gastos_efectivo')::numeric,(c->>'salidas_explicitas')::numeric,(c->>'esperado')::numeric,
      p_efectivo_contado,dif,auth.uid(),now(),p_nota,p_idempotency_key,(c->>'arrastre_movimientos_total')::numeric)
    on conflict(tienda_codigo,fecha) do update set
      estado=excluded.estado,apertura=excluded.apertura,contado_ventas=excluded.contado_ventas,
      financiado_ventas=excluded.financiado_ventas,iniciales=excluded.iniciales,otros_ingresos=excluded.otros_ingresos,
      gastos_efectivo=excluded.gastos_efectivo,salidas_explicitas=excluded.salidas_explicitas,
      efectivo_esperado=excluded.efectivo_esperado,efectivo_contado=excluded.efectivo_contado,diferencia=excluded.diferencia,
      cerrada_por=excluded.cerrada_por,cerrada_at=excluded.cerrada_at,nota=excluded.nota,
      cierre_idempotency_key=excluded.cierre_idempotency_key,
      arrastre_movimientos_incorporado=excluded.arrastre_movimientos_incorporado
    where caja_diaria.estado='abierta';
  end if;
  return res;
end;
$$;
revoke all on function public.validar_arqueo_caja(text,date,numeric,uuid,text,boolean) from public,anon;
grant execute on function public.validar_arqueo_caja(text,date,numeric,uuid,text,boolean) to authenticated;

-- No basta con ocultar un botón: también se bloquean clientes abiertos y RPC antiguos.
create function public.caja_exigir_apertura(p_tienda text,p_fecha date,p_es_gasto boolean default false)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
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
$$;
revoke all on function public.caja_exigir_apertura(text,date,boolean) from public,anon,authenticated;

create function public.caja_guardar_movimiento()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare fila jsonb; anterior jsonb; tienda text; fecha_mov date; venta uuid;
begin
  fila:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  if tg_table_name in ('creditos','venta_items') then
    venta:=(fila->>'venta_id')::uuid;
    select tienda_codigo,fecha into tienda,fecha_mov from public.ventas where id=venta;
  else tienda:=fila->>'tienda_codigo'; fecha_mov:=(fila->>'fecha')::date; end if;
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
$$;
revoke all on function public.caja_guardar_movimiento() from public,anon,authenticated;
create trigger caja_ciclo_ventas before insert or update of total,tipo,fecha,tienda_codigo,anulada or delete on public.ventas for each row execute function public.caja_guardar_movimiento();
create trigger caja_ciclo_creditos before insert or update of cuota_inicial,venta_id or delete on public.creditos for each row execute function public.caja_guardar_movimiento();
create trigger caja_ciclo_items before insert or update of precio_venta,cantidad,venta_id or delete on public.venta_items for each row execute function public.caja_guardar_movimiento();
create trigger caja_ciclo_gastos before insert or update of monto,estado,fecha,tienda_codigo,concepto_id or delete on public.gastos for each row execute function public.caja_guardar_movimiento();
create trigger caja_ciclo_movimientos before insert or update or delete on public.movimientos_caja_tienda for each row execute function public.caja_guardar_movimiento();

create function public.caja_proteger_cierre_verificado()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op in ('UPDATE','DELETE') and old.estado='cerrada' and exists(select 1 from public.caja_cortes c
    where c.tienda_codigo=old.tienda_codigo and c.fecha=old.fecha and c.estado in ('validada','autorizada')) then
    raise exception 'El arqueo validado es inmutable; registra una corrección trazable sin alterar el cierre original';
  end if;
  if tg_op='DELETE' then return old; end if;
  if new.fecha>(now() at time zone 'America/Bogota')::date then raise exception 'No se puede cerrar una fecha futura'; end if;
  if new.fecha>=(select fecha_inicio from public.caja_ciclo_config where id) and new.estado='cerrada' and not exists(
    select 1 from public.caja_cortes c where c.tienda_codigo=new.tienda_codigo and c.fecha=new.fecha
      and c.estado in ('validada','autorizada') and c.validado_por=auth.uid()
      and c.efectivo_contado=new.efectivo_contado and c.diferencia=new.diferencia
      and (c.resumen_validado->>'apertura')::numeric=new.apertura
      and (c.resumen_validado->>'esperado')::numeric=new.efectivo_esperado
      and (c.resumen_validado->>'contado_ventas')::numeric=new.contado_ventas
      and (c.resumen_validado->>'iniciales')::numeric=new.iniciales
      and (c.resumen_validado->>'otros_ingresos')::numeric=new.otros_ingresos
      and (c.resumen_validado->>'gastos_efectivo')::numeric=new.gastos_efectivo
      and (c.resumen_validado->>'salidas_explicitas')::numeric=new.salidas_explicitas
      and new.financiado_ventas=0 and new.cerrada_por=auth.uid()
  ) then raise exception 'Valida el arqueo del día anterior en Caja. El corte automático no es efectivo contado'; end if;
  return new;
end;
$$;
revoke all on function public.caja_proteger_cierre_verificado() from public,anon,authenticated;
create trigger caja_ciclo_cierre before insert or update or delete on public.caja_diaria for each row execute function public.caja_proteger_cierre_verificado();

comment on column public.caja_diaria.arrastre_movimientos_incorporado is 'Ajuste acumulado ya incorporado: movimientos explícitos y, desde ciclo automático, ventas/iniciales/gastos y días intermedios sin cierre. No descontar otra vez.';
notify pgrst,'reload schema';
commit;
