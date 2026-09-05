# Krediya v2 — implementación local, publicación pendiente

Estado: la migración `20260905034907_krediya_flujo_tarifario_y_seguimiento.sql` NO se ha aplicado. La protección de producción rechazó su aplicación por alcance financiero. No desplegar el frontend sin esa migración y sin pruebas SQL transaccionales satisfactorias.

## Acuerdo de Oscar

- PAGAMOS pactado se respeta. Giro al aliado = PAGAMOS − inicial, una sola vez.
- El PVP recibido determina el resultado. Las diferencias frente al PVP configurado generan informe y seguimiento independiente para Oscar y Mayte, sin bloquear aprobación/pago autorizado.
- Bonos de ejecutivos según reglas existentes; $5.000 de Mayte y $15.000 de Operación para Oscar sin duplicar el bono universal de Mayte.
- Provisión del 28% después de bonos. El resultado y las reglas usados quedan en snapshot.
- Calcular y enviar a aprobación no autoriza ni registra pagos. La aprobación de Gerencia y el soporte de pago permanecen explícitos.
- Tarifario consultable, descargable y editable con vigencia, concurrencia y auditoría; no cambia Krediya externa ni lotes aprobados.

## Alcance que requiere autorización productiva

Además de nuevas tablas/RPC, cambia permisos de escritura del tarifario, admite órdenes Krediya pendientes sin cuenta y exige cuenta válida al pagar. Excluye el nuevo motor del cierre automático histórico y adapta Tesorería a PAGAMOS congelado en vez del porcentaje PayJoy. No cambia registros financieros existentes al aplicar el DDL.

## Verificación antes de publicar

- Suite local y test de componente navegador: `npm run test:local` y `node --test tests/e2e/krediya-tarifario-local.test.mjs`.
- Pendiente: ejecutar la migración en una base de prueba con el esquema actual. No se dispone de PostgreSQL local en este entorno. Los tests de contrato SQL no sustituyen pruebas de ejecución.
- Probar transaccionalmente cálculo, repetición sin duplicados, rechazo de lote congelado, permisos de Mayte/Oscar, aprobación, compensación Retail, cuenta ausente, diferencias no bloqueantes y preservación de PayJoy/ALO. Deshacer completamente los datos de prueba.
- Revisar el asiento de provisión frente a la comisión bruta en Tesorería: el cálculo muestra utilidad neta; Tesorería mantiene la comisión bruta, como el flujo anterior, sin un nuevo asiento de provisión en este cambio.
- La columna opcional Código aún no se ha poblado desde el archivo. La identificación y búsqueda funcionan por referencia completa. La evidencia parcial de Infinix sin PVP maestro sigue disponible en su operación, pero no constituye una tarifa completa editable en el catálogo.
- Tras validar SQL: revisar advisors, commit/release y pipeline canónico. Verificar interfaz y recursos publicados, sin autorizar ni pagar automáticamente el lote real.

No reintentar la migración por otra vía ante el rechazo. Pedir autorización expresa del alcance indicado.
