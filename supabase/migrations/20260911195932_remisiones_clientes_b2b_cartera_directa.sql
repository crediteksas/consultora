-- Remisión financiera: descarga CENTRAL, sin inventario ni recepción en destino.
create schema if not exists remisiones_b2b_private;
revoke all on schema remisiones_b2b_private from public,anon,authenticated;
grant usage on schema remisiones_b2b_private to authenticated;
alter table public.remisiones drop constraint remisiones_estado_check;
alter table public.remisiones add constraint remisiones_estado_check check
 (estado in ('borrador','despachada','recibida','anulada','cartera_b2b'));
alter table public.unidades drop constraint unidades_estado_check;
alter table public.unidades add constraint unidades_estado_check check
 (estado in ('en_oscar','disponible','vendido','en_traslado','garantia_proveedor','anulado_reingreso','salida_b2b'));

create table remisiones_b2b_private.solicitudes(
 request_id uuid primary key, payload jsonb not null, resultado jsonb not null,
 usuario_id uuid not null, created_at timestamptz not null default now()
);
alter table remisiones_b2b_private.solicitudes enable row level security;
revoke all on remisiones_b2b_private.solicitudes from public,anon,authenticated;

-- Reutiliza exactamente el asignador de stock/facturas que ya se usa en tiendas.
alter function public.despachar_remision_desde_central(text,jsonb,text) set schema remisiones_b2b_private;
revoke all on function remisiones_b2b_private.despachar_remision_desde_central(text,jsonb,text) from public,anon,authenticated;

create function remisiones_b2b_private.despachar(p_destino text,p_items jsonb,p_nota text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_payload jsonb; v_previa record; v_resultado jsonb; v_id uuid; v_cuenta uuid; v_total numeric;
begin
 if auth.uid() is null or not remisiones_edicion_private.permitido() then raise exception 'Solo Maite o Gerencia puede remisionar a cartera B2B'; end if;
 if p_request_id is null then raise exception 'Falta identificador de solicitud'; end if;
 v_payload:=jsonb_build_object('destino',p_destino,'items',p_items,'nota',p_nota);
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into v_previa from remisiones_b2b_private.solicitudes where request_id=p_request_id;
 if found then
  if v_previa.payload is distinct from v_payload then raise exception 'Solicitud ya utilizada con otros datos'; end if;
  return v_previa.resultado;
 end if;
 select c.id into strict v_cuenta from public.cuentas_cartera c join public.origenes o on o.codigo=c.tienda_codigo
 where o.codigo=p_destino and o.tipo='cliente_b2b' and o.activo and c.tipo_cuenta='cliente_b2b' and c.activo;
 v_resultado:=remisiones_b2b_private.despachar_remision_desde_central(p_destino,p_items,p_nota);
 v_id:=(v_resultado->>'remision_id')::uuid;
 select sum(cantidad*precio_remision) into v_total from public.remision_items where remision_id=v_id;
 if coalesce(v_total,0)<=0 then raise exception 'Valor de remisión inválido'; end if;
 -- No se mueve la unidad a un inventario del cliente. Queda como salida histórica.
 update public.unidades u set estado='salida_b2b'
 from public.remision_items i where i.remision_id=v_id and u.remision_item_id=i.id and u.estado='en_traslado';
 insert into public.movimientos_cartera(cuenta_id,tienda_codigo,efecto,monto,concepto,referencia_tipo,referencia_id,fecha_efectiva,metadatos,creado_por)
 values(v_cuenta,p_destino,'debito',v_total,'Remisión B2B #'||(v_resultado->>'consecutivo'),
 'remision_cliente_b2b',v_id::text,(now() at time zone 'America/Bogota')::date,
 jsonb_build_object('remision_id',v_id,'unidad_negocio','b2b','sin_inventario_destino',true),auth.uid());
 update public.remisiones set estado='cartera_b2b' where id=v_id;
 v_resultado:=v_resultado||jsonb_build_object('cartera_cargada',true,'valor',v_total,'cliente_codigo',p_destino);
 insert into remisiones_b2b_private.solicitudes(request_id,payload,resultado,usuario_id) values(p_request_id,v_payload,v_resultado,auth.uid());
 return v_resultado;
end;
$$;
revoke all on function remisiones_b2b_private.despachar(text,jsonb,text,uuid) from public,anon;
grant execute on function remisiones_b2b_private.despachar(text,jsonb,text,uuid) to authenticated;
create function public.despachar_remision_cliente_b2b(p_destino text,p_items jsonb,p_nota text,p_request_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select remisiones_b2b_private.despachar(p_destino,p_items,p_nota,p_request_id);
$$;
revoke all on function public.despachar_remision_cliente_b2b(text,jsonb,text,uuid) from public,anon;
grant execute on function public.despachar_remision_cliente_b2b(text,jsonb,text,uuid) to authenticated;

-- Las llamadas previas de tiendas siguen funcionando, sin permitir saltarse el cargo B2B.
create function remisiones_b2b_private.despachar_tienda(p_tienda_codigo text,p_items jsonb,p_nota text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.es_central() then raise exception 'No autorizado'; end if;
 if exists(select 1 from public.origenes where codigo=p_tienda_codigo and tipo='cliente_b2b') then
  raise exception 'Usa la remisión a cartera B2B para este destinatario';
 end if;
 return remisiones_b2b_private.despachar_remision_desde_central(p_tienda_codigo,p_items,p_nota);
end; $$;
revoke all on function remisiones_b2b_private.despachar_tienda(text,jsonb,text) from public,anon;
grant execute on function remisiones_b2b_private.despachar_tienda(text,jsonb,text) to authenticated;
create function public.despachar_remision_desde_central(p_tienda_codigo text,p_items jsonb,p_nota text default null)
returns jsonb language sql security invoker set search_path='' as $$
 select remisiones_b2b_private.despachar_tienda(p_tienda_codigo,p_items,p_nota);
$$;
revoke all on function public.despachar_remision_desde_central(text,jsonb,text) from public,anon;
grant execute on function public.despachar_remision_desde_central(text,jsonb,text) to authenticated;
notify pgrst,'reload schema';
