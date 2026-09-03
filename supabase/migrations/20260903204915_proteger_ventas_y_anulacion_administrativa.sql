begin;

create table public.venta_ajustes_administrativos (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references public.ventas(id),
  tipo text not null check (tipo in ('correccion_datos','anulacion')),
  motivo text not null check (length(btrim(motivo)) >= 10),
  estado text not null default 'aplicado' check (estado in ('aplicado','revertido')),
  valores_anteriores jsonb not null,
  valores_nuevos jsonb not null,
  usuario_id uuid not null references public.perfiles(id),
  created_at timestamptz not null default now()
);

comment on table public.venta_ajustes_administrativos is
  'Bitácora inmutable de correcciones y anulaciones administrativas de ventas.';

create index venta_ajustes_administrativos_venta_idx
  on public.venta_ajustes_administrativos(venta_id, created_at desc);

alter table public.venta_ajustes_administrativos enable row level security;
grant select on public.venta_ajustes_administrativos to authenticated;
grant all on public.venta_ajustes_administrativos to service_role;

create policy "central consulta ajustes de ventas"
on public.venta_ajustes_administrativos for select to authenticated
using ((select public.es_central()));

create policy "tienda consulta ajustes de sus ventas"
on public.venta_ajustes_administrativos for select to authenticated
using (exists (
  select 1 from public.ventas v
  where v.id = venta_id and v.tienda_codigo = (select public.tienda_actual())
));

create or replace function public.proteger_registro_venta_confirmada()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
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
$$;

revoke all on function public.proteger_registro_venta_confirmada() from public, anon, authenticated;

drop trigger if exists ventas_confirmadas_inmutables on public.ventas;
create trigger ventas_confirmadas_inmutables
before update or delete on public.ventas
for each row execute function public.proteger_registro_venta_confirmada();

drop trigger if exists venta_items_confirmados_inmutables on public.venta_items;
create trigger venta_items_confirmados_inmutables
before update or delete on public.venta_items
for each row execute function public.proteger_registro_venta_confirmada();

