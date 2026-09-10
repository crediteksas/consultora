-- Solicitud expresa de Gerencia: PVP desde ventas del 10/09/2026.
-- Conserva PAGAMOS y tarifas históricas; no recalcula ni modifica operaciones.
begin;
do $$
declare
  r public.krediya_price_rules%rowtype;
  n public.krediya_price_rules%rowtype;
  t record;
  antes text;
  despues text;
begin
  select md5(jsonb_build_array(
    (select jsonb_agg(to_jsonb(x) order by id) from public.liquidations x),
    (select jsonb_agg(to_jsonb(x) order by id) from public.liquidation_operations x),
    (select jsonb_agg(to_jsonb(x) order by id) from public.liquidation_calculations x),
    (select jsonb_agg(to_jsonb(x) order by id) from public.liquidation_bonuses x),
    (select jsonb_agg(to_jsonb(x) order by id) from public.payment_orders x)
  )::text) into antes;
  for t in select * from (values
    ('cf4d3326-c5cc-4964-9e0a-5dc84c9aecf1'::uuid,988800,990000,741600),
    ('e7183a14-95c3-4c5c-a8a2-ed893651e9d3'::uuid,722000,723000,534280),
    ('457ed215-c6e8-4c25-b749-a0ecef14bc92'::uuid,591500,592000,443625),
    ('5eab5932-81db-4424-a858-2fe4ea58e748'::uuid,591500,592000,443625),
    ('4e656211-0415-44b7-84cb-f98e590031d3'::uuid,646400,701500,484800),
    ('e311a53b-99bf-4df4-b3c3-196a8650b7f4'::uuid,750000,862500,562500),
    ('2e831d35-ba6f-49b4-bcff-e93c1ffe9d60'::uuid,704000,825000,528000),
    ('b2ce4d68-9dd7-47cb-97b1-b8391aac0d1d'::uuid,1024000,1049900,768000)
  ) as cambios(id,pvp_anterior,pvp_nuevo,pagamos)
  loop
    select * into strict r from public.krediya_price_rules where id=t.id for update;
    if not r.activo or r.vigente_hasta is not null or r.vigente_desde >= date '2026-09-10'
       or r.precio_venta<>t.pvp_anterior or r.pagamos<>t.pagamos then
      raise exception 'La tarifa cambió; revisar antes de aplicar: %',r.referencia;
    end if;
    update public.krediya_price_rules set vigente_hasta=date '2026-09-09',updated_at=clock_timestamp() where id=r.id;
    insert into public.krediya_price_rules(referencia_clave,referencia,codigo,precio_venta,pagamos,vigente_desde)
      values(r.referencia_clave,r.referencia,r.codigo,t.pvp_nuevo,r.pagamos,date '2026-09-10') returning * into n;
    insert into public.audit_log(accion,tabla,registro_id,detalle)
      values('krediya_tarifa_editada','krediya_price_rules',n.id::text,
        jsonb_build_object('anterior',to_jsonb(r),'nuevo',to_jsonb(n),
          'motivo','Gerencia confirma PVP desde hoy 10/09/2026, según informe de diferencias. PAGAMOS intacto. Tecno 128/4 pendiente de Krediya, excluido.',
          'origen','Solicitud expresa en conversación; ejecución administrativa'));
    if (select count(*) from public.krediya_price_rules where referencia_clave=r.referencia_clave and activo
        and vigente_desde<=date '2026-09-10' and (vigente_hasta is null or vigente_hasta>=date '2026-09-10'))<>1 then
      raise exception 'Vigencias ambiguas: %',r.referencia;
    end if;
  end loop;
  select md5(jsonb_build_array(
    (select jsonb_agg(to_jsonb(x) order by id) from public.liquidations x),
    (select jsonb_agg(to_jsonb(x) order by id) from public.liquidation_operations x),
    (select jsonb_agg(to_jsonb(x) order by id) from public.liquidation_calculations x),
    (select jsonb_agg(to_jsonb(x) order by id) from public.liquidation_bonuses x),
    (select jsonb_agg(to_jsonb(x) order by id) from public.payment_orders x)
  )::text) into despues;
  if antes is distinct from despues then raise exception 'Las liquidaciones y pagos no deben cambiar'; end if;
end $$;
commit;
