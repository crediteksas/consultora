# Tesorería · Cobros de plataformas

Módulo independiente de control de cobros, autorizado por Oscar. No genera ni autoriza pagos, no modifica liquidaciones, tarifas, bonos ni saldos contables existentes.

## Uso

1. Abrir Tesorería → Cobros de plataformas. Gerencia registra y anula; Auditoría consulta y exporta.
2. Seleccionar plataforma. Las liquidaciones existentes aparecen como candidatas con su base estimada. Confirmar el **neto que debe consignar la plataforma** y la fecha esperada, documentándolo con referencia o enlace al soporte. También se puede registrar un cobro esperado manual.
3. Registrar el abono real: fecha, banco, últimos cuatro dígitos de cuenta, referencia, valor y soporte.
4. Aplicar todo o parte del abono a uno o varios cortes de la misma plataforma. Un corte puede recibir varios abonos. Los excedentes permanecen sin aplicar.
5. Consultar pendiente, vencido, recibido y sin aplicar; descargar CSV compatible con Excel. Para corregir, anular aplicaciones y luego el registro original con motivo, conservando el historial.

## Fuentes y límites

- `received_from_platform` del flujo anterior es una suma calculada de créditos, no una prueba de ingreso al banco. Su etiqueta antigua se aclara en Tesorería.
- La base del archivo no es necesariamente el neto final de la remesa; no se suma al esperado hasta documentar ese neto. Una base ausente se muestra como no disponible, nunca como cero.
- Pendiente = netos confirmados activos − aplicaciones activas. Recibido = abonos activos, contados una sola vez. Vencido usa la fecha de Bogotá. Anulados no suman.
- No existe conexión automática al banco. El soporte de esta versión es un enlace o una referencia, no carga de adjunto.
- Plataformas: PayJoy, ALO Credit, Krediya y Addi. No se mezclan cobros de plataformas distintas ni se condonan diferencias automáticamente.

## Seguridad y pruebas

Migración aplicada de forma individual en KORA: `20260905044108_cobros_plataformas_independiente.sql`. RLS y funciones con validación de perfil activo; escrituras directas denegadas; idempotencia, control de duplicados bancarios y bloqueos transaccionales para evitar sobreaplicaciones. La guía de Supabase orientó la separación de funciones públicas invoker y funciones privilegiadas en esquema privado.

Pruebas: `tests/erp/cobros-plataformas-ui.test.mjs`, `tests/erp/cobros-plataformas-contrato.test.mjs` y `tests/erp/cobros-plataformas-rollback.sql`. El SQL se ejecutó con rol authenticated para Gerencia, Auditoría y tienda; las pruebas se deshicieron completamente con ROLLBACK. La revisión de seguridad no reportó avisos del módulo; rendimiento solo señaló índices nuevos aún sin uso, que se conservan para sus claves foráneas y consultas.

QA visual con HTML, hojas de estilo y tipografía reales de KORA en 390, 768, 1128 y 1440 px, también con formularios abiertos. Cero desbordamientos laterales y errores JavaScript en estas pruebas.

## Publicación aislada

El commit previo `3b9d987` contiene Krediya v2 y depende de una migración financiera pendiente/rechazada. No publicarlo. Su trabajo se conserva en `pending/krediya-v2-3b9d987` y en el historial. La release de Cobros conserva el frontend Krediya anterior mediante una reversión explícita recuperable, sin modificar la base financiera ni las guardas de despliegue.

Aplicar migraciones por nombre, nunca todas las pendientes. Usar exclusivamente `npm run deploy:kora:production` desde main canónico y verificar recursos/manifiesto remoto. La publicación de Cobros no significa que Krediya v2 esté resuelto o desplegado.
