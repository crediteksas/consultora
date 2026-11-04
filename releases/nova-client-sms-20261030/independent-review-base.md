# Revisión independiente del candidato SMS cliente NOVA

Fecha del corte: 2026-10-30T17:10:21.294734+00:00. Revisión de código, bundle y pruebas locales. No ejecuté despliegues, DDL de producción, llamadas a proveedores ni mensajes.

**Resultado: sin hallazgos P1/P2 de código abiertos en el corte revisado.** Los tres defectos señalados durante la revisión fueron corregidos y sus regresiones pasan. La contención concurrente ya tiene evidencia nativa de cinco casos aprobados. El candidato puede continuar a revisión externa; todavía no acredita recepción real de SMS ni costo cobrado en una cuenta comercial.

## Correcciones comprobadas

1. **Reserva económica exacta antes del transporte.** `managed-otp.mjs:125-131` comprueba COP39 para SMS y COP0 para WhatsApp; si diverge, registra fallo sin iniciar transporte. `nova-client-otp.sql:11` fija la política en39. Antes era posible reservar1 y enviar un SMS de COP39. La regresión demuestra ausencia de llamada al proveedor y conservación de la reserva.
2. **Reloj fresco y vencimiento.** `managed-otp.mjs:125-134` comprueba la fecha inmediatamente antes de enviar y calcula la respuesta con hora actual. Antes podía enviar un código ya vencido después de esperar la reserva. La regresión demuestra que la demora más allá del TTL impide iniciar transporte y no extiende el TTL público.
3. **Estado verificado terminal en UI.** `ui/form-otp-sms.js:89-98` maneja `verified` de200/409, indica continuar en el formulario original, no inventa una sesión y cancela el temporizador y la consulta. Antes lo convertía en incertidumbre perpetua. La nueva prueba conserva fotos e impide consultas y reenvíos adicionales.

## Compatibilidad del registro antiguo con la bandera activa

Revisé de nuevo esta estrategia, que sustituye el bloqueo inicial basado en `ALLOW_LEGACY_REGISTRATION_LINKS`:

- `managed-otp.mjs:10-11`: el protocolo depende únicamente de `NOVA_SMS_ENABLED`. Mantener `ALLOW_LEGACY_REGISTRATION_LINKS=true` no impide el flujo seguro de SMS.
- `build.mjs:27-40`: con la bandera activa se inspecciona un `Request.clone()` limitado a4KB. Una solicitud segura, o con campos explícitos del protocolo nuevo, pasa por el wrapper. Una solicitud antigua que solo contiene el celular conserva el cuerpo original para su lector y el envío WhatsApp existente. Un campo de canal explícito nunca cae silenciosamente al envío antiguo.
- `build.mjs:43-48`: las cuatro anclas nuevas añaden **ambos filtros** `codigo_hash=is.null` y `enlace_registro_id=is.null` a las dos copias de verificación y a las dos copias de registro antiguo. Por tanto, sus lectores no pueden seleccionar un desafío seguro/SMS, incluso después de verificarlo, para autorizar un registro antiguo sin vínculo. Los OTP antiguos de texto plano siguen disponibles para su flujo previo.
- Los verificadores seguros, reserva original, reanudación, sesión, revisión de fotos y lógica de registro seguro no se modifican. Las pruebas de integración comprueban identidad de las funciones transformadas y los mismos exports del Worker.
- El trigger SQL se ejecuta antes de insertar el OTP y toma los locks de teléfono/enlace. Un SMS vigente no verificado impide crear otro OTP por el caller anterior; la inserción precede al envío WhatsApp de texto plano. En el orden inverso, la reserva nueva observa cualquier OTP vigente y bloquea SMS. El comportamiento antiguo entre solicitudes exclusivamente WhatsApp sigue siendo el anterior; no atribuyo deduplicación nueva universal a ese flujo.
- El build está fijado al SHA de producción `744e1ee8db4cafde7a5774cc01799e00263b9af669f3af20a2fa615ff0e3ae18` y contiene exactamente **ocho anclas**. Verifiqué que el formulario incorporado coincide byte a byte con el candidato UI y que el hash del bundle coincide con el recibo.

