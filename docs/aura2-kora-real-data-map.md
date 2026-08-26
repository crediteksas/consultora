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

## Validación de archivos Drive — Fase 7B

Validación de solo lectura realizada el 26 de agosto de 2026 sobre siete libros `.xlsx`. Los archivos originales no fueron modificados ni convertidos. El conector de Drive no expone nombres internos de pestañas para archivos Office; se documentan los segmentos lógicos observados y no se inventan nombres de hojas.

| Plataforma | Archivos inspeccionados | Segmentos lógicos | Encabezados estructurales confirmados | Clasificación |
|---|---:|---:|---|---|
| PayJoy | 3 | 2 por archivo | transaction time, merchant name, device, transaction type, device family, device model, imei, months, finance product, owed by PayJoy, owed by CREDITEK S.A.S., national id | ORIGINACIÓN + LIQUIDACIÓN |
| ALO | 1 | 1 | FECHA, TIENDA, TIENDA_CREDITEK, MODELO, IDENTIFICACION, CONTRATO2, IMEI, MONTO_CREDITO, INICIAL_, PLATAFORMA | RESUMEN DE ORIGINACIÓN/LIQUIDACIÓN |
| Addi | 3 | 4–7 por archivo | ownership, origination_date, loan_id, approved_amount, store_name, application_id, order_id, ally_mdf, requested_amount_without_discount | ORIGINACIÓN + LIQUIDACIÓN |
| Krediya | 0 | 0 | — | SIN FUENTE COLOMBIA |

Archivos PayJoy: `PAYJOY TER AGO 21 2026.xlsx`, `PAYJOY DEL 6 AL 9 AGOSTO 2026.xlsx`, `PAYJOY 4 Y 5 AGOSTO 2026.xlsx`. Archivo combinado ALO: `ALO Y PAYJOY COMPLETO resumen.xlsx`. Archivos Addi: `LIQ ADDI 26 sep.xlsx`, `addi 29 agosto.xlsx`, `ADDI DEL 22 DE AGOSTO.xlsx`.

### Matriz normalizada actualizada

| Campo normalizado | PayJoy | ALO | Addi | Krediya | Fuente | Confirmado | Gap |
|---|---|---|---|---|---|---|---|
| external_obligation_id | device | CONTRATO2 | loan_id | — | Archivos Drive | Sí, 3 plataformas | Krediya |
| customer_external_id | national id (documento) | IDENTIFICACION (documento) | id_number (documento) | — | Archivos Drive | No como ID de plataforma | IDENTIFIER_GAP + PII |
| platform | contexto PayJoy | PLATAFORMA | contexto Addi | — | archivo/campo | Sí, 3 plataformas | Krediya |
| store_id | merchant name | TIENDA_CREDITEK | store_name | — | archivo | No como ID estable | STORE_ID_GAP |
| currency | — | — | — | — | — | No | CURRENCY_GAP |
| original_amount | owed by PayJoy | MONTO_CREDITO | approved_amount | — | archivo | Sí, 3 plataformas | semántica de monto |
| outstanding_balance | — | — | — | — | — | No | BALANCE_GAP |
| installment_amount | parcialidades agregadas, no obligación | — | — | — | — | No | INSTALLMENT_GAP |
| due_date | — | — | — | — | — | No | DUE_DATE_GAP |
| status | transaction type, no estado de deuda | — | ownership, no estado de deuda | — | archivo | No | STATUS_GAP |
| days_past_due | — | — | — | — | — | No | DPD_GAP |
| last_payment_at | — | — | — | — | — | No | PAYMENT_GAP |
| last_payment_amount | — | — | — | — | — | No | PAYMENT_GAP |
| reconciliation_status | — | — | — | — | — | No | RECONCILIATION_GAP |
| source_updated_at | transaction time es evento | FECHA es evento | origination_date es evento | — | archivo | No como watermark | FRESHNESS_GAP |
| payment_external_id (adicional) | — | — | — | — | — | No | PAYMENT_ID_GAP |

### Tipos y sensibilidad

- Fechas confirmadas: `transaction time`, `FECHA`, `origination_date`. Son fechas de transacción/originación, no vencimientos ni actualización de saldo.
- Valores confirmados: montos financiados/originados, iniciales, comisiones, transferencias y gastos financieros. No se identificó saldo por obligación.
- Estados observados: tipos de transacción/propiedad y estados internos de liquidación; ninguno prueba mora vigente.
- PII presente: nombre, documento, teléfono/correo en algunos formatos, IMEI y vendedor. Ningún valor fue copiado a documentación, pruebas o sandbox.
- `SALDO EQUIPOS` en Addi aparece en resúmenes internos agregados; no es `outstanding_balance` del cliente.

### Conteo contractual

- PayJoy: 3/15 campos confirmados para contrato de cartera.
- ALO: 3/15 campos confirmados.
- Addi: 3/15 campos confirmados.
- Krediya: 0/15.

Los tres adaptadores con fuente real quedan `INCOMPLETE`. Ninguna plataforma está lista para cobranza hasta aportar, como mínimo, saldo vigente, vencimiento, estado y pagos identificables con fecha e ID.
