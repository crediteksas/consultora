-- Corrige el histórico: la cuota inicial ya está descontada del giro neto y no es utilidad.
alter table public.creditos_historicos_plataforma
  add column if not exists utilidad_neta_historica numeric(16,2);

with base as (
  select h.id,h.plataforma,h.tipo_establecimiento,h.establecimiento,h.fecha_credito,
    case when h.plataforma in ('payjoy','alo') then h.valor_comercial_historico-h.pagamos_historico
         else h.utilidad_antes_bonos_historica end as utilidad_bruta,
    row_number() over(partition by h.establecimiento order by h.fecha_credito,h.id) as secuencia,
    o.ejecutivo_id,e.esquema_comision,
    row_number() over(partition by h.id order by length(coalesce(o.nombre,'')) desc) as coincidencia
  from public.creditos_historicos_plataforma h
  left join public.origenes o on o.tipo='aliado' and (
    lower(unaccent(regexp_replace(h.establecimiento,'^(ALIADO |A )','','i'))) like '%'||lower(unaccent(o.nombre))||'%'
    or lower(unaccent(o.nombre)) like '%'||lower(unaccent(regexp_replace(h.establecimiento,'^(ALIADO |A )','','i')))||'%')
  left join public.ejecutivos e on e.id=o.ejecutivo_id
  where h.historico_inicial is true
), calc as (
  select *,case when tipo_establecimiento<>'aliado' then 0 else
    5000 + case
      when ejecutivo_id is null then 0
      when esquema_comision->>'tipo'='fijo' then (esquema_comision->>'valor')::numeric + 10000
      when esquema_comision->>'tipo'='fijo_mas_override' then (esquema_comision->>'valor_propio')::numeric
      when esquema_comision->>'tipo'='tiered_por_aliado' then
        (case when secuencia <= (esquema_comision->>'primeras_n')::int then esquema_comision->>'valor_primeras' else esquema_comision->>'valor_resto' end)::numeric + 10000
      else 0 end end as bono
  from base where coincidencia=1
)
update public.creditos_historicos_plataforma h
set utilidad_antes_bonos_historica=round(c.utilidad_bruta,2),
    bonos_historicos=round(c.bono,2),
    utilidad_neta_historica=round(c.utilidad_bruta-c.bono,2),
    calculo_historico_estado=case when c.tipo_establecimiento='aliado' and c.ejecutivo_id is null then 'pendiente_asociar_ejecutivo' else 'calculado_con_bonos' end,
    politica_historica_snapshot=h.politica_historica_snapshot||jsonb_build_object('formula_utilidad','valor_comercial_menos_pagamos_menos_bonos','bono_universal',5000,'bono_ejecutivo_asociado',c.ejecutivo_id)
from calc c where h.id=c.id;

create table if not exists public.aliados_gastos_operativos (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  plataforma text check(plataforma is null or plataforma in ('payjoy','alo','krediya')),
  liquidation_id uuid references public.liquidations(id),
  operation_id uuid references public.liquidation_operations(id),
  origen_codigo text,
  concepto text not null check(length(btrim(concepto))>=3),
  descripcion text,
  valor numeric(16,2) not null check(valor>0),
  soporte_path text,
  estado text not null default 'pendiente' check(estado in ('pendiente','aprobado','rechazado','anulado')),
  registrado_por uuid not null default auth.uid(),
  aprobado_por uuid,
  aprobado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.aliados_gastos_operativos enable row level security;
revoke all on public.aliados_gastos_operativos from anon,authenticated;
grant select on public.aliados_gastos_operativos to authenticated;
grant all on public.aliados_gastos_operativos to service_role;
create policy aliados_gastos_lectura on public.aliados_gastos_operativos for select to authenticated
using(exists(select 1 from public.perfiles p where p.id=(select auth.uid()) and p.activo));

create or replace function public.aliados_registrar_gasto(p_fecha date,p_plataforma text,p_origen_codigo text,p_concepto text,p_descripcion text,p_valor numeric,p_soporte_path text)
returns public.aliados_gastos_operativos language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.aliados_gastos_operativos%rowtype;
begin
 if not public.tiene_capacidad_aliados('revisor') then raise exception 'No autorizado para registrar gastos de Aliados'; end if;
 insert into public.aliados_gastos_operativos(fecha,plataforma,origen_codigo,concepto,descripcion,valor,soporte_path,registrado_por)
 values(coalesce(p_fecha,current_date),nullif(p_plataforma,''),nullif(btrim(p_origen_codigo),''),btrim(p_concepto),nullif(btrim(p_descripcion),''),p_valor,nullif(btrim(p_soporte_path),''),auth.uid()) returning * into v;
 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),'aliados_gasto_registrado','aliados_gastos_operativos',v.id,to_jsonb(v));
 return v;
end $$;
revoke all on function public.aliados_registrar_gasto(date,text,text,text,text,numeric,text) from public,anon;
grant execute on function public.aliados_registrar_gasto(date,text,text,text,text,numeric,text) to authenticated;

create or replace function public.aliados_decidir_gasto(p_id uuid,p_estado text)
returns public.aliados_gastos_operativos language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.aliados_gastos_operativos%rowtype;
begin
 if not public.tiene_capacidad_aliados('aprobador') then raise exception 'Solo Gerencia puede aprobar o rechazar gastos'; end if;
 if p_estado not in ('aprobado','rechazado','anulado') then raise exception 'Estado no permitido'; end if;
 update public.aliados_gastos_operativos set estado=p_estado,aprobado_por=auth.uid(),aprobado_at=now(),updated_at=now() where id=p_id and estado='pendiente' returning * into v;
 if v.id is null then raise exception 'Gasto no encontrado o ya decidido'; end if;
 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),'aliados_gasto_'||p_estado,'aliados_gastos_operativos',v.id,to_jsonb(v));
 return v;
end $$;
revoke all on function public.aliados_decidir_gasto(uuid,text) from public,anon;
grant execute on function public.aliados_decidir_gasto(uuid,text) to authenticated;

create policy soportes_aliados_gastos_insert on storage.objects for insert to authenticated
with check(bucket_id='soportes' and public.tiene_capacidad_aliados('revisor') and name ~ '^aliados/gastos/[0-9a-f-]{36}\.(pdf|jpg|jpeg|png)$');
create policy soportes_aliados_gastos_select on storage.objects for select to authenticated
using(bucket_id='soportes' and public.tiene_capacidad_aliados('revisor') and name ~ '^aliados/gastos/');
