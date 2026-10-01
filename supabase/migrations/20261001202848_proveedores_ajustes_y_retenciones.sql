-- Ajustes de apertura: Maite prepara y Óscar autoriza en el mismo módulo.
-- No se crean pagos, compras de mercancía ni movimientos de Banco/Caja.
create schema if not exists proveedores_control_private;
revoke all on schema proveedores_control_private from public, anon;
grant usage on schema proveedores_control_private to authenticated;

create table public.proveedores_ajustes_solicitudes (
  id uuid primary key,
  proveedor_id uuid not null references public.proveedores(id),
  saldo_base numeric(18,2) not null check (saldo_base >= 0 and saldo_base < 1000000000000000),
  saldo_objetivo numeric(18,2) not null check (saldo_objetivo >= 0 and saldo_objetivo < 1000000000000000 and saldo_objetivo = trunc(saldo_objetivo)),
  motivo text not null check (length(btrim(motivo)) between 20 and 1000),
  facturas_base jsonb not null,
  plan jsonb not null,
  estado text not null default 'pendiente' check (estado in ('pendiente','aplicado','rechazado')),
  preparado_por uuid not null references public.perfiles(id),
  preparado_at timestamptz not null default now(),
  decidido_por uuid references public.perfiles(id),
  decidido_at timestamptz,
  motivo_rechazo text
);
create unique index proveedores_ajustes_un_pendiente on public.proveedores_ajustes_solicitudes(proveedor_id) where estado='pendiente';
create index proveedores_ajustes_proveedor on public.proveedores_ajustes_solicitudes(proveedor_id);
create index proveedores_ajustes_historial on public.proveedores_ajustes_solicitudes(preparado_at desc);
create index proveedores_ajustes_preparador on public.proveedores_ajustes_solicitudes(preparado_por);
create index proveedores_ajustes_decisor on public.proveedores_ajustes_solicitudes(decidido_por);

create table public.proveedores_ajustes_detalle (
  solicitud_id uuid not null references public.proveedores_ajustes_solicitudes(id),
  factura_id uuid not null references public.facturas_proveedor(id),
  saldo_anterior numeric(18,2) not null,
  saldo_nuevo numeric(18,2) not null check (saldo_nuevo >= 0),
  diferencia numeric(18,2) not null,
  primary key (solicitud_id,factura_id),
  check (diferencia = saldo_nuevo-saldo_anterior and diferencia <> 0)
);
create index proveedores_ajustes_detalle_factura on public.proveedores_ajustes_detalle(factura_id);

alter table public.proveedores_ajustes_solicitudes enable row level security;
alter table public.proveedores_ajustes_detalle enable row level security;
revoke all on public.proveedores_ajustes_solicitudes, public.proveedores_ajustes_detalle from public,anon,authenticated;
grant select on public.proveedores_ajustes_solicitudes, public.proveedores_ajustes_detalle to authenticated;
create policy proveedores_ajustes_lectura on public.proveedores_ajustes_solicitudes
  for select to authenticated using (
    exists(select 1 from public.perfiles p where p.id=(select auth.uid()) and p.activo and
      ((p.id='d1782db6-bacc-4caf-af6f-ce1b8d1c0391'::uuid and p.rol='auditoria') or
       (p.id='6de0ad26-64af-4966-8cd9-d468880af627'::uuid and p.rol='gerencia')))
  );
create policy proveedores_ajustes_detalle_lectura on public.proveedores_ajustes_detalle
  for select to authenticated using (
    exists(select 1 from public.proveedores_ajustes_solicitudes s where s.id=solicitud_id)
  );

-- Solo uso interno. La huella detecta también redistribuciones sin cambio del total.
create function proveedores_control_private.huella(p_proveedor_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'numero',numero,'fecha',fecha,
    'created_at',created_at,'total',total,'saldo',saldo,'origen_registro',origen_registro)
    order by fecha nulls last,created_at nulls last,id),'[]'::jsonb)
  from public.facturas_proveedor where proveedor_id=p_proveedor_id;
$$;
revoke all on function proveedores_control_private.huella(uuid) from public,anon,authenticated;