create or replace function public.corregir_venta_administrativa(
  p_venta_id uuid,
  p_motivo text,
  p_cambios jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_venta public.ventas%rowtype;
  v_credito public.creditos%rowtype;
  v_antes jsonb;
  v_despues jsonb;
  v_ajuste_id uuid;
  v_cliente uuid;
  v_nota text;
begin
  if (select public.rol_actual()) not in ('gerencia','auditoria') then
    raise exception 'Solo Gerencia o Auditoría pueden corregir ventas confirmadas';
  end if;
  if p_motivo is null or length(btrim(p_motivo)) < 10 then
    raise exception 'Explica el motivo de la corrección (mínimo 10 caracteres)';
  end if;
  if p_cambios is null or jsonb_typeof(p_cambios) <> 'object' then
    raise exception 'No se recibieron cambios administrativos válidos';
  end if;
  if p_cambios ?| array['total','fecha','tienda_codigo','vendedor','tipo','items','productos','precio_venta','costo'] then
    raise exception 'Productos, cantidades, precios, costos y fecha no se editan. Anula la venta y registra la correcta.';
  end if;

  select * into v_venta from public.ventas where id = p_venta_id for update;
  if not found then raise exception 'Venta no encontrada'; end if;
  if coalesce(v_venta.anulada,false) then raise exception 'La venta ya está anulada'; end if;
  select * into v_credito from public.creditos where venta_id = p_venta_id for update;

  v_antes := jsonb_build_object('venta',to_jsonb(v_venta),'credito',case when v_credito.id is null then null else to_jsonb(v_credito) end);
  v_cliente := case when p_cambios ? 'cliente_id' and nullif(p_cambios->>'cliente_id','') is not null
    then (p_cambios->>'cliente_id')::uuid else v_venta.cliente_id end;
  v_nota := case when p_cambios ? 'nota' then nullif(btrim(p_cambios->>'nota'),'') else v_venta.nota end;

  perform set_config('app.ajuste_venta_autorizado','1',true);
  update public.ventas set cliente_id = v_cliente, nota = v_nota where id = p_venta_id;

  if v_credito.id is not null and p_cambios ? 'credito' then
    if v_credito.estado_conciliacion <> 'pendiente' then
      raise exception 'El crédito ya fue conciliado o presenta novedad; corrígelo desde Conciliación';
    end if;
    update public.creditos set
      contrato_ref = case when (p_cambios->'credito') ? 'contrato_ref' then nullif(btrim(p_cambios->'credito'->>'contrato_ref'),'') else contrato_ref end,
      plazo_meses = case when (p_cambios->'credito') ? 'plazo_meses' then (p_cambios->'credito'->>'plazo_meses')::int else plazo_meses end
    where id = v_credito.id;
  end if;

  select jsonb_build_object('venta',to_jsonb(v),'credito',case when c.id is null then null else to_jsonb(c) end)
  into v_despues from public.ventas v left join public.creditos c on c.venta_id=v.id where v.id=p_venta_id;

  insert into public.venta_ajustes_administrativos
    (venta_id,tipo,motivo,valores_anteriores,valores_nuevos,usuario_id)
  values (p_venta_id,'correccion_datos',btrim(p_motivo),v_antes,v_despues,auth.uid())
  returning id into v_ajuste_id;

  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
  values (auth.uid()::text,'CORREGIR_VENTA_ADMINISTRATIVA','ventas',p_venta_id::text,
    jsonb_build_object('ajuste_id',v_ajuste_id,'motivo',btrim(p_motivo),'antes',v_antes,'despues',v_despues));
  return jsonb_build_object('ok',true,'ajuste_id',v_ajuste_id,'venta_id',p_venta_id);
end;
$$;

create or replace function public.anular_venta_administrativa(
  p_venta_id uuid,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_venta public.ventas%rowtype;
  v_item record;
  v_mov record;
  v_antes jsonb;
  v_despues jsonb;
  v_ajuste_id uuid;
begin
  if (select public.rol_actual()) not in ('gerencia','auditoria') then
    raise exception 'Solo Gerencia o Auditoría pueden anular ventas';
  end if;
  if p_motivo is null or length(btrim(p_motivo)) < 10 then
    raise exception 'Explica el motivo de la anulación (mínimo 10 caracteres)';
  end if;
  select * into v_venta from public.ventas where id=p_venta_id for update;
  if not found then raise exception 'Venta no encontrada'; end if;
  if coalesce(v_venta.anulada,false) then raise exception 'La venta ya está anulada'; end if;

  select jsonb_build_object(
    'venta',to_jsonb(v_venta),
    'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.id) from public.venta_items i where i.venta_id=p_venta_id),'[]'::jsonb),
    'credito',(select to_jsonb(c) from public.creditos c where c.venta_id=p_venta_id)
  ) into v_antes;

  perform set_config('app.ajuste_venta_autorizado','1',true);
  for v_item in select * from public.venta_items where venta_id=p_venta_id order by id for update loop
    if v_item.unidad_id is not null then
      update public.unidades set estado='disponible' where id=v_item.unidad_id and estado='vendido';
    else
      insert into public.stock_cantidad(producto_id,tienda_codigo,cantidad,costo_promedio,updated_at)
      values(v_item.producto_id,v_venta.tienda_codigo,v_item.cantidad,v_item.costo_congelado,now())
      on conflict(producto_id,tienda_codigo) do update
      set cantidad=public.stock_cantidad.cantidad+excluded.cantidad,updated_at=now();
    end if;

    select * into v_mov from public.movimientos
    where referencia_tipo='venta' and referencia_id=p_venta_id::text
      and producto_id=v_item.producto_id and unidad_id is not distinct from v_item.unidad_id
    order by created_at,id limit 1;
    insert into public.movimientos(tipo,tienda_codigo,producto_id,unidad_id,cantidad,costo,precio,referencia_tipo,referencia_id,reverso_de,usuario,nota)
    values('ajuste_entrada',v_venta.tienda_codigo,v_item.producto_id,v_item.unidad_id,v_item.cantidad,
      v_item.costo_congelado,v_item.precio_venta,'anulacion_venta',p_venta_id::text,v_mov.id,auth.uid(),btrim(p_motivo));
  end loop;

  update public.ventas set anulada=true,
    nota=concat_ws(E'\n',nullif(nota,''),'ANULADA: '||btrim(p_motivo)) where id=p_venta_id;
  select to_jsonb(v) into v_despues from public.ventas v where id=p_venta_id;

  insert into public.venta_ajustes_administrativos
    (venta_id,tipo,motivo,valores_anteriores,valores_nuevos,usuario_id)
  values(p_venta_id,'anulacion',btrim(p_motivo),v_antes,jsonb_build_object('venta',v_despues),auth.uid())
  returning id into v_ajuste_id;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
  values(auth.uid()::text,'ANULAR_VENTA_ADMINISTRATIVA','ventas',p_venta_id::text,
    jsonb_build_object('ajuste_id',v_ajuste_id,'motivo',btrim(p_motivo),'antes',v_antes,'despues',v_despues));
  return jsonb_build_object('ok',true,'ajuste_id',v_ajuste_id,'venta_id',p_venta_id,'consecutivo',v_venta.consecutivo);
end;
$$;

revoke all on function public.corregir_venta_administrativa(uuid,text,jsonb) from public,anon;
revoke all on function public.anular_venta_administrativa(uuid,text) from public,anon;
grant execute on function public.corregir_venta_administrativa(uuid,text,jsonb) to authenticated;
grant execute on function public.anular_venta_administrativa(uuid,text) to authenticated;

commit;
