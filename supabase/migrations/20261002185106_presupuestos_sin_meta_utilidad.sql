-- La utilidad es un resultado observado, no una meta presupuestal.
-- Conservar columnas y registros anteriores como historia; no volver a escribirlos.

create function public.bloquear_meta_utilidad_presupuesto()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if (tg_op='INSERT' and new.meta_utilidad is not null and new.meta_utilidad<>0)
    or (tg_op='UPDATE' and new.meta_utilidad is distinct from old.meta_utilidad)
  then raise exception 'La utilidad no se presupuesta; es un resultado de las ventas'; end if;
  return new;
end $$;
revoke all on function public.bloquear_meta_utilidad_presupuesto() from public,anon,authenticated;
create trigger bloquear_meta_utilidad_presupuesto
before insert or update on public.presupuestos
for each row execute function public.bloquear_meta_utilidad_presupuesto();

revoke execute on function public.proponer_presupuesto_manual(text,date,text,numeric),
  public.guardar_presupuesto_manual(text,date,text,numeric),
  public.guardar_presupuesto_manual_general(text,date,numeric,numeric,numeric,numeric,numeric)
  from public,anon,authenticated;

create function presupuestos_control_private.proponer_retail_operativo(
  p_tienda text,p_mes date,p_metrica text,p_pct_crecimiento numeric
) returns table(fecha date,base_anterior numeric,meta_propuesta numeric,fuente text)
language plpgsql security definer set search_path='' as $$
begin
  if p_metrica is null or p_metrica not in ('meta_venta_total','meta_creditos','meta_uds_cel','meta_uds_acc')
  then raise exception 'La utilidad es un resultado, no una meta presupuestal'; end if;
  return query select * from public.proponer_presupuesto_manual(p_tienda,p_mes,p_metrica,p_pct_crecimiento);
end $$;

create function public.proponer_presupuesto_operativo(
  p_tienda text,p_mes date,p_metrica text,p_pct_crecimiento numeric
) returns table(fecha date,base_anterior numeric,meta_propuesta numeric,fuente text)
language sql security invoker set search_path='' as $$
  select * from presupuestos_control_private.proponer_retail_operativo(p_tienda,p_mes,p_metrica,p_pct_crecimiento);
$$;

create function presupuestos_control_private.guardar_retail_operativo(
  p_tienda text,p_mes date,p_metrica text,p_pct_crecimiento numeric
) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_metrica is null or p_metrica not in ('meta_venta_total','meta_creditos','meta_uds_cel','meta_uds_acc')
  then raise exception 'La utilidad es un resultado, no una meta presupuestal'; end if;
  return public.guardar_presupuesto_manual(p_tienda,p_mes,p_metrica,p_pct_crecimiento);
end $$;

create function public.guardar_presupuesto_operativo(
  p_tienda text,p_mes date,p_metrica text,p_pct_crecimiento numeric
) returns jsonb language sql security invoker set search_path='' as $$
  select presupuestos_control_private.guardar_retail_operativo(p_tienda,p_mes,p_metrica,p_pct_crecimiento);
$$;

create function presupuestos_control_private.guardar_retail_cuatro(
  p_tienda text,p_mes date,p_pct_ventas numeric,p_pct_creditos numeric,
  p_pct_celulares numeric,p_pct_accesorios numeric
) returns jsonb language plpgsql security definer set search_path='' as $$
declare metricas text[]:=array['meta_venta_total','meta_creditos','meta_uds_cel','meta_uds_acc'];
  porcentajes numeric[]:=array[p_pct_ventas,p_pct_creditos,p_pct_celulares,p_pct_accesorios];
  resultados jsonb:='[]'::jsonb; i integer;
begin
  if auth.uid() is null or public.rol_actual()<>'gerencia'
  then raise exception 'Solo Gerencia puede aprobar presupuestos'; end if;
  for i in 1..4 loop
    if porcentajes[i] is null or porcentajes[i]<0 or porcentajes[i]>1000
    then raise exception 'Todos los porcentajes deben estar entre 0 y 1000'; end if;
    resultados:=resultados||jsonb_build_array(public.guardar_presupuesto_manual(p_tienda,p_mes,metricas[i],porcentajes[i]));
  end loop;
  return jsonb_build_object('tienda',p_tienda,'mes',date_trunc('month',p_mes)::date,
    'indicadores',resultados,'aprobado_por',auth.uid());
end $$;

create function public.guardar_presupuesto_operativo_general(
  p_tienda text,p_mes date,p_pct_ventas numeric,p_pct_creditos numeric,
  p_pct_celulares numeric,p_pct_accesorios numeric
) returns jsonb language sql security invoker set search_path='' as $$
  select presupuestos_control_private.guardar_retail_cuatro(
    p_tienda,p_mes,p_pct_ventas,p_pct_creditos,p_pct_celulares,p_pct_accesorios);
$$;

