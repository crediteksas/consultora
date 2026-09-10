# Krediya: anulaciones y recuperación de pagos

## Alcance implementado

- `PENDIENTE` sin venta original reconocida: seguimiento, sin generar principal, bonos ni utilidad; no se interpreta como devolución.
- Contrato `ANULADO` con una única venta original reconocida: revisión desde Liquidaciones → Novedades → Revisar anulación.
- Coincidencia obligatoria de plataforma, crédito, cédula, IMEI y comercio. Se busca sin límite de semanas. Nunca se cruza solo por cédula.
- Entrada y anulación del mismo lote, antes de calcular o devengar: ambas filas se conservan excluidas, sin dinero ni bonos.
- Original de aliado ya aprobado: Gerencia confirma la contrapartida. Conserva cálculo, pagos, comprobantes y bonos originales en un snapshot inmutable.
- Principal/bonos pendientes: disminuye la obligación, invalida autorización y exige revisar el neto. Principal/bonos ya pagados: cuenta por cobrar individual al beneficiario.
- Autorización individual del siguiente pago: presenta bruto, descuento, neto y saldo por cobrar. Aplica el cruce una vez. Cero = sin giro; no crea pago bancario ni comprobante ficticio.
- Sin pagos futuros: saldo por cobrar visible en Tesorería, separado de dinero recuperado.
- Dashboard y Reportes: contrapartida por fecha del ajuste, con importes originales negativos de principal, bonos, utilidad, provisión y gasto financiero. El histórico no se reescribe. Bonificaciones muestra la contrapartida negativa.
- Tesorería: el margen anteriormente acreditado en saldo operativo queda retenido por la reversión, sin modificar sus movimientos originales ni simular un débito bancario. Las nuevas salidas respetan ese disponible ajustado.
- Reimportación de un contrato ya reversado no lo reactiva; no admite nuevos ítems o bonos diferidos de la operación anulada.

## Casos que requieren revisión y no se resuelven automáticamente

- Crédito ausente, identidad distinta, más de un original o desglose financiero incompleto.
- Original presente solamente en el archivo histórico, sin una operación y pagos originales conciliables.
- Venta de tienda propia con compensación a cartera Retail: requiere reversar esa compensación; este RPC no la altera.
- Borrador ya calculado y no aprobado: no se eliminan automáticamente sus cálculos ni órdenes.
- Orden original pendiente que ya tiene otro cruce aplicado: exige conciliar ese cruce antes de otra reversión.
- Cobro externo en efectivo/transferencia: el módulo muestra el pendiente; registrar su recuperación requiere soporte y una ruta específica. No se marca recuperado sin evidencia.

Estas restricciones afectan al caso que requiere revisión, no a los demás créditos del archivo. No se debe presentar este cambio como resolución automática de todos los casos.

## Validación y publicación

- Migración local: `20260910185830_aliados_reversiones_y_recuperaciones.sql`.
- Pruebas locales SQL: deuda 100/pago 200, deuda 300/pago 100, obligaciones no desembolsadas, mismo lote en cero, idempotencia, rol Gerencia, identidad, snapshot incompleto, saldo operativo retenido y orden mixta.
- Pruebas de informe: inversión de todos los componentes, no sustituir el original por seguimiento, fecha Bogotá y preservación de ambas filas del archivo.
- 398 pruebas del ciclo KORA pasan. Compilación con configuración de producción validada.
- No se ejecutó una reversión, autorización ni pago real para probar.
- Migración instalada exclusivamente en KORA `jfkmiyvcdfbsbwchyvol`; versión remota `20260910193623` (el servicio asigna su fecha de instalación).
- Huellas antes/después idénticas de órdenes (excluida la nueva bandera), ítems, bonos, cálculos y saldos. Cero reversiones o recuperaciones reales creadas por la instalación.
- Revisados los asesores de seguridad tras instalar. Las tablas nuevas tienen RLS y solo lectura para revisores; las escrituras pasan por funciones con control de permisos.
- Publicación mediante `npm run deploy:kora:production`; el comprobante del pipeline registra commit, versión, rollback y huellas de los assets publicados.
