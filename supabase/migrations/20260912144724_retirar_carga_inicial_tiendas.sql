begin;

-- Retiro prospectivo autorizado por Gerencia. No elimina stock ni movimientos.
-- Conserva las funciones para trazabilidad y eventual recuperación administrativa,
-- pero ninguna sesión de la aplicación puede ejecutar nuevas cargas o cierres.
revoke execute on function public.inventario_cargar_inicial(text, uuid, numeric, numeric, text, integer, text[])
  from public, anon, authenticated, service_role;
revoke execute on function public.inventario_importar_inicial_excel(text, jsonb, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.inventario_finalizar_carga_inicial(text)
  from public, anon, authenticated, service_role;

commit;
