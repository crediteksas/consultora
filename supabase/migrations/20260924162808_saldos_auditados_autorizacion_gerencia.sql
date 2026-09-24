-- La autorización del gerente es el soporte administrativo de la conciliación.
-- No se reescriben cierres, ventas, consignaciones ni pagos históricos.
create table public.saldo_ajustes_auditoria (
  id uuid primary key default gen_random_uuid(),
  referencia text not null unique,
  tienda_codigo text not null references public.origenes(codigo),
  fecha_corte date not null,
  caja_base numeric(18,2) not null,
  deuda_base numeric(18,2) not null,
  caja_objetivo numeric(18,2) not null check (caja_objetivo >= 0),
  deuda_objetivo numeric(18,2) not null check (deuda_objetivo >= 0),
  motivo text not null check (length(trim(motivo)) >= 20),
  estado text not null default 'pendiente' check (estado in ('pendiente','aplicado')),
  autorizado_por uuid references public.perfiles(id),
  autorizado_at timestamptz,
  movimiento_caja_id uuid,
  movimiento_cartera_id bigint,
  created_at timestamptz not null default now()
);
alter table public.saldo_ajustes_auditoria enable row level security;
revoke all on public.saldo_ajustes_auditoria from public,anon,authenticated;
grant select on public.saldo_ajustes_auditoria to authenticated;
create policy saldo_ajustes_solo_oscar on public.saldo_ajustes_auditoria
  for select to authenticated using (
    auth.uid()='6de0ad26-64af-4966-8cd9-d468880af627'::uuid
    and exists(select 1 from public.perfiles p where p.id=auth.uid() and p.activo and p.rol='gerencia')
  );

-- El ajuste físico no es una venta, un ingreso operacional ni una consignación.
alter table public.movimientos_caja_tienda drop constraint movimientos_caja_tienda_tipo_check;
alter table public.movimientos_caja_tienda add constraint movimientos_caja_tienda_tipo_check
  check (tipo in ('abono','otro_ingreso','transferencia_central','pago_directo_central',
    'retiro','consignacion','devolucion_efectivo','ajuste_auditoria_entrada','ajuste_auditoria_salida'));
alter table public.movimientos_caja_tienda alter column soporte_path drop not null;
alter table public.movimientos_caja_tienda add constraint movimientos_caja_tienda_soporte_auditoria_check
  check (tipo in ('ajuste_auditoria_entrada','ajuste_auditoria_salida')
    or nullif(trim(soporte_path),'') is not null);

create or replace function public.caja_componentes_rango(p_tienda text,p_desde date,p_hasta date)
returns jsonb language sql stable security definer set search_path='public','pg_temp' as $$
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
$$;

-- No se permite registrar manualmente un movimiento de este tipo por las APIs existentes.
create function public.proteger_ajuste_saldos_auditoria()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_tienda text; v_estado text;
begin
  if tg_table_name='movimientos_caja_tienda' then
    if new.tipo not in ('ajuste_auditoria_entrada','ajuste_auditoria_salida') then return new; end if;
  elsif tg_table_name='cuenta_corriente' then
    if new.referencia_tipo<>'ajuste_saldos_auditados' then return new; end if;
  else
    raise exception 'Tabla no autorizada para ajuste auditado';
  end if;
  v_id:=nullif(current_setting('app.saldo_ajuste_id',true),'')::uuid;
  if v_id is null or auth.uid() is distinct from '6de0ad26-64af-4966-8cd9-d468880af627'::uuid then
    raise exception 'El ajuste requiere autorización de Oscar en Cuenta corriente';
  end if;
  select tienda_codigo,estado into v_tienda,v_estado from public.saldo_ajustes_auditoria where id=v_id;
  if v_estado is distinct from 'pendiente' or v_tienda is distinct from new.tienda_codigo then
    raise exception 'La propuesta de ajuste no corresponde a esta tienda';
  end if;
  if tg_table_name='movimientos_caja_tienda' then
    if new.idempotency_key is distinct from v_id then
      raise exception 'Identificador de ajuste de caja incorrecto';
    end if;
  else
    if new.referencia_id is distinct from v_id::text then
      raise exception 'Identificador de ajuste de cartera incorrecto';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.proteger_ajuste_saldos_auditoria() from public,anon,authenticated;
create trigger proteger_ajuste_caja before insert on public.movimientos_caja_tienda
  for each row execute function public.proteger_ajuste_saldos_auditoria();
create trigger proteger_ajuste_cartera before insert on public.cuenta_corriente
  for each row execute function public.proteger_ajuste_saldos_auditoria();

