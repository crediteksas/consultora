CREATE OR REPLACE FUNCTION kora_private.exigir_confirmacion_deuda_api()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.perfiles%rowtype; h timestamp:=clock_timestamp() at time zone 'America/Bogota';
 ruta text:=ltrim(coalesce(current_setting('request.path',true),''),'/');
begin
 if auth.uid() is null or h::time<time '11:00' or h::date<(select inicio from kora_private.confirmacion_deuda_config where id) then return; end if;
 if current_setting('request.method',true) in ('GET','HEAD','OPTIONS') then return; end if;
 if ruta in ('rpc/estado_confirmacion_deuda_tienda','rpc/confirmar_deuda_tienda','rpc/es_admin_b2b','rpc/tiene_capacidad_aliados','rpc/tiene_capacidad_cartera') then return; end if;
 select * into p from public.perfiles where id=auth.uid() and activo and rol='admin_tienda';
 if not found then return; end if;
 if not exists(select 1 from public.confirmaciones_deuda_tienda where usuario_id=p.id and tienda_codigo=p.tienda_codigo and fecha=h::date) then
 raise sqlstate 'PT403' using message='Confirma la deuda de tu tienda con Creditek o reporta la diferencia para continuar.',hint='KORA_CONFIRMACION_DEUDA_PENDIENTE';
 end if;
end $function$
