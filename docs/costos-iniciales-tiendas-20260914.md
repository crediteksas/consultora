# Costos iniciales de tienda

Regla confirmada por Oscar: la columna costo del archivo inicial es costo definitivo de la tienda. La carga inicial no genera margen ni utilidad B2B. Las remisiones posteriores conservan su propio precio de remisión.

Corrección aplicada con respaldo privado de valores anteriores: 1930 filas de stock por cantidad, 150 unidades y 436 líneas de venta. Se conservan cantidades, costos internos, movimientos originales, cobros y carteras. No se recalculan períodos cerrados. Los registros mixtos o sin costo inequívoco se excluyen de la recuperación automática.

El gasto de Kredisinu por 117000 fue corregido de 2026-09-05 a 2026-09-11, manteniendo aprobación; gastos_historial conserva ambas fechas.

Regla de calidad: cualquier incidencia de una tienda se revisa en todas; probar carga inicial, remisión y ventas. No dar por validado el conjunto solo por funcionar en Móvil Shopping.

Pruebas: costos-iniciales-tiendas.test.mjs, gastos-tiendas-contexto.test.mjs y suite local. El respaldo privado no se expone a usuarios de tiendas.
