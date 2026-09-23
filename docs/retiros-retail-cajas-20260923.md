# Retiros Retail desde cajas de tiendas — 23 septiembre 2026

Estado: Oscar autorizó explícitamente aplicar la migración y publicar en producción, sin pagos reales. La migración fue aplicada correctamente el 23 septiembre 2026. Publicación de la interfaz y comprobación de la release en curso.
No se ejecutaron pagos, retiros ni datos de prueba en producción.

## Flujo
1. Administración → Gastos y retiros → Nuevo retiro → Retail.
2. Mayte/Oscar identifica socio, documento, banco/cuenta, importe, período y tiendas que entregan el dinero.
3. Solo Oscar aprueba. Se valida el efectivo, se emiten instrucciones SOCIO y se conserva la distribución.
4. La tienda presenta soporte e indica la fecha REAL del pago (entre fecha de instrucción y hoy).
5. Mayte/Oscar valida. Una transacción registra la salida tipo retiro en la caja de esa tienda y fecha, vincula soporte e instrucción y conserva auditoría.
6. Cada salida se registra una sola vez. El retiro queda pagado cuando todas las tiendas completan su parte.
7. No se crea gasto, abono de cartera, B2B ni otra orden de giro central.

Ejemplo probado: instrucción de ayer, pago hoy, cierre de ayer intacto y caja actual 1000→940.
Si ya hay soporte enviado o rechazado sin resolver, no se permite cerrar el arqueo afectado. Si ya estaba cerrado antes de presentar soporte, no se admite reescritura retroactiva.

## Alcance del registro
Registro financiero operativo KORA: financial_entries + instrucciones/comprobantes + movimientos_caja_tienda + audit_log.
La inspección no encontró libro diario de partida doble ni plan de cuentas para socios. No se ha creado integración con software del contador ni se ha determinado una cuenta contable patrimonial. No prometer esos asientos.
No se determina cuánto beneficio es legalmente distribuible; se registra únicamente el importe que autorice Oscar, con efectivo suficiente en las tiendas.

## Validación
- 76 pruebas dirigidas aprobadas.
- 918 pruebas locales del pipeline aprobadas.
- Datos sintéticos y PostgreSQL PGlite aislado; funciones reales de caja de la base oficial.
- Protecciones: permisos, idempotencia, soportes, fecha de pago, cierres, distribución y exclusión de pago central.
- No se ejecutó prueba financiera sobre producción. No se probó concurrencia PostgreSQL multisesión real.

## Publicación segura
Base aislada c802c4fe; la base oficial avanzó después a 90f5e474 con cambios no coincidentes con los archivos funcionales de este arreglo.
Conservar cada cambio ajeno al trasladar el diff. El pipeline exige /Users/oscarm/Creditek/baseline/consultora, rama main limpia. No eludirlo.
Preflight: comparar funciones de producción, grants/RLS, ausencia de migración y 0 retiros Retail existentes.
Aplicar migración transaccional y publicar por el pipeline, verificar versión y archivos reales; no ejecutar pagos como smoke test.
Antes de uso con dinero, asegurar que la tienda conoce que debe presentar el soporte antes del cierre y esperar validación.
Rechazos requieren corregir soporte; no hay anulación automática de instrucciones de socios ya aprobadas.

Rollback: no borrar instrucciones, soportes ni movimientos. Restaurar aplicación si falla, mantener esquema aditivo y bloquear operaciones nuevas hasta corregir.
