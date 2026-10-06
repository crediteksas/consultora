-- Documento inmutable: se genera en la misma transacción que las existencias.
-- Consecutivo independiente por tienda, sin reescribir conteos históricos.
begin;
create table inventario_control.ajuste_consecutivos (
  tienda_codigo text primary key references public.origenes(codigo),
  ultimo bigint not null check(ultimo>0)
);
create table inventario_control.ajuste_documentos (
  id uuid primary key default gen_random_uuid(),
  corte_id uuid not null unique references inventario_control.cortes(id),
  tienda_codigo text not null references public.origenes(codigo),
  consecutivo bigint not null check(consecutivo>0),
  numero text not null unique,
  detalle jsonb not null,
  creado_at timestamptz not null default clock_timestamp(),
  unique(tienda_codigo,consecutivo)
);
alter table inventario_control.ajuste_consecutivos enable row level security;
alter table inventario_control.ajuste_documentos enable row level security;
revoke all on inventario_control.ajuste_consecutivos,inventario_control.ajuste_documentos from public,anon,authenticated;

create function inventario_control.documentar_ajuste() returns trigger
language plpgsql security definer set search_path='' as $$
declare seq bigint; numero text; filas jsonb; totales jsonb;
begin
  if old.estado is not distinct from new.estado or new.estado not in ('aplicado','sin_diferencias')
    or new.base_conteo<>'corte_fijo' or coalesce((new.revision_fuente->>'solo_comparativo')::boolean,false) then
    return new;
  end if;
  if new.autorizado_por is null or new.autorizado_at is null then
    raise exception 'El documento de ajuste requiere autorización identificada';
  end if;
  if exists(select 1 from inventario_control.ajuste_documentos where corte_id=new.id) then
    raise exception 'Este corte ya tiene un documento de ajuste';
  end if;
  if exists(select 1 from inventario_control.lineas l where l.corte_id=new.id and l.diferencia<>0
    and (l.anterior is null or l.posterior is null or l.costo_tienda is null
      or l.costo_tienda<=0 or l.valor_ajuste is distinct from l.diferencia*l.costo_tienda)) then
    raise exception 'No se puede documentar un ajuste incompleto';
  end if;
  insert into inventario_control.ajuste_consecutivos(tienda_codigo,ultimo) values(new.tienda_codigo,1)
    on conflict(tienda_codigo) do update set ultimo=inventario_control.ajuste_consecutivos.ultimo+1
    returning ultimo into seq;
  numero:='AJ-'||new.tienda_codigo||'-'||lpad(seq::text,6,'0');
  select coalesce(jsonb_agg(to_jsonb(q) order by q.codigo,q.imei),'[]'::jsonb) into filas
    from (select l.codigo,l.nombre,l.producto_id,l.imei,l.cantidad_corte,l.cantidad_fisica,
      l.diferencia,l.anterior,l.posterior,l.costo_tienda,l.valor_ajuste,l.nota,d.clasificacion,
      (select coalesce(jsonb_agg(m.id order by m.id),'[]'::jsonb) from public.movimientos m
        where m.producto_id=l.producto_id and m.tienda_codigo=new.tienda_codigo
          and coalesce((select u.imei from public.unidades u where u.id=m.unidad_id),'')=l.imei
          and ((m.referencia_tipo='conteo_inventario' and m.referencia_id=new.id::text)
            or (m.referencia_tipo='salida_no_conforme' and exists(
              select 1 from inventario_control.no_conformes n where n.corte_id=new.id
                and n.producto_id=l.producto_id and n.imei=l.imei and n.id::text=m.referencia_id)))) movimientos
      from inventario_control.lineas l
      join inventario_control.linea_decisiones d on d.corte_id=l.corte_id
        and d.producto_id=l.producto_id and d.imei=l.imei
      where l.corte_id=new.id and l.diferencia<>0) q;
  if jsonb_array_length(filas)<>(select count(*) from inventario_control.lineas where corte_id=new.id and diferencia<>0)
    or exists(select 1 from jsonb_array_elements(filas) f where jsonb_array_length(f->'movimientos')<>1) then
    raise exception 'Falta vincular cada diferencia con su movimiento único';
  end if;
  select jsonb_build_object('referencias',count(*),
    'unidades_faltantes',coalesce(sum(-diferencia) filter(where diferencia<0),0),
    'unidades_sobrantes',coalesce(sum(diferencia) filter(where diferencia>0),0),
    'faltantes',coalesce(sum(-valor_ajuste) filter(where diferencia<0),0),
    'sobrantes',coalesce(sum(valor_ajuste) filter(where diferencia>0),0),
    'impacto_neto',coalesce(sum(valor_ajuste),0)) into totales
    from inventario_control.lineas where corte_id=new.id and diferencia<>0;
  insert into inventario_control.ajuste_documentos(corte_id,tienda_codigo,consecutivo,numero,detalle)
    values(new.id,new.tienda_codigo,seq,numero,jsonb_build_object(
      'numero',numero,'consecutivo',seq,'corte_id',new.id,'tienda_codigo',new.tienda_codigo,
      'tienda_nombre',new.tienda_nombre,'corte_at',new.corte_at,'estado',new.estado,
      'autorizado_por',new.autorizado_por,'autorizado_nombre',new.autorizado_nombre,
      'autorizado_at',new.autorizado_at,'motivo',new.motivo,'soporte',new.soporte,
      'archivo_nombre',new.archivo_nombre,'archivo_sha256',new.archivo_sha256,
      'totales',totales,'lineas',filas));
  return new;
