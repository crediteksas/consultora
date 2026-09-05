-- Oscar supplied this tariff for the pending Krediya import, including August sales.
-- L=PVP; N=Pagamos; ally payable=N-inicial. Precio Sug is never a tariff input.
-- Repair only the artificial September start on the 52 source-traced rules.
-- No operation, calculation, approval or payment is changed here.
do $repair$
declare desde date; r public.krediya_price_rules%rowtype; anterior jsonb;
begin
 select min((o.operation_at at time zone 'America/Bogota')::date) into desde
 from public.liquidation_operations o join public.liquidations l on l.id=o.liquidation_id
 where o.plataforma='krediya' and o.reconocida and l.frozen_at is null
 and l.estado in ('importada','validada','con_novedades','calculada');
 if desde is null then return; end if;
 if (select count(*) from public.krediya_price_rules p where p.activo and p.vigente_hasta is null
 and exists(select 1 from public.audit_log a where a.registro_id=p.id::text
 and a.accion='tarifario_importado_fuente_autorizada'
 and a.detalle->>'sha256'='5af1c4d5cd0eea4b09f3d794bfc576e1fc74549cb0b828ffa5c5ea2eacfc1f68'
 and p.precio_venta=(a.detalle->>'pvp')::numeric and p.pagamos=(a.detalle->>'pagamos')::numeric))<>52 then
  raise exception 'El tarifario cambió desde su importación; no se altera la vigencia';
 end if;
 for r in select * from public.krediya_price_rules p where p.activo and p.vigente_hasta is null
 and p.vigente_desde=date '2026-09-01' and p.vigente_desde>desde
 and exists(select 1 from public.audit_log a where a.registro_id=p.id::text
 and a.accion='tarifario_importado_fuente_autorizada'
 and a.detalle->>'sha256'='5af1c4d5cd0eea4b09f3d794bfc576e1fc74549cb0b828ffa5c5ea2eacfc1f68')
 for update loop
  anterior:=to_jsonb(r);
  update public.krediya_price_rules set vigente_desde=desde,updated_at=now() where id=r.id;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
  values(null,'krediya_tarifario_vigencia_corregida','krediya_price_rules',r.id,
   jsonb_build_object('anterior',anterior,'vigente_desde',desde,
    'motivo','Tarifario entregado por Oscar para liquidar este lote: PVP columna L y Pagamos columna N, sin usar Precio Sug ni alterar valores. Giro al aliado = Pagamos menos inicial.'));
 end loop;
end $repair$;
