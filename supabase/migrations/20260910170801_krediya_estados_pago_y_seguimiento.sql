-- Primera capa: elegibilidad y seguimiento. No registra reversiones financieras.
-- Las fuentes y los pagos anteriores son inmutables; no se inventa una devolución.
create or replace function kora_private.krediya_estado_fuente(p_data jsonb,p_campo text)
returns text language sql immutable set search_path='' as $$
 select lower(btrim(coalesce(
   p_data #>> array['movimientos','0','original',lower(p_campo)],
   p_data #>> array['movimientos','0','original','__original',p_campo],
   p_data #>> array['movimientos','0','original',p_campo],'')))
$$;
revoke all on function kora_private.krediya_estado_fuente(jsonb,text) from public,anon,authenticated;

create index if not exists krediya_credito_busqueda on public.liquidation_operations
 (lower(btrim(external_id))) where plataforma='krediya';

create or replace function kora_private.krediya_control_elegibilidad()
returns trigger language plpgsql security definer set search_path='' as $$
declare pago text; contrato text; anterior uuid; motivo text;
begin
 if new.plataforma<>'krediya' then return new; end if;
 pago:=kora_private.krediya_estado_fuente(new.normalized_data,'Estado del Pago');
 contrato:=kora_private.krediya_estado_fuente(new.normalized_data,'Estado del contrato');
 -- Serializar importaciones y activaciones del mismo contrato, también entre lotes.
 if nullif(btrim(new.external_id),'') is not null then
  perform pg_advisory_xact_lock(hashtextextended('krediya_credito:'||lower(btrim(new.external_id)),0));
  select o.id into anterior from public.liquidation_operations o
   join public.liquidations l on l.id=o.liquidation_id
   where o.plataforma='krediya' and o.id<>new.id and o.reconocida
    and lower(btrim(o.external_id))=lower(btrim(new.external_id)) and l.estado<>'anulada'
   order by o.created_at,o.id limit 1;
 end if;
 if contrato='anulado' and anterior is not null then motivo:='krediya_anulacion_por_conciliar';
 elsif pago='pendiente' then motivo:='krediya_pago_pendiente';
 elsif contrato<>'firmado' or pago<>'pagado' or nullif(btrim(new.external_id),'') is null then motivo:='krediya_estado_por_validar';
 elsif anterior is not null then motivo:='krediya_credito_ya_registrado';
 end if;
 if motivo is not null then
  new.reconocida:=false;
  new.normalized_data:=coalesce(new.normalized_data,'{}'::jsonb)||jsonb_build_object(
   'seguimientoPagoKrediya',motivo,'operacionAnteriorKrediya',anterior);
 else
  -- No promover automáticamente: los demás controles de la importación siguen vigentes.
  new.normalized_data:=coalesce(new.normalized_data,'{}'::jsonb)-'seguimientoPagoKrediya'-'operacionAnteriorKrediya';
 end if;
 return new;
end $$;
revoke all on function kora_private.krediya_control_elegibilidad() from public,anon,authenticated;
create trigger krediya_control_elegibilidad before insert or update of reconocida,normalized_data,external_id
 on public.liquidation_operations for each row execute function kora_private.krediya_control_elegibilidad();

create or replace function kora_private.krediya_descripcion_seguimiento(p_tipo text,p_credito text,p_anterior text)
returns text language sql immutable set search_path='' as $$
 select 'Crédito '||coalesce(p_credito,'sin identificador')||'. '||case p_tipo
 when 'krediya_pago_pendiente' then 'Krediya lo reporta PENDIENTE. No genera pago al aliado, bonos pagables ni utilidad disponible. Gestión: consultar con Krediya y verificarlo en el próximo archivo. No bloquea las demás operaciones.'
 when 'krediya_anulacion_por_conciliar' then 'El contrato figura ANULADO y existe una operación anterior ('||coalesce(p_anterior,'')||'). Requiere conciliar la anulación con esa operación. No se ha registrado recuperación ni reversado dinero automáticamente.'
 when 'krediya_credito_ya_registrado' then 'Ya existe una operación reconocida ('||coalesce(p_anterior,'')||'). Se conserva esta fila como evidencia, sin duplicar cálculo, bonos ni pagos.'
 else 'No consta FIRMADO y PAGADO en el archivo. Gestión: confirmar el estado con Krediya. Esta operación no genera nuevos pagos; las demás continúan.' end
$$;
revoke all on function kora_private.krediya_descripcion_seguimiento(text,text,text) from public,anon,authenticated;

create or replace function kora_private.krediya_registrar_seguimiento()
returns trigger language plpgsql security definer set search_path='' as $$
declare motivo text;
begin
 if new.plataforma<>'krediya' then return new; end if;
 motivo:=new.normalized_data->>'seguimientoPagoKrediya';
 if motivo is not null then
  insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion,bloquea_aprobacion)
   values(new.liquidation_id,new.id,motivo,kora_private.krediya_descripcion_seguimiento(motivo,new.external_id,new.normalized_data->>'operacionAnteriorKrediya'),false)
   on conflict(liquidation_id,operation_id,tipo) do update
    set descripcion=excluded.descripcion,bloquea_aprobacion=false;
 elsif new.reconocida then
  update public.liquidation_incidents i set estado='resuelta',resolved_at=now(),resolved_by=auth.uid(),
   resolution='El crédito reapareció FIRMADO y PAGADO en el lote '||new.liquidation_id||'. Se conserva la fecha de venta y el registro anterior.'
   from public.liquidation_operations o where i.operation_id=o.id and i.tipo='krediya_pago_pendiente'
    and i.estado='abierta' and o.plataforma='krediya' and lower(btrim(o.external_id))=lower(btrim(new.external_id));
 end if;
 return new;
end $$;
revoke all on function kora_private.krediya_registrar_seguimiento() from public,anon,authenticated;
create trigger krediya_registrar_seguimiento after insert on public.liquidation_operations
 for each row execute function kora_private.krediya_registrar_seguimiento();

-- El RPC antiguo también puede enviar la alerta genérica: consolidarla sin pedir justificación.
create or replace function kora_private.krediya_incidente_estado()
returns trigger language plpgsql security definer set search_path='' as $$
declare o public.liquidation_operations%rowtype; motivo text;
begin
 select * into o from public.liquidation_operations where id=new.operation_id and plataforma='krediya';
 if not found then return new; end if;
 motivo:=o.normalized_data->>'seguimientoPagoKrediya';
 if motivo is not null and new.tipo in ('operacion_no_reconocida','krediya_pago_pendiente','krediya_estado_por_validar','krediya_credito_ya_registrado','krediya_anulacion_por_conciliar') then
  new.tipo:=motivo;new.bloquea_aprobacion:=false;
  new.descripcion:=kora_private.krediya_descripcion_seguimiento(motivo,o.external_id,o.normalized_data->>'operacionAnteriorKrediya');
 end if;
 return new;
end $$;
revoke all on function kora_private.krediya_incidente_estado() from public,anon,authenticated;
create trigger krediya_incidente_estado before insert or update on public.liquidation_incidents
 for each row execute function kora_private.krediya_incidente_estado();

-- Backfill acotado: solo pendientes explícitos SIN cálculo, bono ni pago, en lotes editables.
do $$
declare o record;
begin
 for o in select lo.id from public.liquidation_operations lo join public.liquidations l on l.id=lo.liquidation_id
  where lo.plataforma='krediya' and not lo.reconocida and l.frozen_at is null
   and l.estado in ('importada','validada','con_novedades')
   and kora_private.krediya_estado_fuente(lo.normalized_data,'Estado del Pago')='pendiente'
   and not exists(select 1 from public.liquidation_calculations where operation_id=lo.id)
   and not exists(select 1 from public.liquidation_bonuses where operation_id=lo.id)
   and not exists(select 1 from public.payment_items where operation_id=lo.id)
 loop
  update public.liquidation_operations set reconocida=false where id=o.id;
  update public.liquidation_incidents set descripcion=descripcion where operation_id=o.id and tipo='operacion_no_reconocida' and estado='abierta';
  insert into public.audit_log(accion,tabla,registro_id,detalle)
   values('krediya_pendiente_reclasificado','liquidation_operations',o.id,jsonb_build_object('motivo','Estado del Pago PENDIENTE; sin movimientos financieros','migracion','krediya_estados_pago_y_seguimiento'));
 end loop;
end $$;
