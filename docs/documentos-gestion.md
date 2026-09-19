# Editar o anular documentos

Acceso: tarjeta del **Resumen ejecutivo** o **Administración → Editar o anular documentos**. Ruta `creditek/erp/documentos-gestion.html`.

El panel está reservado a los perfiles activos de Óscar y Maite con rol corporativo. No concede permisos nuevos a tiendas ni modifica la autorización de pagos. El buscador solo consulta mediante la sesión autenticada y las políticas existentes; cada operación conserva la comprobación de permisos en servidor.

## Flujo

1. Elegir Traslados, Remisiones, Ventas o Gastos de tiendas.
2. Buscar por consecutivo, ID completo o IMEI exacto (en traslados/ventas). Las fechas son opcionales y usan el día de Colombia. Los gastos no tienen consecutivo: se filtran por tienda/fecha o ID completo.
3. Abrir el documento exacto. El enlace no ejecuta acciones automáticamente y funciona aunque el documento no estuviera en la página o período del listado original.
4. Usar las acciones permitidas por su estado. La corrección/anulación conserva sus motivos, bitácoras y validaciones existentes.

## Alcance y límites

| Documento | Flujo disponible |
| --- | --- |
| Traslado | Anular antes del visto bueno central. Diálogo con número, origen, destino, motivo y confirmación de **todo** el documento; reutiliza `anular_traslado`. No crea el envío sustituto. |
| Remisión | Editar borradores, corregir antes de recibir o ajustar precios de cartera B2B según las reglas existentes. Anulación solo de borradores. |
| Venta | Corrección administrativa y anulación con motivo. No se editan fórmulas, importes, productos ni fechas. Se rechazan perfiles sin autorización, períodos cerrados y, en anulación, créditos con vínculos financieros. |
| Gasto de tienda | Revisión, devolución, corrección y rechazo según estado; no borrado general de gastos aprobados/pagados. |
| Compras, liquidaciones, tesorería y consignaciones | Enlaces al módulo especializado, sujetos a sus permisos. No existe una anulación universal de facturas de proveedor o dinero pagado. |

La migración `20260919222329_ventas_ajustes_guardas_documentos.sql` agrega únicamente comprobaciones previas a los dos RPC administrativos de venta. No ejecuta anulaciones/correcciones de documentos ni cambia cálculos existentes. En producción se verificó que, al retirar las guardas añadidas, ambas definiciones son idénticas a las anteriores.

La migración `20260919224627_permitir_reverso_movimientos_anulacion.sql` corrige una incompatibilidad detectada en la anulación autenticada: el RPC escribía `reverso`, pero `movimientos_tipo_check` había omitido ese tipo. Conserva el predicado anterior y agrega solamente `reverso`, sin modificar el RPC ni ejecutar anulaciones. No se sustituye por `ajuste_entrada`, porque los cierres existentes reconocen la reversión por su tipo y vínculo `reverso_de`. El reemplazo del CHECK es atómico y valida todas las filas; un fallo revierte toda la migración.

## Verificación

- `npm run test:local`: incluye búsqueda, permisos, enlaces, anulación y guardas SQL ejecutables en PGlite.
- `node --test tests/e2e/documentos-gestion-ui.test.mjs`: navegador aislado con datos sintéticos y todas las solicitudes interceptadas; requiere Chrome. Cubre escritorio/celular, búsqueda, paginación, estados, errores, arranque, permisos y escape de texto. No prueba con sesiones de personas reales ni modifica producción.
- Pruebas móviles del diálogo de anulación: foco, Escape y ausencia de desbordamiento.
- Supabase Advisors revisado: los RPC siguen siendo `SECURITY DEFINER` ejecutables por `authenticated`, con autorización interna explícita y sin acceso de `anon`. Otros avisos del proyecto no son parte de este cambio.

Publicación exclusivamente con `npm run deploy:kora:production`, que valida versión candidata, artefacto, despliegue y reversión automática. Los assets compartidos de navegación se versionan juntos como `2.0.30`.