create function proveedores_control_private.preparar_ajuste(
  p_id uuid,p_proveedor_id uuid,p_saldo_base numeric,p_saldo_objetivo numeric,p_motivo text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.proveedores_ajustes_solicitudes%rowtype;
  v_actual numeric; v_huella jsonb; v_plan jsonb:='[]'; v_f jsonb; v_resta numeric; v_reduccion numeric;
begin
  if auth.uid() is distinct from 'd1782db6-bacc-4caf-af6f-ce1b8d1c0391'::uuid or not exists(
    select 1 from public.perfiles p where p.id=auth.uid() and p.activo and p.rol='auditoria'
  ) then raise exception 'Solo Maite puede preparar ajustes de proveedores'; end if;
  if p_id is null or p_proveedor_id is null or length(btrim(coalesce(p_motivo,''))) not between 20 and 1000
    or p_saldo_base is null or not(p_saldo_base>=0 and p_saldo_base<1000000000000000)
    or p_saldo_objetivo is null or not(p_saldo_objetivo>=0 and p_saldo_objetivo<1000000000000000)
    or p_saldo_objetivo<>trunc(p_saldo_objetivo) or p_saldo_objetivo=p_saldo_base
  then raise exception 'Indica proveedor, saldo comprobado, nuevo saldo entero diferente y motivo de auditoría'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ajuste-proveedor:'||p_id::text,0));
  select * into s from public.proveedores_ajustes_solicitudes where id=p_id;
  if found then
    if s.proveedor_id<>p_proveedor_id or s.saldo_base<>p_saldo_base or s.saldo_objetivo<>p_saldo_objetivo
      or s.motivo<>btrim(p_motivo) or s.preparado_por<>auth.uid()
    then raise exception 'El identificador ya corresponde a otra solicitud'; end if;
    return to_jsonb(s)||jsonb_build_object('ya_registrado',true);
  end if;
  perform 1 from public.proveedores where id=p_proveedor_id and activo for update;
  if not found then raise exception 'Proveedor no activo'; end if;
  if exists(select 1 from public.proveedores_ajustes_solicitudes where proveedor_id=p_proveedor_id and estado='pendiente')
  then raise exception 'Este proveedor ya tiene un ajuste pendiente: debe decidirse antes de preparar otro'; end if;
  perform 1 from public.facturas_proveedor where proveedor_id=p_proveedor_id order by id for update;
  if exists(select 1 from public.facturas_proveedor where proveedor_id=p_proveedor_id and
    (saldo is null or not(saldo>=0 and saldo<1000000000000000)))
  then raise exception 'Hay facturas con saldo inválido; revisa el detalle antes de ajustar'; end if;
  select coalesce(sum(saldo),0) into v_actual from public.facturas_proveedor where proveedor_id=p_proveedor_id;
  if v_actual is distinct from p_saldo_base then raise exception 'El saldo cambió: actual %. Actualiza antes de preparar',v_actual; end if;
  v_huella:=proveedores_control_private.huella(p_proveedor_id);
  if p_saldo_objetivo>v_actual then
    v_plan:=jsonb_build_array(jsonb_build_object('factura_id',null,'numero','Ajuste de apertura (no es compra)',
      'saldo_anterior',0,'saldo_nuevo',p_saldo_objetivo-v_actual,'diferencia',p_saldo_objetivo-v_actual));
  else
    v_resta:=v_actual-p_saldo_objetivo;
    for v_f in select value from jsonb_array_elements(v_huella) loop
      exit when v_resta=0;
      v_reduccion:=least(v_resta,(v_f->>'saldo')::numeric);
      if v_reduccion>0 then
        v_plan:=v_plan||jsonb_build_array(jsonb_build_object('factura_id',v_f->>'id','numero',v_f->>'numero',
          'saldo_anterior',(v_f->>'saldo')::numeric,'saldo_nuevo',(v_f->>'saldo')::numeric-v_reduccion,'diferencia',-v_reduccion));
        v_resta:=v_resta-v_reduccion;
      end if;
    end loop;
  end if;
  insert into public.proveedores_ajustes_solicitudes(id,proveedor_id,saldo_base,saldo_objetivo,motivo,facturas_base,plan,preparado_por)
    values(p_id,p_proveedor_id,v_actual,p_saldo_objetivo,btrim(p_motivo),v_huella,v_plan,auth.uid()) returning * into s;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(auth.uid()::text,'ajuste_proveedor_preparado','proveedores_ajustes_solicitudes',p_id::text,
      jsonb_build_object('proveedor_id',p_proveedor_id,'base',v_actual,'objetivo',p_saldo_objetivo,'plan',v_plan));
  return to_jsonb(s)||jsonb_build_object('ya_registrado',false);
end $$;

create function proveedores_control_private.decidir_ajuste(p_id uuid,p_aprobar boolean,p_motivo_rechazo text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.proveedores_ajustes_solicitudes%rowtype; v_linea jsonb; v_factura uuid; v_actual numeric;
begin
  if auth.uid() is distinct from '6de0ad26-64af-4966-8cd9-d468880af627'::uuid or not exists(
    select 1 from public.perfiles p where p.id=auth.uid() and p.activo and p.rol='gerencia'
  ) then raise exception 'Solo Óscar puede autorizar o rechazar ajustes de proveedores'; end if;
  if p_aprobar is null then raise exception 'Indica aprobar o rechazar'; end if;
  select * into s from public.proveedores_ajustes_solicitudes where id=p_id;
  if not found then raise exception 'Solicitud no encontrada'; end if;
  perform 1 from public.proveedores where id=s.proveedor_id for update;
  select * into s from public.proveedores_ajustes_solicitudes where id=p_id for update;
  if s.estado<>'pendiente' then return jsonb_build_object('id',s.id,'estado',s.estado,'ya_decidido',true); end if;
  if not p_aprobar then
    if length(btrim(coalesce(p_motivo_rechazo,'')))<10 then raise exception 'Indica un motivo de rechazo de al menos 10 caracteres'; end if;
    update public.proveedores_ajustes_solicitudes set estado='rechazado',decidido_por=auth.uid(),decidido_at=now(),
      motivo_rechazo=btrim(p_motivo_rechazo) where id=p_id;
  else
    if not exists(select 1 from public.proveedores where id=s.proveedor_id and activo) then raise exception 'Proveedor no activo'; end if;
    perform 1 from public.facturas_proveedor where proveedor_id=s.proveedor_id order by id for update;
    if proveedores_control_private.huella(s.proveedor_id) is distinct from s.facturas_base then
      raise exception 'Las facturas cambiaron desde la solicitud. Rechaza esta propuesta y pide a Maite una nueva'; end if;
    for v_linea in select value from jsonb_array_elements(s.plan) loop
      v_factura:=(v_linea->>'factura_id')::uuid;
      if v_factura is null then
        -- Total cero: no incrementa compras ni inventario. El saldo nace del ajuste trazado abajo.
        insert into public.facturas_proveedor(proveedor_id,numero,fecha,total,saldo,nota,origen_registro,registrado_por)
          values(s.proveedor_id,'AJG-'||s.id::text,(now() at time zone 'America/Bogota')::date,0,
            (v_linea->>'saldo_nuevo')::numeric,'Ajuste de apertura autorizado: '||s.motivo,'ajuste_gerencia',auth.uid())
          returning id into v_factura;
      else
        update public.facturas_proveedor set saldo=(v_linea->>'saldo_nuevo')::numeric
          where id=v_factura and proveedor_id=s.proveedor_id;
      end if;
      insert into public.proveedores_ajustes_detalle(solicitud_id,factura_id,saldo_anterior,saldo_nuevo,diferencia)
        values(s.id,v_factura,(v_linea->>'saldo_anterior')::numeric,(v_linea->>'saldo_nuevo')::numeric,(v_linea->>'diferencia')::numeric);
    end loop;
    select coalesce(sum(saldo),0) into v_actual from public.facturas_proveedor where proveedor_id=s.proveedor_id;
    if v_actual is distinct from s.saldo_objetivo then raise exception 'El detalle no cuadra con el saldo objetivo; no se aplicó el ajuste'; end if;
    update public.proveedores_ajustes_solicitudes set estado='aplicado',decidido_por=auth.uid(),decidido_at=now() where id=p_id;
  end if;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(auth.uid()::text,case when p_aprobar then 'ajuste_proveedor_aprobado' else 'ajuste_proveedor_rechazado' end,
      'proveedores_ajustes_solicitudes',p_id::text,jsonb_build_object('proveedor_id',s.proveedor_id,
        'base',s.saldo_base,'objetivo',s.saldo_objetivo,'plan',s.plan,'preparado_por',s.preparado_por));
  return jsonb_build_object('id',p_id,'estado',case when p_aprobar then 'aplicado' else 'rechazado' end,'ya_decidido',false);
end $$;

create function public.preparar_ajuste_proveedor(p_id uuid,p_proveedor_id uuid,p_saldo_base numeric,p_saldo_objetivo numeric,p_motivo text)
returns jsonb language sql security invoker set search_path='' as $$
  select proveedores_control_private.preparar_ajuste(p_id,p_proveedor_id,p_saldo_base,p_saldo_objetivo,p_motivo);
$$;
create function public.decidir_ajuste_proveedor(p_id uuid,p_aprobar boolean,p_motivo_rechazo text default null)
returns jsonb language sql security invoker set search_path='' as $$
  select proveedores_control_private.decidir_ajuste(p_id,p_aprobar,p_motivo_rechazo);
$$;
revoke all on function proveedores_control_private.preparar_ajuste(uuid,uuid,numeric,numeric,text),
  proveedores_control_private.decidir_ajuste(uuid,boolean,text),
  public.preparar_ajuste_proveedor(uuid,uuid,numeric,numeric,text),public.decidir_ajuste_proveedor(uuid,boolean,text) from public,anon;
grant execute on function proveedores_control_private.preparar_ajuste(uuid,uuid,numeric,numeric,text),
  proveedores_control_private.decidir_ajuste(uuid,boolean,text),
  public.preparar_ajuste_proveedor(uuid,uuid,numeric,numeric,text),public.decidir_ajuste_proveedor(uuid,boolean,text) to authenticated;

-- Intencionalmente no se actualizan saldos ni se atribuyen aprobaciones a Maite/Óscar aquí.
-- Las retenciones previas incluidas en los saldos auditados no se vuelven a descontar.
