-- Alta explícita de tarifa, sin decisiones de pago ni recálculo automático.
create function krediya_private.crear_tarifa_operacion(p_operation_id uuid,p_pvp numeric,p_pagamos numeric,p_desde date)
returns public.krediya_price_rules language plpgsql security definer set search_path='' as $$
declare o public.liquidation_operations%rowtype;l public.liquidations%rowtype;r public.krediya_price_rules%rowtype;k text;
begin
 if auth.uid() is null or not public.tiene_capacidad_aliados('revisor') then raise exception 'No autorizado';end if;
 select * into o from public.liquidation_operations where id=p_operation_id and plataforma='krediya';
 if not found then raise exception 'Operación no encontrada';end if;
 select * into l from public.liquidations where id=o.liquidation_id for update;
 if l.frozen_at is not null or not o.reconocida then raise exception 'La operación está aprobada o excluida';end if;
 if p_pvp is null or p_pagamos is null or p_pvp<=0 or p_pagamos<=0 or p_pvp>=100000000000000 or p_pagamos>=100000000000000 or p_desde is null
 or p_desde>(o.operation_at at time zone 'America/Bogota')::date then raise exception 'Completa precios positivos y una vigencia que incluya esta venta';end if;
 k:='ref:'||regexp_replace(lower(coalesce(nullif(o.referencia,''),o.modelo,'')),'[^a-z0-9]','','g');
 if k='ref:' then raise exception 'Falta identificar la referencia';end if;
 perform pg_advisory_xact_lock(hashtextextended('krediya-tarifa:'||k,0));
 if exists(select 1 from public.krediya_price_rules where activo and referencia_clave in(k,lower(btrim(coalesce(o.modelo,o.referencia,''))))) then
 raise exception 'La referencia ya tiene tarifa o vigencias. Actualiza y edita la existente; no se duplicó';end if;
 insert into public.krediya_price_rules(referencia_clave,referencia,precio_venta,pagamos,vigente_desde,creado_por,actualizado_por)
 values(k,coalesce(nullif(o.referencia,''),o.modelo),round(p_pvp,2),round(p_pagamos,2),p_desde,auth.uid(),auth.uid()) returning * into r;
 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),'krediya_tarifa_creada_desde_operacion','krediya_price_rules',r.id::text,jsonb_build_object('operation_id',o.id,'tarifa',to_jsonb(r)));
 return r;
end $$;
revoke all on function krediya_private.crear_tarifa_operacion(uuid,numeric,numeric,date) from public,anon;
grant execute on function krediya_private.crear_tarifa_operacion(uuid,numeric,numeric,date) to authenticated;
create function public.krediya_crear_tarifa_operacion(p_operation_id uuid,p_pvp numeric,p_pagamos numeric,p_desde date)
returns public.krediya_price_rules language sql security invoker set search_path='' as $$
 select krediya_private.crear_tarifa_operacion(p_operation_id,p_pvp,p_pagamos,p_desde)
$$;
revoke all on function public.krediya_crear_tarifa_operacion(uuid,numeric,numeric,date) from public,anon;
grant execute on function public.krediya_crear_tarifa_operacion(uuid,numeric,numeric,date) to authenticated;