revoke all on function presupuestos_control_private.proponer_retail_operativo(text,date,text,numeric),
  presupuestos_control_private.guardar_retail_operativo(text,date,text,numeric),
  presupuestos_control_private.guardar_retail_cuatro(text,date,numeric,numeric,numeric,numeric),
  public.proponer_presupuesto_operativo(text,date,text,numeric),
  public.guardar_presupuesto_operativo(text,date,text,numeric),
  public.guardar_presupuesto_operativo_general(text,date,numeric,numeric,numeric,numeric)
  from public,anon,authenticated;
grant execute on function presupuestos_control_private.proponer_retail_operativo(text,date,text,numeric),
  presupuestos_control_private.guardar_retail_operativo(text,date,text,numeric),
  presupuestos_control_private.guardar_retail_cuatro(text,date,numeric,numeric,numeric,numeric),
  public.proponer_presupuesto_operativo(text,date,text,numeric),
  public.guardar_presupuesto_operativo(text,date,text,numeric),
  public.guardar_presupuesto_operativo_general(text,date,numeric,numeric,numeric,numeric)
  to authenticated;

-- B2B deja de exigir una meta de utilidad. Las metas antiguas no se borran.
alter table public.b2b_presupuestos alter column meta_utilidad_neta drop not null;
revoke execute on function public.guardar_presupuesto_b2b(date,numeric,numeric,numeric,text,integer),
  presupuestos_control_private.guardar_b2b(date,numeric,numeric,numeric,text,integer)
  from public,anon,authenticated;

create function presupuestos_control_private.guardar_b2b_operativo(
  p_mes date,p_meta_ventas numeric,p_meta_unidades numeric,p_notas text,p_revision integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare anterior public.b2b_presupuestos%rowtype; nuevo public.b2b_presupuestos%rowtype;
begin
  if auth.uid() is null or not exists(select 1 from public.perfiles p
    where p.id=auth.uid() and p.activo and p.rol='gerencia')
  then raise exception 'Solo Gerencia activa puede guardar presupuestos B2B'; end if;
  if p_mes is null or not isfinite(p_mes) or extract(day from p_mes)<>1
    or p_revision is null or p_revision<0
    or p_meta_ventas is null or not(p_meta_ventas>=0 and p_meta_ventas<1000000000000000)
    or p_meta_ventas<>trunc(p_meta_ventas)
    or (p_meta_unidades is not null and
      (not(p_meta_unidades>=0 and p_meta_unidades<=2147483647) or p_meta_unidades<>trunc(p_meta_unidades)))
    or length(coalesce(p_notas,''))>1000
  then raise exception 'Revisa el mes, la meta de ventas y las unidades enteras opcionales'; end if;
  perform pg_advisory_xact_lock(hashtextextended('presupuesto-b2b:'||p_mes::text,0));
  select * into anterior from public.b2b_presupuestos where mes=p_mes for update;
  if found and anterior.actualizado_por=auth.uid() and anterior.revision in (p_revision,p_revision+1)
    and anterior.meta_ventas=p_meta_ventas and anterior.meta_unidades is not distinct from p_meta_unidades
    and anterior.notas=btrim(coalesce(p_notas,''))
  then return to_jsonb(anterior); end if;
  if coalesce(anterior.revision,0)<>p_revision
  then raise exception 'El presupuesto cambió desde que lo consultaste. Actualiza antes de guardar'; end if;
  insert into public.b2b_presupuestos(
    mes,meta_ventas,meta_utilidad_neta,meta_unidades,notas,revision,creado_por,actualizado_por)
  values(p_mes,p_meta_ventas,null,p_meta_unidades::integer,btrim(coalesce(p_notas,'')),1,auth.uid(),auth.uid())
  on conflict(mes) do update set meta_ventas=excluded.meta_ventas,
    meta_unidades=excluded.meta_unidades,notas=excluded.notas,
    revision=b2b_presupuestos.revision+1,actualizado_por=auth.uid(),actualizado_at=now()
  returning * into nuevo;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
  values(auth.uid()::text,'presupuesto_b2b_guardado','b2b_presupuestos',p_mes::text,
    jsonb_build_object('anterior',case when anterior.mes is not null then to_jsonb(anterior) else null end,
      'nuevo',to_jsonb(nuevo)));
  return to_jsonb(nuevo);
end $$;

create function public.guardar_presupuesto_b2b_operativo(
  p_mes date,p_meta_ventas numeric,p_meta_unidades numeric,p_notas text,p_revision integer
) returns jsonb language sql security invoker set search_path='' as $$
  select presupuestos_control_private.guardar_b2b_operativo(
    p_mes,p_meta_ventas,p_meta_unidades,p_notas,p_revision);
$$;

revoke all on function presupuestos_control_private.guardar_b2b_operativo(date,numeric,numeric,text,integer),
  public.guardar_presupuesto_b2b_operativo(date,numeric,numeric,text,integer)
  from public,anon,authenticated;
grant execute on function presupuestos_control_private.guardar_b2b_operativo(date,numeric,numeric,text,integer),
  public.guardar_presupuesto_b2b_operativo(date,numeric,numeric,text,integer)
  to authenticated;

notify pgrst, 'reload schema';
