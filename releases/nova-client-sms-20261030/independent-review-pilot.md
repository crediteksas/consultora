# Revisión independiente del delta de piloto SMS

Corte: 30/10/2026. Solo código, pruebas locales y recibos. No se modificó el paquete que revisa Claude; este informe queda fuera del release.

**Resultado: sin hallazgos P1/P2 abiertos en este delta.** La restricción al número del piloto ahora está aplicada en SQL antes de crear el OTP o gastar una reserva; no depende de ocultar el botón.

## Alcance revisado

- Migración: `/Users/oscarm/.codex/visualizations/2026/10/23/01a1698b-25dc-7461-a98e-8b81521ce818/outputs/nova-operacion-20261029/source/supabase/migrations/20261030165534_nova_client_sms_otp_budget.sql`.
- Backend, UI y bundle: `/Users/oscarm/.codex/visualizations/2026/10/23/01a1698b-25dc-7461-a98e-8b81521ce818/outputs/nova-operacion-20261029/source/releases/nova-client-sms-20261030/`.

La consulta se hizo sobre los archivos del release y la migración actuales, no sobre los borradores anteriores de `outputs/nova-sms-20261030/sql` o `ui`.

## Comprobaciones del delta

1. La policy nace deshabilitada, modo `pilot`, lista de teléfonos vacía, límites de una reserva al día y al mes, presupuesto COP39. La lista acepta cero o un celular colombiano normalizado; rechaza NULL, dos teléfonos, dimensiones o límites de array manipulados. `service_role` solo puede leer la policy: no puede cambiar teléfono, modo o límites.
2. `reserve` conserva el control de enlace/origen activo y el bloqueo de presupuesto. En modo piloto, un celular distinto produce `SMS_PILOT_LIMITED` antes de insertar OTP o ledger. Repetir un UUID conocido devuelve `canSend:false`; cambiar de contexto/canal sigue siendo conflicto. El modo `active` requiere una modificación administrativa explícita y respeta los máximos generales.
3. El backend reconoce el rechazo de piloto como 403 `not_sent` sin cambiar automáticamente a WhatsApp. `options` manda a SQL un celular validado o NULL y publica únicamente `smsEnabled`; no devuelve teléfono, allowlist, modo ni datos económicos. SQL `options` y métricas tampoco devuelven la lista de teléfonos.
4. La UI consulta capacidad para el celular actual tras350ms, oculta el permiso anterior inmediatamente y descarta respuestas con generación o celular obsoletos. No solicita OTP automáticamente. La capacidad dinámica de SMS se separa del protocolo de un intento existente: perder permiso o fallar `options` no borra el UUID, la consulta, verificación, sesión, datos ni archivos del intento ya iniciado, y no lo convierte en flujo antiguo.
5. Los fallos conservan la reserva. Una segunda prueba autorizada por administración puede aumentar límites sin borrar ni reembolsar la anterior; sigue restringida al teléfono del piloto. Las métricas cuentan reservas persistentes, no solicitudes HTTP rechazadas antes de reservar.

## Validación

Ejecuté independientemente, con proveedores simulados:

- Servidor, proveedor e integración Worker: **42/42**.
- UI del delta: **21/21**.

Inspeccioné los recibos del agente SQL y sus pruebas de piloto:

- PostgreSQL17.11 nativo: **28/28**.
- Contención con dos conexiones: **5/5**, mismo SHA de migración y sin llamadas a proveedores.

Manifiesto sin discrepancias. `deploy/` contiene solo `index.mjs` y `form.html`, idénticos a raíz.

SHA256 verificados:

- SQL: `8e1b3bdc4a88aba5be9a12fbd146b85d751503fa0654dbd93c9312317fe8f0bd`.
- Formulario: `0f95fd3046df2e74b607a6f5dd9182c02048a5571e26a2689e73d72e61379c2e`.
- Bundle: `9a9c81c37a504c12be12b9fcc9a681be7209d9556367d1bb2f517936640d56e1`.

Las ocho comprobaciones Chrome existentes corresponden a la base anterior; no afirmo que se hayan repetido con este formulario. Este corte no prueba recepción de SMS, cargo comercial ni funcionamiento ya publicado. El piloto continúa cerrado hasta contar con las autorizaciones concretas y la configuración administrativa del número, sin inventar una entrega o un costo observado.
