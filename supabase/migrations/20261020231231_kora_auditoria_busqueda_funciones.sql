-- Preparación local: no aplicar sin revisión y autorización de publicación.
-- Resuelve primero objetos de public y deja pg_temp explícitamente al final.
-- No cambia cuerpos, permisos de acceso, importes ni registros del negocio.
begin;
alter function public.bloquear_costo_promedio_tienda_historial() set search_path=public,pg_temp;
alter function public.bloquear_mutacion_movimientos() set search_path=public,pg_temp;
alter function public.normalizar_categoria(text) set search_path=public,pg_temp;
alter function public.registrar_compra_proveedor(uuid,text,date,jsonb,text,text) set search_path=public,pg_temp;
alter function public.trg_normalizar_categoria_producto() set search_path=public,pg_temp;
commit;