No detecté un P2 nuevo por conservar la disponibilidad del registro antiguo bajo este aislamiento.

## Controles inspeccionados

- SQL concede permiso de iniciar transporte una sola vez por UUID persistente; un UUID reutilizado con otra identidad, enlace o canal se rechaza. Serializa teléfono, enlace, solicitud y presupuesto con advisory locks transaccionales en orden consistente.
- Los fallos e incertidumbres retienen la reserva económica. Timeout, respuesta desconocida o recibo no persistido mantienen incertidumbre, sin reintento ni cambio automático de canal. `found:false` no prueba que una reserva con timeout no pueda todavía confirmar.
- `status` está vinculado a UUID, documento, celular y enlace. Solo devuelve `otpId` enaccepted; no expone código, destino, costo, attemptId ni ID del proveedor. Las funciones nuevas usan SECURITY INVOKER y search_path vacío; las tablas tienen RLS y los permisos nuevos son solo de servicio.
- La UI conserva objetos File, nodos, recibos y cachés de revisión. Verifica mediante el contrato original y retoma el expediente. No añade reset, recarga ni reemplazo de inputs de archivo. No se afirma conservación si el usuario cierra o recarga el navegador.
- La recepción200/202 del proveedor se registra como aceptación o procesamiento/cola, sin afirmar entrega o lectura. No se envían fotos ni documentos al proveedor SMS.

## Validación y límites

Ejecuté independientemente:

- `node --test managed-otp.test.mjs` — **21/21** en el código actualizado.
- `node --experimental-vm-modules --test worker-integration.test.mjs` — **9/9** en el bundle actualizado.
- `node --test form-candidate.test.mjs` — **15/15** después del arreglo de estado verificado.

También inspeccioné los recibos y el harness de PostgreSQL nativo del agente SQL, sin volver a ejecutarlos:

- Funcional: **19/19**, `PostgreSQL 17.11 on aarch64-unknown-linux-musl, compiled by gcc (Alpine 15.2.0) 15.2.0, 64-bit`.
- Contención: **5/5**, dos sesiones simultáneas y espera real de aproximadamente613–622ms: mismo UUID concede un único envío; caller WA anterior espera al SMS y queda bloqueado; OTP anterior marcado fallido sigue bloqueando SMS; límite global serializa teléfonos/enlaces diferentes; costo anómalo confirmado se observa antes de otra reserva.
- Ambos recibos corresponden al SQL SHA `c60603b3b9d65ddb05b9cc144e5e3a9983cc9c019608306ddcae1bb705f9938d` y declaran cero DDL de producción y cero llamadas a proveedores. El recibo WASM previo no certificaba concurrencia; el recibo nativo nuevo resuelve esa limitación para estos cinco casos.

Las pruebas UI usan VM y DOM simulado con objetos File reales. No certifican todos los navegadores ni recuperación después de cerrar la pestaña. Queda un piloto expresamente autorizado para confirmar recepción en el teléfono, validación del mismo desafío y cargo de un SMS. Esta revisión no constituye por sí sola autorización de despliegue o compra.

## Archivos exactos del corte

