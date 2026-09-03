-- Resultado gerencial del histórico inicial.
-- Es informativo: no crea liquidaciones, bonos, pagos, soportes ni movimientos de caja.
alter table public.creditos_historicos_plataforma
  add column if not exists tipo_establecimiento text,
  add column if not exists valor_comercial_historico numeric(16,2),
  add column if not exists porcentaje_politica_historico numeric(8,6),
  add column if not exists pagamos_historico numeric(16,2),
  add column if not exists pago_neto_historico numeric(16,2),
  add column if not exists bonos_historicos numeric(16,2) not null default 0,
  add column if not exists utilidad_antes_bonos_historica numeric(16,2),
  add column if not exists calculo_historico_estado text,
  add column if not exists politica_historica_snapshot jsonb not null default '{}'::jsonb;

alter table public.creditos_historicos_plataforma drop constraint if exists creditos_historicos_tipo_establecimiento_check;
alter table public.creditos_historicos_plataforma add constraint creditos_historicos_tipo_establecimiento_check
  check (tipo_establecimiento is null or tipo_establecimiento in ('propia','aliado','no_reconocido'));

comment on column public.creditos_historicos_plataforma.utilidad_antes_bonos_historica is
  'Margen histórico calculado con la política actual, antes de bonos no presentes en los archivos fuente.';
comment on column public.creditos_historicos_plataforma.politica_historica_snapshot is
  'Trazabilidad del cálculo informativo. No autoriza ni genera pagos.';

update public.creditos_historicos_plataforma h
set tipo_establecimiento = case
      when lower(coalesce(o.tipo,'')) in ('propia','tienda','retail') then 'propia'
      when lower(coalesce(o.tipo,'')) in ('aliado','alianza') then 'aliado'
      else h.tipo_establecimiento end
from public.origenes o
where lower(regexp_replace(coalesce(h.establecimiento,''),'[^a-zA-Z0-9]+','','g')) =
      lower(regexp_replace(coalesce(o.nombre,''),'[^a-zA-Z0-9]+','','g'));

update public.creditos_historicos_plataforma
set tipo_establecimiento = case
  when upper(coalesce(establecimiento,'')) like 'CREDITEK%'
    or upper(coalesce(establecimiento,'')) like 'KREDISINU%'
    or upper(coalesce(establecimiento,'')) like 'OROCELL%' then 'propia'
  when nullif(btrim(coalesce(establecimiento,'')),'') is not null then 'aliado'
  else 'no_reconocido' end
where tipo_establecimiento is null;

update public.creditos_historicos_plataforma
set valor_comercial_historico = round(coalesce(monto_credito,0) + coalesce(cuota_inicial,0),2),
    porcentaje_politica_historico = case when tipo_establecimiento='propia' then 0.76 else 0.77 end,
    pagamos_historico = round((coalesce(monto_credito,0) + coalesce(cuota_inicial,0)) * (case when tipo_establecimiento='propia' then 0.76 else 0.77 end),2),
    pago_neto_historico = greatest(0, round((coalesce(monto_credito,0) + coalesce(cuota_inicial,0)) * (case when tipo_establecimiento='propia' then 0.76 else 0.77 end) - coalesce(cuota_inicial,0),2)),
    utilidad_antes_bonos_historica = round((coalesce(monto_credito,0) + coalesce(cuota_inicial,0)) - greatest(0,(coalesce(monto_credito,0) + coalesce(cuota_inicial,0)) * (case when tipo_establecimiento='propia' then 0.76 else 0.77 end) - coalesce(cuota_inicial,0)),2),
    calculo_historico_estado = case when tipo_establecimiento='no_reconocido' then 'estimado_tipo_no_reconocido' else 'calculado' end,
    politica_historica_snapshot = jsonb_build_object('motor','politica_actual_aplicada_retroactivamente','base','monto_credito_mas_cuota_inicial','porcentaje',case when tipo_establecimiento='propia' then 0.76 else 0.77 end,'bonos','no_disponibles_en_fuente','confirmada_por','gerencia','confirmada_el','2026-09-02')
where plataforma in ('payjoy','alo') and historico_inicial is true;

update public.creditos_historicos_plataforma
set valor_comercial_historico = case when nullif(datos_origen->>'precio','') is null then null else (datos_origen->>'precio')::numeric end,
    porcentaje_politica_historico = null,
    pagamos_historico = case when nullif(datos_origen->>'pagamos','') is null then null else (datos_origen->>'pagamos')::numeric end,
    pago_neto_historico = case when nullif(datos_origen->>'pagamos','') is null then null else greatest(0,(datos_origen->>'pagamos')::numeric-coalesce(cuota_inicial,0)) end,
    utilidad_antes_bonos_historica = case when nullif(datos_origen->>'pagamos','') is null then null else coalesce(monto_credito,0)-greatest(0,(datos_origen->>'pagamos')::numeric-coalesce(cuota_inicial,0)) end,
    calculo_historico_estado = case when nullif(datos_origen->>'precio','') is null or nullif(datos_origen->>'pagamos','') is null then 'pendiente_dato_fuente' else 'calculado_archivo' end,
    politica_historica_snapshot = jsonb_build_object('motor','krediya_archivo_historico','base','precio_y_pagamos_del_archivo','bonos','no_disponibles_en_fuente','confirmada_por','gerencia','confirmada_el','2026-09-02')
where plataforma='krediya' and historico_inicial is true;

create index if not exists creditos_historicos_tipo_establecimiento_idx on public.creditos_historicos_plataforma(tipo_establecimiento);
