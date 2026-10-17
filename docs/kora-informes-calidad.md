# Contrato de calidad de informes KORA

Estado: revisión ampliada reabierta el 16 de octubre de 2026. La aprobación local anterior no cubre los hallazgos ni los cambios nuevos. No desplegado. Ver `auditoria-informes-2026-10-16.md` para pruebas, límites y pendientes; no considerar todos los informes certificados.

## Variantes y datos

- La descarga común ofrece Detallado (por defecto) y Resumido (solo agregados).
- PDF y Excel preparan la misma consulta y proyectan el resumen después de preparar los datos. El nombre histórico `prepareExcel` no limita el adaptador al formato Excel.
- El resumen no debe reintroducir personas, operaciones ni movimientos individuales. Presupuestos resumidos muestran el total mensual, no los 31 días.
- Cada informe identifica negocio, período, filtros, formato, usuario y código de trazabilidad. La tienda global del shell no debe contaminar informes globales de Aliados/B2B.
- Las advertencias internas marcadas `data-kora-no-export` permanecen en KORA, no en documentos compartidos. Las advertencias de datos incompletos sí acompañan el informe.

## Totales obligatorios y significado

Las columnas se totalizan mediante contratos explícitos en `TABLE_TOTALS`, `SCHEMA_TOTALS`, `sumColumns`, `balanceColumns` o cierres ya declarados por la pantalla. No se infiere una suma por la palabra costo, precio o saldo.

- Importes y cantidades sumables: cierre de filas consultadas, preservando centavos.
- Precios/costos unitarios: no se suman. Se informa cantidad de registros/referencias.
- Saldos por tercero: por cobrar/pagar y saldos a favor se presentan por separado. No se compensan clientes ni proveedores distintos.
- Saldos acumulados de un libro: no se suman de nuevo.
- Tasas/márgenes/tickets: relación de agregados, no promedio simple de porcentajes por fila.
- Conciliación de utilidad: los componentes del puente no se suman entre sí; el resultado final ya es su cierre.
- Ausencia de costo/dato: subtotal conocido más advertencia de pendientes; nunca cero implícito.
- Listas limitadas (por ejemplo top 5): subtotal de filas mostradas, no total del negocio.
- Liquidaciones estructuradas: suma solo incluidas; el resultado cacheado y la fórmula del Excel representan el mismo cierre que PDF.

## Adaptadores y estados de consulta

- Banco exporta el saldo disponible en la consulta y separa solicitudes por estado. Conserva el límite existente de 200 solicitudes y lo declara; no se presenta como extracto bancario completo.
- Clientes y cuentas exporta toda la consulta filtrada, no solo la página visual de 10 filas. Conserva el enmascaramiento de cuentas.
- Presupuestos identifica negocio, mes, indicador y propuesta/aprobación. Los valores exactos se exponen mediante `data-kora-report-value`, sin cambiar el redondeo de la vista operativa.
- Los adaptadores `data-kora-report-source` son de lectura. Una consulta no terminada/fallida o un período inválido bloquea la descarga con explicación, sin reutilizar valores anteriores.
- Los informes no registran pagos, gastos, cierres o ajustes. Solo se conserva la auditoría de exportaciones ya existente.

## Presentación y caminos nativos

PDF A4 vertical, marca Creditek/KORA, encabezados legibles, totales completos y sin botones de operación. Las tablas anchas se distribuyen en campos de varias líneas. Excel usa valores tipados y cierres explícitos; cuentas, identificación e IMEI se mantienen como texto.

Las descargas nativas de inventario, ajustes de conteo, finanzas, comparativo, cartera, cobros y dashboard B2B conservan su cálculo y sus permisos. Se agregan cierres/valoraciones/contexto en la capa de presentación. No se modifican plantillas ciegas, RPC ni consultas operativas.

## Verificación

- Pruebas unitarias de contratos, centavos, desconocidos, créditos por tercero, ponderaciones y resumen de liquidaciones.
- Chrome local con datos sintéticos: Resumen de saldos B2B, Dashboard Aliados, Banco, directorio, cartera con saldo a favor, presupuestos Retail y adaptación común PDF/Excel.
- PDF generado por el propio exportador y revisado visualmente en A4 vertical.
- Comparación nominal de la suite ERP contra HEAD, aislando los fallos anteriores al parche.

Esto no certifica una descarga real de cada pantalla ni una publicación. La aceptación en producción requiere autorización, build/verificación y comprobación de archivos servidos y descargas después del despliegue.