end $$;
revoke all on function inventario_control.documentar_ajuste() from public,anon,authenticated;
create trigger documento_ajuste after update of estado on inventario_control.cortes
  for each row execute function inventario_control.documentar_ajuste();

create function inventario_control.documento_inmutable() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'El documento de ajuste y el cierre de utilidad son inmutables'; end $$;
revoke all on function inventario_control.documento_inmutable() from public,anon,authenticated;
create trigger ajuste_documento_inmutable before update or delete on inventario_control.ajuste_documentos
  for each row execute function inventario_control.documento_inmutable();
create trigger cierre_utilidad_inmutable before update or delete on inventario_control.cierres_utilidad
  for each row execute function inventario_control.documento_inmutable();

create function inventario_control.documento_api(p_accion text,p_datos jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.perfiles%rowtype; c inventario_control.cortes%rowtype;
  result jsonb; doc jsonb; authoriza boolean;
begin
  select * into p from public.perfiles where id=auth.uid() and activo;
  if not found then raise exception 'Sesión sin perfil activo'; end if;
  if p_accion is null or p_accion not in ('ver','aplicar') then raise exception 'Acción de ajuste desconocida'; end if;
  -- Reutiliza el acceso por tienda y la delegación vigente de los conteos.
  result:=inventario_control.api('ver',p_datos);
  select * into c from inventario_control.cortes where id=(p_datos->>'id')::uuid for update;
  result:=inventario_control.api('ver',p_datos);
  authoriza:=p.rol in ('gerencia','auditoria') and exists(
    select 1 from inventario_control.responsables where perfil_id=p.id);
  if p_accion='aplicar' then
    if not authoriza then raise exception 'Solo Mayte u Óscar pueden aplicar el ajuste de inventario'; end if;
    if not exists(select 1 from inventario_control.ajuste_documentos where corte_id=c.id) then
      result:=inventario_control.no_conformes_api('aplicar_conteo',p_datos);
    end if;
  end if;
  select d.detalle||jsonb_build_object('documento_id',d.id) into doc
    from inventario_control.ajuste_documentos d where d.corte_id=c.id;
  return result||jsonb_build_object('documento',doc,'puede_cerrar_utilidad',p.rol='gerencia');
end $$;
revoke all on function inventario_control.documento_api(text,jsonb) from public,anon;
grant execute on function inventario_control.documento_api(text,jsonb) to authenticated;
create function public.inventario_ajuste_documento(p_accion text,p_datos jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select inventario_control.documento_api(p_accion,p_datos);
$$;
revoke all on function public.inventario_ajuste_documento(text,jsonb) from public,anon;
grant execute on function public.inventario_ajuste_documento(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