create function public.autorizar_ajuste_saldos_auditados(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v public.saldo_ajustes_auditoria%rowtype;
  v_caja numeric; v_deuda numeric; v_delta_caja numeric; v_delta_deuda numeric;
  v_caja_id uuid; v_cartera_id bigint; v_hoy date;
begin
  if auth.uid() is distinct from '6de0ad26-64af-4966-8cd9-d468880af627'::uuid
    or not exists(select 1 from public.perfiles p where p.id=auth.uid() and p.activo and p.rol='gerencia') then
    raise exception 'Solo Oscar Pacheco puede autorizar ajustes auditados de saldos';
  end if;
  select * into v from public.saldo_ajustes_auditoria where id=p_id for update;
  if not found then raise exception 'Propuesta de ajuste no encontrada'; end if;
  if v.estado='aplicado' then
    return jsonb_build_object('id',v.id,'estado','aplicado','caja',v.caja_objetivo,
      'deuda',v.deuda_objetivo,'ya_aplicado',true);
  end if;
  v_hoy:=(now() at time zone 'America/Bogota')::date;
  perform pg_advisory_xact_lock(hashtextextended('caja-arrastre:'||v.tienda_codigo,0));
  lock table public.cuenta_corriente,public.movimientos_caja_tienda,public.caja_diaria
    in share row exclusive mode;
  v_caja:=(public.caja_calcular_interno(v.tienda_codigo,v_hoy)->>'esperado')::numeric;
  select coalesce(sum(case when tipo='cargo' then monto else -monto end),0)
    into v_deuda from public.cuenta_corriente where tienda_codigo=v.tienda_codigo;
  if v_caja is distinct from v.caja_base or v_deuda is distinct from v.deuda_base then
    raise exception 'Los saldos cambiaron desde la auditoría: caja %, deuda %. Revisa una nueva propuesta',v_caja,v_deuda;
  end if;
  v_delta_caja:=v.caja_objetivo-v_caja;
  v_delta_deuda:=v.deuda_objetivo-v_deuda;
  if v_delta_caja=0 and v_delta_deuda=0 then raise exception 'La propuesta no cambia saldos'; end if;
  perform set_config('app.saldo_ajuste_id',v.id::text,true);
  if v_delta_caja<>0 then
    insert into public.movimientos_caja_tienda(tienda_codigo,fecha,tipo,monto,
      soporte_path,observacion,autorizado_por,creado_por,idempotency_key)
    values(v.tienda_codigo,v_hoy,
      case when v_delta_caja>0 then 'ajuste_auditoria_entrada' else 'ajuste_auditoria_salida' end,
      abs(v_delta_caja),null,'Ajuste de saldo por auditoría · '||v.referencia||' · '||v.motivo,
      auth.uid(),auth.uid(),v.id) returning id into v_caja_id;
  end if;
  if v_delta_deuda<>0 then
    insert into public.cuenta_corriente(tienda_codigo,tipo,concepto,monto,
      referencia_tipo,referencia_id,usuario,nota)
    values(v.tienda_codigo,case when v_delta_deuda<0 then 'abono' else 'cargo' end,
      'Ajuste de saldo por auditoría · sin pago ni consignación',abs(v_delta_deuda),
      'ajuste_saldos_auditados',v.id::text,auth.uid(),
      'Autorización gerencial '||v.referencia||'. '||v.motivo)
    returning id into v_cartera_id;
  end if;
  update public.saldo_ajustes_auditoria set estado='aplicado',autorizado_por=auth.uid(),
    autorizado_at=now(),movimiento_caja_id=v_caja_id,movimiento_cartera_id=v_cartera_id
    where id=v.id;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
  values(auth.uid()::text,'saldos_auditados_autorizados','saldo_ajustes_auditoria',v.id::text,
    jsonb_build_object('tienda_codigo',v.tienda_codigo,'referencia',v.referencia,
      'caja_antes',v_caja,'caja_despues',v.caja_objetivo,
      'deuda_antes',v_deuda,'deuda_despues',v.deuda_objetivo,
      'movimiento_caja_id',v_caja_id,'movimiento_cartera_id',v_cartera_id,
      'sin_venta_ni_movimiento_bancario',true));
  if (public.caja_calcular_interno(v.tienda_codigo,v_hoy)->>'esperado')::numeric<>v.caja_objetivo
     or (select coalesce(sum(case when tipo='cargo' then monto else -monto end),0)
         from public.cuenta_corriente where tienda_codigo=v.tienda_codigo)<>v.deuda_objetivo then
    raise exception 'La comprobación final de saldos no coincide; no se aplicó ningún ajuste';
  end if;
  return jsonb_build_object('id',v.id,'estado','aplicado','caja',v.caja_objetivo,
    'deuda',v.deuda_objetivo,'ya_aplicado',false);
end $$;
revoke all on function public.autorizar_ajuste_saldos_auditados(uuid) from public,anon;
grant execute on function public.autorizar_ajuste_saldos_auditados(uuid) to authenticated;

-- Propuesta preparada; NO mueve saldos hasta el clic del gerente.
insert into public.saldo_ajustes_auditoria(referencia,tienda_codigo,fecha_corte,
  caja_base,deuda_base,caja_objetivo,deuda_objetivo,motivo)
select 'CK02-AUD-20260924','CK-02','2026-09-24',1132864,12671188,1580050,12446088,
  'Primer proceso de auditoría de Móvil Shopping: saldos físicos y deuda confirmados por Gerencia el 24/09/2026.'
where exists(select 1 from public.origenes where codigo='CK-02')
on conflict(referencia) do nothing;