- `/Users/oscarm/.codex/visualizations/2026/10/23/01a1698b-25dc-7461-a98e-8b81521ce818/outputs/nova-operacion-20261029/source/releases/nova-client-sms-20261030/managed-otp.mjs` — SHA256 `268201eabc2351b944bdd16356dc4c976885e67b0e296a2a3b2823bdd2ece521`
- `/Users/oscarm/.codex/visualizations/2026/10/23/01a1698b-25dc-7461-a98e-8b81521ce818/outputs/nova-operacion-20261029/source/releases/nova-client-sms-20261030/managed-otp.test.mjs` — SHA256 `6c3957d85a46f0527078dc7d44372c1a95276f361afc18d2b41d86dc6db57dac`
- `/Users/oscarm/.codex/visualizations/2026/10/23/01a1698b-25dc-7461-a98e-8b81521ce818/outputs/nova-operacion-20261029/source/releases/nova-client-sms-20261030/build.mjs` — SHA256 `97807ddc54aeb0a2adcd03cd5d250a4052cd56730f2c277371c0b9ef9646d6bf`
- `/Users/oscarm/.codex/visualizations/2026/10/23/01a1698b-25dc-7461-a98e-8b81521ce818/outputs/nova-operacion-20261029/source/releases/nova-client-sms-20261030/build-receipt.json` — SHA256 `9c4b2608d865a7a2b7f3bcb4d52b3e3084d6cce0c6868aa127c82f1e4f0ddae5`
- `/Users/oscarm/.codex/visualizations/2026/10/23/01a1698b-25dc-7461-a98e-8b81521ce818/outputs/nova-operacion-20261029/source/releases/nova-client-sms-20261030/worker-integration.test.mjs` — SHA256 `69a3d37d45cd372ad4fa5d496c57286447adc051503433bf59d778aa59de5e2f`
- `/Users/oscarm/.codex/visualizations/2026/10/23/01a1698b-25dc-7461-a98e-8b81521ce818/outputs/nova-operacion-20261029/source/releases/nova-client-sms-20261030/index.mjs` — SHA256 `dc774374a2b41ef53b291f18bc636b07188534c2e0468699816f32c7f1e3e915`
- `/Users/oscarm/.codex/visualizations/2026/10/23/01a1698b-25dc-7461-a98e-8b81521ce818/outputs/nova-operacion-20261029/source/releases/nova-client-sms-20261030/form.html` — SHA256 `3a87f636b8d173d7c883424a58cc97510d4730cf841c41465f55dc2527bf4ce2`
- `/Users/oscarm/.codex/visualizations/2026/10/23/01a1698b-25dc-7461-a98e-8b81521ce818/outputs/nova-sms-20261030/ui/form-otp-sms.js` — SHA256 `d84f6d48682dbb02552b00531b0f9040b43211a8b8a6f5a6887c6aba96e4c5c2`
- `/Users/oscarm/.codex/visualizations/2026/10/23/01a1698b-25dc-7461-a98e-8b81521ce818/outputs/nova-sms-20261030/ui/form-candidate.html` — SHA256 `3a87f636b8d173d7c883424a58cc97510d4730cf841c41465f55dc2527bf4ce2`
- `/Users/oscarm/.codex/visualizations/2026/10/23/01a1698b-25dc-7461-a98e-8b81521ce818/outputs/nova-sms-20261030/ui/form-candidate.test.mjs` — SHA256 `5d30b77df3a0f00a845b752e89133be55ad7d197f993472cde692cb07f1c7faa`
- `/Users/oscarm/.codex/visualizations/2026/10/23/01a1698b-25dc-7461-a98e-8b81521ce818/outputs/nova-sms-20261030/sql/nova-client-otp.sql` — SHA256 `c60603b3b9d65ddb05b9cc144e5e3a9983cc9c019608306ddcae1bb705f9938d`
- `/Users/oscarm/.codex/visualizations/2026/10/23/01a1698b-25dc-7461-a98e-8b81521ce818/outputs/nova-sms-20261030/sql/native-test-receipt.json` — SHA256 `d0176bb4e08d86fc2e53a47a4e9bb48d516836edef79fd62f61174019e16801f`
- `/Users/oscarm/.codex/visualizations/2026/10/23/01a1698b-25dc-7461-a98e-8b81521ce818/outputs/nova-sms-20261030/sql/native-concurrency-receipt.json` — SHA256 `40069ebd8eb386117d5ca777c39588273421a7647c78493a5c585d57c82d09eb`
