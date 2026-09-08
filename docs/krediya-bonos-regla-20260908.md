# Krediya: bonos por plataforma

Autorización de Oscar: gestión $5.000 y operación $15.000 únicamente por créditos de aliados. Luis no cobra override sobre Alexander en Krediya; conserva su fijo propio de $20.000 cuando sea el ejecutivo asignado. PayJoy y ALO no cambian.

La migración solo redefine las tres funciones de cálculo/contexto. No ejecuta cálculo ni cambia bonos, órdenes, liquidaciones o pagos existentes. Se conserva la guarda de lote congelado y órdenes en gestión. Se restringe la ejecución anónima detectada en las funciones tocadas; permanece la autorización de revisor. Referencia: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable

Reporte: fecha de la operación vinculada al bono, no primera fecha del lote; contadores separados de créditos y bonos. Los bonos antiguos incompatibles con la regla se muestran como pendientes de conciliación, sin ocultarlos ni modificar importes.

Prueba de regresión con SQL real: 22 aliados de Alexander y 7 propias producen Alexander 660.000, Mayte 110.000 y Oscar 330.000, total 1.100.000 y 66 bonos. Se prueban fijo propio de Luis, aislamiento ALO/PayJoy, rechazo sin capacidad y lote congelado, y repetición de migración sin mutación de filas.

Pendiente de confirmación del usuario: el lote existente tiene pagos registrados de Luis 220.000 y Mayte 145.000; Oscar mantiene una orden pendiente de 435.000. No conciliar ni anular esos registros hasta confirmar los giros reales. El resultado esperado no sustituye automáticamente el histórico.
