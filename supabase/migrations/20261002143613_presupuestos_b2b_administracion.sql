-- Metas administrativas de B2B, independientes de Retail y Aliados.
-- No se cargan importes ni se modifican saldos, ventas, gastos o pagos.
create schema if not exists presupuestos_control_private;
revoke all on schema presupuestos_control_private from public,anon;
grant usage on schema presupuestos_control_private to authenticated;

create table public.b2b_presupuestos (
  mes date primary key check (extract(day from mes)=1),
  meta_ventas numeric(18,0) not null check (meta_ventas>=0 and meta_ventas<1000000000000000),
  meta_utilidad_neta numeric(18,0) not null check (meta_utilidad_neta between -999999999999999 and 999999999999999),
  meta_unidades integer check (meta_unidades>=0),
  notas text not null default '' check (length(notas)<=1000),
  revision integer not null default 1 check (revision>0),
  creado_por uuid not null references public.perfiles(id),
  creado_at timestamptz not null default now(),
  actualizado_por uuid not null references public.perfiles(id),
  actualizado_at timestamptz not null default now()
);
create index b2b_presupuestos_creador on public.b2b_presupuestos(creado_por);
create index b2b_presupuestos_editor on public.b2b_presupuestos(actualizado_por);
alter table public.b2b_presupuestos enable row level security;
revoke all on public.b2b_presupuestos from public,anon,authenticated;
grant select on public.b2b_presupuestos to authenticated;
create policy b2b_presupuestos_lectura on public.b2b_presupuestos for select to authenticated using (
  exists(select 1 from public.perfiles p where p.id=(select auth.uid()) and p.activo and p.rol in ('gerencia','auditoria'))
);

create function presupuestos_control_private.guardar_b2b(
  p_mes date,p_meta_ventas numeric,p_meta_utilidad_neta numeric,p_meta_unidades numeric,p_notas text,p_revision integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_anterior public.b2b_presupuestos%rowtype; v_nuevo public.b2b_presupuestos%rowtype;
begin
  if auth.uid() is null or not exists(select 1 from public.perfiles p where p.id=auth.uid() and p.activo and p.rol='gerencia')
  then raise exception 'Solo Gerencia activa puede guardar presupuestos B2B'; end if;
  if p_mes is null or not isfinite(p_mes) or extract(day from p_mes)<>1
    or p_revision is null or p_revision<0
    or p_meta_ventas is null or not(p_meta_ventas>=0 and p_meta_ventas<1000000000000000) or p_meta_ventas<>trunc(p_meta_ventas)
    or p_meta_utilidad_neta is null or not(p_meta_utilidad_neta between -999999999999999 and 999999999999999) or p_meta_utilidad_neta<>trunc(p_meta_utilidad_neta)
    or (p_meta_unidades is not null and (not(p_meta_unidades>=0 and p_meta_unidades<=2147483647) or p_meta_unidades<>trunc(p_meta_unidades)))
    or length(coalesce(p_notas,''))>1000
  then raise exception 'Revisa el mes, las metas en pesos enteros y las unidades enteras opcionales'; end if;
  perform pg_advisory_xact_lock(hashtextextended('presupuesto-b2b:'||p_mes::text,0));
  select * into v_anterior from public.b2b_presupuestos where mes=p_mes for update;
  -- Reintentar exactamente el mismo guardado no duplica la revisión ni la auditoría.
  if found and v_anterior.actualizado_por=auth.uid() and v_anterior.revision in (p_revision,p_revision+1)
    and v_anterior.meta_ventas=p_meta_ventas and v_anterior.meta_utilidad_neta=p_meta_utilidad_neta
    and v_anterior.meta_unidades is not distinct from p_meta_unidades and v_anterior.notas=btrim(coalesce(p_notas,''))
  then return to_jsonb(v_anterior); end if;
  if coalesce(v_anterior.revision,0)<>p_revision then
    raise exception 'El presupuesto cambió desde que lo consultaste. Actualiza antes de guardar'; end if;
  insert into public.b2b_presupuestos(mes,meta_ventas,meta_utilidad_neta,meta_unidades,notas,revision,creado_por,actualizado_por)
    values(p_mes,p_meta_ventas,p_meta_utilidad_neta,p_meta_unidades::integer,btrim(coalesce(p_notas,'')),1,auth.uid(),auth.uid())
    on conflict(mes) do update set meta_ventas=excluded.meta_ventas,meta_utilidad_neta=excluded.meta_utilidad_neta,
      meta_unidades=excluded.meta_unidades,notas=excluded.notas,revision=b2b_presupuestos.revision+1,
      actualizado_por=auth.uid(),actualizado_at=now()
    returning * into v_nuevo;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(auth.uid()::text,'presupuesto_b2b_guardado','b2b_presupuestos',p_mes::text,
      jsonb_build_object('anterior',case when v_anterior.mes is not null then to_jsonb(v_anterior) else null end,'nuevo',to_jsonb(v_nuevo)));
  return to_jsonb(v_nuevo);
end $$;
create function public.guardar_presupuesto_b2b(
  p_mes date,p_meta_ventas numeric,p_meta_utilidad_neta numeric,p_meta_unidades numeric,p_notas text,p_revision integer
) returns jsonb language sql security invoker set search_path='' as $$
  select presupuestos_control_private.guardar_b2b(p_mes,p_meta_ventas,p_meta_utilidad_neta,p_meta_unidades,p_notas,p_revision);
$$;
revoke all on function presupuestos_control_private.guardar_b2b(date,numeric,numeric,numeric,text,integer),
  public.guardar_presupuesto_b2b(date,numeric,numeric,numeric,text,integer) from public,anon,authenticated;
grant execute on function presupuestos_control_private.guardar_b2b(date,numeric,numeric,numeric,text,integer),
  public.guardar_presupuesto_b2b(date,numeric,numeric,numeric,text,integer) to authenticated;
