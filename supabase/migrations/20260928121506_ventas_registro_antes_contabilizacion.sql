begin;

-- Registro comercial inmediato, contabilización posterior. La misma venta
-- conserva número, identidad y precios al recibir el visto bueno.
alter table public.ventas_autorizaciones add column consecutivo_venta bigint;
update public.ventas_autorizaciones set consecutivo_venta=case
 when resultado->>'consecutivo' is not null then (resultado->>'consecutivo')::bigint
 else nextval(pg_get_serial_sequence('public.ventas','consecutivo')::regclass) end;
alter table public.ventas_autorizaciones alter column consecutivo_venta set not null;
create unique index ventas_autorizaciones_numero on public.ventas_autorizaciones(consecutivo_venta);
update public.ventas_autorizaciones set resultado=resultado||jsonb_build_object(
 'consecutivo',consecutivo_venta,'registro_id',id,'registrada',true,
 'contabilizada',estado in ('registrada','aprobada'),
 'venta_id',coalesce(resultado->>'venta_id',id::text));
comment on table public.ventas_autorizaciones is 'Registro comercial de ventas a precios ingresados. Pendiente/rechazada permanece registrada sin contabilizar; el visto bueno genera los efectos contables.';

do $$
declare d text;
begin
 d:=pg_get_functiondef('kora_private.registrar_venta_autorizada_interno(text,text,uuid,jsonb,jsonb,text,uuid)'::regprocedure);
 if position('p_vendedor uuid DEFAULT NULL::uuid' in d)=0
 or position('insert into ventas (tienda_codigo, vendedor, tipo, cliente_id, total, anulada, nota)' in d)=0
 or position('values (p_tienda_codigo, p_vendedor, p_tipo, p_cliente_id, 0, false, p_nota)' in d)=0 then
 raise exception 'El motor de contabilización cambió; revisar firma e inserción';end if;
 d:=replace(d,'kora_private.registrar_venta_autorizada_interno(', 'kora_private.contabilizar_venta_registrada(');
 d:=replace(d,'p_vendedor uuid DEFAULT NULL::uuid','p_vendedor uuid DEFAULT NULL::uuid, p_registro_id uuid DEFAULT NULL::uuid, p_numero bigint DEFAULT NULL::bigint');
 d:=replace(d,'insert into ventas (tienda_codigo, vendedor, tipo, cliente_id, total, anulada, nota)',
 'insert into ventas (id, consecutivo, tienda_codigo, vendedor, tipo, cliente_id, total, anulada, nota)');
 d:=replace(d,'values (p_tienda_codigo, p_vendedor, p_tipo, p_cliente_id, 0, false, p_nota)',
 'overriding system value values (p_registro_id, p_numero, p_tienda_codigo, p_vendedor, p_tipo, p_cliente_id, 0, false, p_nota)');
 execute d;
end $$;
revoke all on function kora_private.contabilizar_venta_registrada(text,text,uuid,jsonb,jsonb,text,uuid,uuid,bigint) from public,anon,authenticated;

