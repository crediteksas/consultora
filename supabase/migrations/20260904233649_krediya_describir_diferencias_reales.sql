create or replace function public.aliados_sincronizar_precios_krediya(p_id uuid)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.liquidation_operations%rowtype; r public.krediya_price_rules%rowtype; c jsonb; n integer:=0; v integer;
begin
 if auth.uid() is null or not public.tiene_capacidad_aliados('revisor') then raise exception 'No autorizado';end if;
 perform 1 from public.liquidations where id=p_id and plataforma='krediya' and frozen_at is null and estado in ('importada','con_novedades','validada','calculada') for update;
 if not found then raise exception 'Liquidación no editable';end if;
 for o in select * from public.liquidation_operations where liquidation_id=p_id and reconocida and plataforma='krediya' loop
  r:=public.krediya_precio_efectivo(o.id); c:=public.aliados_contexto_precio_krediya(o.id);
  if (c->>'bonos')::numeric=20000 then
   update public.liquidation_incidents set estado='resuelta',resolution='Bonos vigentes ya configurados: gestión $5.000 y operación $15.000',resolved_by=auth.uid(),resolved_at=now()
    where operation_id=o.id and estado='abierta' and tipo='krediya_bono_sin_configurar';
   get diagnostics v=row_count; n:=n+v;
  end if;
  if r.precio_venta>0 and r.pagamos>0 and (o.policy_snapshot ? 'decision_precio' or
    (r.precio_venta=(c->>'pvp_recibido')::numeric and ((c->>'pagamos_recibido') is null or r.pagamos=(c->>'pagamos_recibido')::numeric))) then
   update public.liquidation_incidents set estado='resuelta',resolution='Precio vinculado: coincide con tarifa vigente o decisión registrada',resolved_by=auth.uid(),resolved_at=now()
    where operation_id=o.id and estado='abierta' and tipo in ('krediya_regla_precio_ausente','krediya_precio_venta_diferente','krediya_pagamos_diferente');
   get diagnostics v=row_count; n:=n+v;
  else
   update public.liquidation_incidents set descripcion=case
    when r.precio_venta is null or r.pagamos is null then 'No hay tarifa vinculada vigente para '||coalesce(o.referencia,o.modelo,'esta referencia')||' en la fecha de venta '||coalesce(c->>'fecha','sin fecha')||'. Revisa la referencia y la vigencia del tarifario.'
    else 'PVP guardado: '||r.precio_venta||'; recibido de Krediya: '||coalesce(c->>'pvp_recibido','no informado')||'; diferencia: '||coalesce(((c->>'pvp_recibido')::numeric-r.precio_venta)::text,'no calculable')||'. Pagamos guardado: '||r.pagamos||'; recibido: '||coalesce(c->>'pagamos_recibido','no viene en el archivo')||'. Abre el editor para comparar y decidir.'
    end
   where operation_id=o.id and estado='abierta' and tipo in ('krediya_regla_precio_ausente','krediya_precio_venta_diferente','krediya_pagamos_diferente');
  end if;
 end loop;
 if n>0 then insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),'krediya_precios_coincidentes','liquidations',p_id,jsonb_build_object('alertas_resueltas',n));end if;
 return n;
end$$;
