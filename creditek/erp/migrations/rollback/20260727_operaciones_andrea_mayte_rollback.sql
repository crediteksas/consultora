begin;

-- Rollback no destructivo: deshabilita los nuevos puntos de escritura y
-- conserva columnas/registros para auditoría. El frontend debe volver al
-- commit estable anterior antes de ejecutar este archivo.
revoke all on function public.registrar_abono_cuenta_corriente(
  text, date, text, text, text, numeric, text, text, text, uuid
) from public, anon, authenticated;
drop function if exists public.registrar_abono_cuenta_corriente(
  text, date, text, text, text, numeric, text, text, text, uuid
);

revoke all on function public.registrar_compra_proveedor_operativa(
  uuid, text, date, text, date, text, jsonb, text, text, uuid
) from public, anon, authenticated;
drop function if exists public.registrar_compra_proveedor_operativa(
  uuid, text, date, text, date, text, jsonb, text, text, uuid
);

revoke all on function public.crear_cliente_interno_seguro(
  text,text,text,text,text,text,text,text,text
) from public, anon, authenticated;
drop function if exists public.crear_cliente_interno_seguro(
  text,text,text,text,text,text,text,text,text
);

revoke all on function public.consultar_utilidad_creditek_rango(date, date)
  from public, anon, authenticated;
drop function if exists public.consultar_utilidad_creditek_rango(date, date);

-- No se eliminan movimientos, tablas ni columnas: podrían contener evidencia
-- operativa creada después del despliegue.
commit;
