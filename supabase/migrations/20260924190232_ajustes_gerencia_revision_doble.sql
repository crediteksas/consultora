-- Maite prepara; Oscar autoriza. La solicitud no altera caja ni cartera.
create table public.ajustes_gerencia_solicitudes (
  id uuid primary key,
  tipo text not null check (tipo in ('caja_retail','cartera_retail','cartera_b2b')),
  codigo text not null references public.origenes(codigo),
  saldo_base numeric(18,2) not null check (saldo_base >= 0 and saldo_base = trunc(saldo_base)),
  saldo_objetivo numeric(18,2) not null check (saldo_objetivo >= 0 and saldo_objetivo = trunc(saldo_objetivo)),
  motivo text not null check (length(btrim(motivo)) >= 20),
  estado text not null default 'pendiente' check (estado in ('pendiente','aplicado','rechazado')),
  preparado_por uuid not null references public.perfiles(id),
  preparado_at timestamptz not null default now(),
  decidido_por uuid references public.perfiles(id),
  decidido_at timestamptz,
  motivo_rechazo text
);
create index ajustes_gerencia_solicitudes_estado_idx
  on public.ajustes_gerencia_solicitudes(estado,preparado_at desc);
alter table public.ajustes_gerencia_solicitudes enable row level security;
revoke all on public.ajustes_gerencia_solicitudes from public,anon,authenticated;
grant select on public.ajustes_gerencia_solicitudes to authenticated;
create policy ajustes_gerencia_lectura_controlada on public.ajustes_gerencia_solicitudes
  for select to authenticated using (
    auth.uid() in ('d1782db6-bacc-4caf-af6f-ce1b8d1c0391'::uuid,
                   '6de0ad26-64af-4966-8cd9-d468880af627'::uuid)
    and exists(select 1 from public.perfiles p where p.id=auth.uid() and p.activo
      and p.rol in ('auditoria','gerencia'))
  );

