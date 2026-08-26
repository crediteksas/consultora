# AURA 2 — mapa real KORA–AURA v1

Inspección de solo lectura realizada el 26 de agosto de 2026. No se consultaron ni copiaron nombres, documentos, teléfonos, correos, IMEI ni filas productivas. Conteos estimados observados: `liquidations` 1, `liquidation_operations` 3, `clientes` 4, `ventas` 0 y `creditos` 0.

| Campo normalizado | KORA source | PayJoy | ALO | Addi | Krediya | Confirmado | Gap | Observación |
|---|---|---|---|---|---|---|---|---|
| external_obligation_id | liquidation_operations.external_id | device | Contrato | — | — | PayJoy/ALO | Addi/Krediya | Namespace solo cuando existe el ID fuente |
| customer_external_id | liquidation_operations.cliente_documento | documento, no ID plataforma | CC, no ID plataforma | — | — | No | IDENTIFIER_GAP | No usar documento como ID de integración |
| platform | liquidation_operations.plataforma | payjoy | alo | — | — | PayJoy/ALO | Addi/Krediya | Valores persistidos de liquidación |
| store_id | liquidation_operations.origen_codigo | comercio conciliado | tienda conciliada | — | — | Parcial | tiendas no reconocidas | Puede ser nulo para aliados/no reconocidos |
| currency | no existe | — | — | — | — | No | CURRENCY_GAP | No inferir COP dentro del contrato |
| original_amount | monto_credito / monto_base | owed by PayJoy | Monto Crédito / Total | — | — | PayJoy/ALO | semántica por plataforma | Importe de originación, no saldo vivo |
| outstanding_balance | no existe | — | — | — | — | No | BALANCE_GAP | KORA no conserva saldo vigente del deudor |
| installment_amount | no existe | — | — | — | — | No | INSTALLMENT_GAP | `cuota_inicial` no es cuota periódica |
| due_date | no existe | — | — | — | — | No | DUE_DATE_GAP | Sin calendario de cuotas |
| status | liquidation state / estado_conciliacion | liquidación, no crédito | liquidación, no crédito | — | — | No para cartera | STATUS_GAP | No equivale a estado vigente de obligación |
| days_past_due | no existe | — | — | — | — | No | DPD_GAP | No calculable sin vencimiento |
| last_payment_at | no existe para pago del cliente | — | — | — | — | No | PAYMENT_GAP | payment_orders paga beneficiarios, no cuotas del cliente |
| last_payment_amount | no existe para pago del cliente | — | — | — | — | No | PAYMENT_GAP | No confundir con liquidaciones a tiendas/aliados |
| reconciliation_status | creditos.estado_conciliacion | sin filas observadas | sin filas observadas | — | — | Estructura parcial | DATA_GAP | Conciliación de financiera, no necesariamente cartera |
| source_updated_at | liquidations.imported_at / operations.created_at | disponible | disponible | — | — | PayJoy/ALO | actualización de cartera | Marca importación, no frescura del saldo |

## Fuentes por plataforma

### PayJoy

- Fuente: archivo Excel, hojas/movimientos `purchaseAmount` y `purchaseOutOfPocket`, procesado por `importarPayjoy`; persistencia en `liquidations`, `liquidation_source_rows` y `liquidation_operations`.
- ID confirmado: `device` como `external_id` de la operación importada; combinación de movimientos como `source_key`.
- Campos confirmados: fecha transacción, comercio, device, IMEI, documento, familia/modelo, plazo, producto financiero, monto y inicial.
- Frecuencia: importación manual por corte; no existe job de cartera.
- Calidad: PARCIAL. Sirve para originación/liquidación, no para mora o pagos del cliente.

### ALO Credit

- Fuente: archivo Excel `Worksheet`, procesado por `importarAlo`; persistencia en las mismas tablas de liquidación.
- ID confirmado: `Contrato` como `external_id`.
- Campos confirmados: fecha firma, tienda, contrato, IMEI, documento, referencia, plazo, monto crédito/total e inicial.
- Frecuencia: importación manual por corte.
- Calidad: PARCIAL. No contiene saldo vigente, calendario ni pagos.

### Addi

- Fuente real de cartera: NO DISPONIBLE.
- Existe la financiera en ventas/KORA, pero no se confirmó importador, endpoint, archivo de cartera ni ID externo estable.
- Calidad: NO DISPONIBLE; adaptador `INCOMPLETE`.

### Krediya

- Fuente real de cartera: NO DISPONIBLE.
- Existe la financiera en ventas/KORA, pero no se confirmó importador, endpoint, archivo de cartera ni ID externo estable.
- Calidad: NO DISPONIBLE; adaptador `INCOMPLETE`.

## Mecanismo recomendado

Primera etapa: **D. archivo normalizado** exportado en servidor desde una fuente aprobada por cada plataforma, sin PII innecesaria, validado contra contrato 1.0 y cargado manualmente al sandbox. Evita acoplar AURA directamente a KORA y permite detener una carga incompleta.

Cuando KORA almacene saldo, cuotas y pagos con frescura comprobable: **B. endpoint KORA read-only**, autenticación de mínimo privilegio, paginación, watermark `source_updated_at`, allowlist de campos y registro de auditoría. No activar jobs todavía.

Cadencia inicial propuesta: cada 4 horas durante días/horarios de cobranza y una actualización obligatoria inmediatamente antes de generar candidatos. Retraso máximo recomendado: 60 minutos para pagos; si el saldo tiene mayor antigüedad, bloquear el recordatorio. La frecuencia actual de liquidaciones manuales no es suficiente para cobranza.

## Pagos e iniciales

- Inicial: CONFIRMADA para PayJoy/ALO como campo de originación. En KORA también existe `creditos.cuota_inicial`, pero no había filas estimadas.
- Pago parcial/completo/reverso/ajuste/duplicado/no aplicado: PENDIENTE. No existe evidencia de una tabla de pagos del cliente. `payment_orders` corresponde a pagos a beneficiarios y no debe reutilizarse.
- “Ya pagué”: continúa creando reporte `PENDING_VALIDATION`; nunca modifica saldo.

## Decisión de ingesta

No se ejecutó ingesta real. Los contratos PayJoy/ALO quedan incompletos y las filas disponibles contienen PII. AURA sandbox conserva exclusivamente sus 48 fixtures ficticios.