do $$
declare d text; old text;
begin
 d:=pg_get_functiondef('public.registrar_venta_con_autorizacion(uuid,text,text,uuid,jsonb,jsonb,text)'::regprocedure);
 old:='resultado:=jsonb_build_object(''ok'',true,''estado'',''pendiente'',''solicitud_id'',p_solicitud_id,''total'',revision->''total'');';
 if position(old in d)=0 then raise exception 'Cambió el registro pendiente';end if;
 d:=replace(d,old,$rep$resultado:=jsonb_build_object('ok',true,'estado','pendiente','solicitud_id',p_solicitud_id,
 'venta_id',p_solicitud_id,'total',revision->'total','consecutivo',nextval(pg_get_serial_sequence('public.ventas','consecutivo')::regclass));$rep$);
 old:='insert into public.ventas_autorizaciones(id,tienda_codigo,creado_por,tipo,cliente_id,items,credito,nota,detalle,total,estado,resultado)';
 if position(old in d)=0 then raise exception 'Cambió la persistencia del registro';end if;
 d:=replace(d,old,$rep$resultado:=resultado||jsonb_build_object('registro_id',p_solicitud_id,'registrada',true,'contabilizada',resultado->>'estado'='registrada');
 insert into public.ventas_autorizaciones(id,tienda_codigo,creado_por,tipo,cliente_id,items,credito,nota,detalle,total,estado,resultado,consecutivo_venta)$rep$);
 old:='revision->''detalle'',(revision->>''total'')::numeric,resultado->>''estado'',resultado);';
 if position(old in d)=0 then raise exception 'Cambió el detalle del registro';end if;
 d:=replace(d,old,'revision->''detalle'',(revision->>''total'')::numeric,resultado->>''estado'',resultado,(resultado->>''consecutivo'')::bigint);');
 execute d;

 d:=pg_get_functiondef('public.resolver_autorizacion_venta(uuid,boolean,text)'::regprocedure);
 old:='kora_private.registrar_venta_autorizada_interno(r.tienda_codigo,r.tipo,r.cliente_id,r.items,r.credito,r.nota,r.creado_por)';
 if position(old in d)=0 then raise exception 'Cambió la autorización de venta';end if;
 d:=replace(d,old,'kora_private.contabilizar_venta_registrada(r.tienda_codigo,r.tipo,r.cliente_id,r.items,r.credito,r.nota,r.creado_por,r.id,r.consecutivo_venta)');
 old:='update public.ventas_autorizaciones set estado=resolucion.resultado->>''estado''';
 if position(old in d)=0 then raise exception 'Cambió el resultado de autorización';end if;
 d:=replace(d,old,$rep$resultado:=resultado||jsonb_build_object('consecutivo',r.consecutivo_venta,'venta_id',r.id,'registro_id',r.id,'registrada',true,'contabilizada',p_aprobar);
 update public.ventas_autorizaciones set estado=resolucion.resultado->>'estado'$rep$);
 execute d;
end $$;

create function public.listar_ventas_registradas_sin_contabilizar(p_desde date default null,p_hasta date default null,p_tienda text default null,p_id uuid default null)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
 'id',r.id,'registro_id',r.id,'consecutivo',r.consecutivo_venta,'fecha',(r.creado_en at time zone 'America/Bogota')::date,
 'created_at',r.creado_en,'tienda_codigo',r.tienda_codigo,'tipo',r.tipo,'total',r.total,'nota',r.nota,
 'anulada',false,'sin_contabilizar',true,'estado_contabilizacion',r.estado,'motivo',r.motivo,
 'clientes',case when c.id is not null then jsonb_build_object('nombre_completo',c.nombre_completo,'cedula',c.cedula) end,
 'origen',jsonb_build_object('nombre',o.nombre),'vendedor_perfil',jsonb_build_object('nombre',p.nombre),
 'creditos',case when r.credito is not null then jsonb_build_object('financiera',r.credito->>'financiera') end,
 'venta_items',(select jsonb_agg(jsonb_build_object('cantidad',x->'cantidad','precio_venta',x->'precio_venta',
 'productos',jsonb_build_object('nombre',x->>'nombre'),'unidades',jsonb_build_object('imei',x->>'imei')))
 from jsonb_array_elements(r.detalle) x)
 ) order by r.creado_en desc),'[]'::jsonb)
 from public.ventas_autorizaciones r
 left join public.clientes c on c.id=r.cliente_id
 left join public.origenes o on o.codigo=r.tienda_codigo
 left join public.perfiles p on p.id=r.creado_por
 where r.estado in ('pendiente','rechazada')
 and auth.uid() is not null and public.rol_actual() is not null
 and (public.es_central() or r.tienda_codigo=public.tienda_actual())
 and (p_desde is null or (r.creado_en at time zone 'America/Bogota')::date>=p_desde)
 and (p_hasta is null or (r.creado_en at time zone 'America/Bogota')::date<=p_hasta)
 and (p_tienda is null or r.tienda_codigo=p_tienda)
 and (p_id is null or r.id=p_id);
$$;
revoke all on function public.listar_ventas_registradas_sin_contabilizar(date,date,text,uuid) from public,anon;
grant execute on function public.listar_ventas_registradas_sin_contabilizar(date,date,text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