create function public.preparar_ajuste_gerencia(
  p_id uuid,p_tipo text,p_codigo text,p_saldo_base numeric,p_saldo_objetivo numeric,p_motivo text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actual numeric; v_cuenta uuid; v_hoy date;
begin
  if auth.uid() is distinct from 'd1782db6-bacc-4caf-af6f-ce1b8d1c0391'::uuid
    or not exists(select 1 from public.perfiles p where p.id=auth.uid() and p.activo and p.rol='auditoria') then
    raise exception 'Solo Maite puede preparar ajustes de Gerencia';
  end if;
  if p_id is null or p_tipo not in ('caja_retail','cartera_retail','cartera_b2b')
    or nullif(btrim(coalesce(p_codigo,'')),'') is null
    or length(btrim(coalesce(p_motivo,'')))<20 then
    raise exception 'Completa el tipo, la cuenta y un motivo de al menos 20 caracteres';
  end if;
  if p_saldo_base is null or p_saldo_objetivo is null or p_saldo_base<0 or p_saldo_objetivo<0
    or p_saldo_base<>trunc(p_saldo_base) or p_saldo_objetivo<>trunc(p_saldo_objetivo)
    or p_saldo_base=p_saldo_objetivo then
    raise exception 'Los saldos deben ser pesos enteros, no negativos y diferentes';
  end if;
  if exists(select 1 from public.ajustes_gerencia_solicitudes where id=p_id) then
    if exists(select 1 from public.ajustes_gerencia_solicitudes s where s.id=p_id
      and s.tipo=p_tipo and s.codigo=p_codigo and s.saldo_base=p_saldo_base
      and s.saldo_objetivo=p_saldo_objetivo and s.motivo=btrim(p_motivo)
      and s.preparado_por=auth.uid()) then
      return jsonb_build_object('id',p_id,'estado','pendiente','ya_registrado',true);
    end if;
    raise exception 'Este identificador ya corresponde a otra solicitud';
  end if;
  if p_tipo in ('caja_retail','cartera_retail') then
    if not exists(select 1 from public.origenes where codigo=p_codigo and tipo='propia' and activo)
    then raise exception 'La tienda Retail no está activa'; end if;
    if p_tipo='caja_retail' then
      v_hoy:=(now() at time zone 'America/Bogota')::date;
      v_actual:=(public.caja_calcular_interno(p_codigo,v_hoy)->>'esperado')::numeric;
    else
      select coalesce(sum(case when tipo='cargo' then monto else -monto end),0)
        into v_actual from public.cuenta_corriente where tienda_codigo=p_codigo;
    end if;
  else
    select c.id into v_cuenta from public.cuentas_cartera c
      join public.origenes o on o.codigo=c.tienda_codigo
      where c.tienda_codigo=p_codigo and c.tipo_cuenta='cliente_b2b'
        and c.activo and o.tipo='cliente_b2b' and o.activo;
    if v_cuenta is null then raise exception 'El cliente B2B no está activo'; end if;
    select coalesce(sum(case when efecto='debito' then monto else -monto end),0)
      into v_actual from public.movimientos_cartera where cuenta_id=v_cuenta;
  end if;
  if v_actual is distinct from p_saldo_base then
    raise exception 'El saldo cambió: actual %, propuesto como base %. Actualiza la pantalla',v_actual,p_saldo_base;
  end if;
  insert into public.ajustes_gerencia_solicitudes(id,tipo,codigo,saldo_base,saldo_objetivo,motivo,preparado_por)
  values(p_id,p_tipo,p_codigo,p_saldo_base,p_saldo_objetivo,btrim(p_motivo),auth.uid());
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
  values(auth.uid()::text,'ajuste_gerencia_preparado','ajustes_gerencia_solicitudes',p_id::text,
    jsonb_build_object('tipo',p_tipo,'codigo',p_codigo,'base',p_saldo_base,'objetivo',p_saldo_objetivo));
  return jsonb_build_object('id',p_id,'estado','pendiente','ya_registrado',false);
end $$;
revoke all on function public.preparar_ajuste_gerencia(uuid,text,text,numeric,numeric,text) from public,anon;
grant execute on function public.preparar_ajuste_gerencia(uuid,text,text,numeric,numeric,text) to authenticated;

create function public.decidir_ajuste_gerencia(p_id uuid,p_aprobar boolean,p_motivo_rechazo text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.ajustes_gerencia_solicitudes%rowtype;
  v_caja numeric; v_deuda numeric; v_cuenta uuid; v_actual numeric; v_resultado jsonb;
begin
  if auth.uid() is distinct from '6de0ad26-64af-4966-8cd9-d468880af627'::uuid
    or not exists(select 1 from public.perfiles p where p.id=auth.uid() and p.activo and p.rol='gerencia') then
    raise exception 'Solo Oscar puede autorizar o rechazar ajustes de Gerencia';
  end if;
  select * into s from public.ajustes_gerencia_solicitudes where id=p_id for update;
  if not found then raise exception 'Solicitud no encontrada'; end if;
  if s.estado<>'pendiente' then return jsonb_build_object('id',s.id,'estado',s.estado,'ya_decidido',true); end if;
  if not coalesce(p_aprobar,false) then
    if length(btrim(coalesce(p_motivo_rechazo,'')))<10 then
      raise exception 'Indica un motivo de rechazo de al menos 10 caracteres'; end if;
    update public.ajustes_gerencia_solicitudes set estado='rechazado',decidido_por=auth.uid(),
      decidido_at=now(),motivo_rechazo=btrim(p_motivo_rechazo) where id=s.id;
  else
    if s.tipo in ('caja_retail','cartera_retail') then
      v_caja:=(public.caja_calcular_interno(s.codigo,(now() at time zone 'America/Bogota')::date)->>'esperado')::numeric;
      select coalesce(sum(case when tipo='cargo' then monto else -monto end),0)
        into v_deuda from public.cuenta_corriente where tienda_codigo=s.codigo;
      v_actual:=case when s.tipo='caja_retail' then v_caja else v_deuda end;
      if v_actual is distinct from s.saldo_base then
        raise exception 'El saldo cambió desde la solicitud: %. Maite debe preparar otra propuesta',v_actual; end if;
      v_resultado:=public.ajuste_gerencia_retail(s.id,s.codigo,v_caja,v_deuda,
        case when s.tipo='caja_retail' then s.saldo_objetivo else null end,
        case when s.tipo='cartera_retail' then s.saldo_objetivo else null end,s.motivo);
    else
      select c.id into v_cuenta from public.cuentas_cartera c
        where c.tienda_codigo=s.codigo and c.tipo_cuenta='cliente_b2b' and c.activo;
      if v_cuenta is null then raise exception 'Cuenta B2B no activa'; end if;
      select coalesce(sum(case when efecto='debito' then monto else -monto end),0)
        into v_actual from public.movimientos_cartera where cuenta_id=v_cuenta;
      if v_actual is distinct from s.saldo_base then
        raise exception 'El saldo cambió desde la solicitud: %. Maite debe preparar otra propuesta',v_actual; end if;
      v_resultado:=public.ajuste_gerencia_b2b(s.id,s.codigo,v_actual,s.saldo_objetivo,s.motivo);
    end if;
    if v_resultado->>'estado'<>'aplicado' then raise exception 'El ajuste no quedó aplicado'; end if;
    update public.ajustes_gerencia_solicitudes set estado='aplicado',decidido_por=auth.uid(),
      decidido_at=now() where id=s.id;
  end if;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
  values(auth.uid()::text,case when p_aprobar then 'ajuste_gerencia_aprobado' else 'ajuste_gerencia_rechazado' end,
    'ajustes_gerencia_solicitudes',s.id::text,
    jsonb_build_object('tipo',s.tipo,'codigo',s.codigo,'base',s.saldo_base,
      'objetivo',s.saldo_objetivo,'preparado_por',s.preparado_por));
  return jsonb_build_object('id',s.id,'estado',case when p_aprobar then 'aplicado' else 'rechazado' end,
    'ya_decidido',false);
end $$;
revoke all on function public.decidir_ajuste_gerencia(uuid,boolean,text) from public,anon;
grant execute on function public.decidir_ajuste_gerencia(uuid,boolean,text) to authenticated;

-- Los RPC anteriores eran de aplicación inmediata; se cierran para exigir doble control.
revoke execute on function public.ajuste_gerencia_retail(uuid,text,numeric,numeric,numeric,numeric,text)
  from authenticated;
revoke execute on function public.ajuste_gerencia_b2b(uuid,text,numeric,numeric,text)
  from authenticated;
