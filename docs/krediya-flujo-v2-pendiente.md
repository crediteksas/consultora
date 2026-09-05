# Krediya v2 — implementación local, publicación pendiente

Estado: la migración `20260905034907_krediya_flujo_tarifario_y_seguimiento.sql` NO se ha aplicado. La protección de producción rechazó su aplicación por alcance financiero. No desplegar el frontend sin esa migración y sin pruebas SQL transaccionales satisfactorias.

## Acuerdo de Oscar

- PAGAMOS pactado se respeta. Giro al aliado = PAGAMOS − inicial, una sola vez.
- El PVP recibido determina el resultado. Las diferencias frente al PVP configurado generan informe y seguimiento independiente para Oscar y Mayte, sin bloquear aprobación/pago autorizado.
- Bonos de ejecutivos según reglas existentes; $5.000 de Mayte y $15.000 de Operación para Oscar sin duplicar el bono universal de Mayte.
- Gasto financiero del 0,4% sobre crédito financiado; provisión del 28% después de bonos y gasto financiero. Se conservan pérdidas reales. El resultado y las reglas usados quedan en snapshot.
- Calcular y enviar a aprobación no autoriza ni registra pagos. La aprobación de Gerencia y el soporte de pago permanecen explícitos.
- Tarifario consultable, descargable y editable con vigencia, concurrencia y auditoría; no cambia Krediya externa ni lotes aprobados.

## Alcance que requiere autorización productiva

Además de nuevas tablas/RPC, cambia permisos de escritura del tarifario, admite órdenes Krediya pendientes sin cuenta y exige cuenta válida al pagar. Excluye el nuevo motor del cierre automático histórico y adapta Tesorería a PAGAMOS congelado en vez del porcentaje PayJoy. No cambia registros financieros existentes al aplicar el DDL.

## Verificación antes de publicar

- Suite local y test de componente navegador: `npm run test:local` y `node --test tests/e2e/krediya-tarifario-local.test.mjs`.
- Aprobadas 192 pruebas locales. QA de navegador con estilos y fuente reales de KORA en 390, 768, 1128 y 1440 px, incluyendo las tarjetas de pagos y el tarifario.
- Migración instalada y pruebas transaccionales aprobadas en PostgreSQL 17.6 aislado, con esquema actual y datos exclusivamente sintéticos. Cálculo, repetición sin duplicados, rechazo de lote congelado, permisos de Auditoría/Gerencia, aprobación, compensación Retail, cuenta ausente, diferencias no bloqueantes y preservación de PayJoy/ALO: PASS. ROLLBACK verificado sin registros residuales y saldos ficticios restaurados.
- SHA256 de migración probada: `af8943b0471639a8335c8cc4b3fea587aeaca9b68c7da65219cf256e05991bb2`. Evidencia local: `/private/tmp/krediya-qa/verification.md`; prueba versionada: `tests/erp/krediya-v2-rollback.sql`.
- Tesorería recibe margen monetario PVP − PAGAMOS antes de bonos/gastos; los bonos se debitan una sola vez al pagar. Una pérdida de margen genera débito, conservando el control de saldo. La provisión no es una transferencia bancaria; el gasto financiero real debe registrarse en Tesorería con su evidencia. La utilidad neta se consulta en la liquidación, no se confunde con el saldo monetario.
- La columna opcional Código aún no se ha poblado desde el archivo. La identificación y búsqueda funcionan por referencia completa. La evidencia parcial de Infinix sin PVP maestro sigue disponible en su operación, pero no constituye una tarifa completa editable en el catálogo.
- Tras validar SQL: revisar advisors, commit/release y pipeline canónico. Verificar interfaz y recursos publicados, sin autorizar ni pagar automáticamente el lote real.

## Bloqueo productivo y petición de marcar pagado

El control de publicación volvió a rechazar la migración después de las pruebas locales: requiere autorización expresa del alcance sobre funciones compartidas de Liquidaciones/Tesorería y siguen dos ventas sin PAGAMOS respaldado. No se aplicó DDL ni se calcularon, aprobaron o pagaron registros reales. No reintentar por una vía alternativa.

Faltan PVP configurado y PAGAMOS pactado del MOTOROLA EDGE 50 FUSION 5G 256GB 8RAM, dos ventas de A MOVILPHONE con IMEI terminado en 35134 y 24393. Krediya reporta PVP $1.300.000 en ambas; no se encontró ese modelo en los libros disponibles. También se solicitó fecha y cuenta de origen para los pagos que Oscar declara realizados. Nunca inventar estos datos ni comprobantes.

El registro excepcional «pagado, soporte pendiente» no está implementado en esta migración: el flujo vigente exige soporte al pagar. Requiere diseño y autorización separados conservando cuenta, fecha, aprobación, saldo, trazabilidad e idempotencia. La orden del usuario no se representó como una transferencia bancaria ejecutada.
