# NOVA: recuperación de registro, fotos, códigos y referencias

El usuario podía quedar detenido al vencer una sesión, cambiar una foto durante Guardar o corregir la cédula mientras volvía la verificación. Una respuesta perdida del envío WhatsApp permitía reservar otro código; un timeout al preguntar consentimiento podía cerrar la conversación de la referencia. La auditoría también encontró revocaciones generales no revalidadas al aprobar y recuperación incompleta de una consulta interrumpida.

Este paquete corrige los nueve defectos del informe del 30/10/2026 y el bloqueo adicional de la rama SMS todavía apagada. Parte de los dos Workers reales publicados, no del código histórico divergente. Los transformadores rechazan deriva y generan un paquete mínimo de tres módulos: CLIENTES/index + form y NOVA/index. `manifest.json` fija sus hashes, las configuraciones y las tres migraciones, separadas por proyecto.

## Comportamiento resultante del candidato

- Al vencer documentos se ofrece volver a verificar el celular en la misma página. Se mantienen los nodos/objetos File, valores, solicitud e IDs; se suben solo fotos faltantes. No conserva archivos sin guardar después de cerrar/recargar el navegador.
- Guardar congela las entradas y descarta respuestas de revisión cuyo archivo/contexto cambió. El payload coincide con la foto seleccionada.
- La respuesta de verificar se liga a la identidad que originó la petición. Una identidad corregida requiere su verificación, sin aparentar una sesión para otra cédula.
- Solo un error definitivo de sesión anterior a cualquier resultado incierto permite renovar la credencial del payload. Un timeout o 5xx conserva el intento idempotente; `nova-retomar` recupera una solicitud ya guardada. Un `found:false` aislado no autoriza duplicarla.
- El guard SQL serializa desafíos seguros por celular, incluidos transportes fallidos/inciertos. Un segundo intento del mismo contexto recupera el desafío sin otro envío; uno de otro contexto recibe un rechazo genérico sin datos personales. Se mantienen TTL y cuotas originales.
- Callbacks antiguos no borran un fallo posterior ni regresan una lectura/entrega. Un timeout de consentimiento queda incierto y recuperable; solo un nuevo mensaje real permite avanzar el mismo diálogo, sin reenviar la pregunta, inventar consentimiento o reiniciar su plazo.
- La aprobación y nuevas gestiones comprueban la autorización general vigente. Se preserva el histórico; el TTL específico de consultas no revoca la autorización general. El historial puede conservarse aunque las fotos y nuevas operaciones queden bloqueadas.
- La recuperación de consultas repone inputs únicamente al mismo lote pendiente, con autorización vigente y sin nuevos trabajos, reservas o llamadas proveedor.
- SMS permanece apagado, sin compra, consumo o envío adicional. La rama gestionada permite corregir la identidad después de verificar sin quedar bloqueada.

## Límites externos que permanecen

Aló exige un `captchaToken` en su formulario humano actual y el reader local no lo envía. Se necesita un canal de integración admitido o un flujo humano permitido; este paquete no genera/elude CAPTCHA. Los HTTP403 anteriores no conservan cuerpo para acreditar una causa retrospectiva exacta.

PayJoy devolvió una respuesta válida sin objeto customer. Su API documenta financiamiento/historial, pero no permite deducir la causa de esa respuesta ni justificar cambiar a ciegas el formato del teléfono. KrediYA continúa con transporte no verificado/deshabilitado. No se interpretan estos estados como ausencia de deuda. No se hicieron consultas crediticias durante esta reparación.

## Validación

Las suites ejecutan las funciones y bundles reales con fixtures y transportes cerrados. `clientes/ui-tests` contiene controles baseline que reproducen el fallo y candidato que lo corrige, además de cuatro pruebas en Chrome aislado con File/DataTransfer reales. Los recibos separan VM/Chrome y las consultas SQL locales de los comportamientos reales de proveedor. `plataformas` y `clientes` incluyen pruebas concurrentes de dos conexiones PostgreSQL 17.11, sin puertos, red ni montajes del Mac. Los diez defectos no se consideran corregidos en producción por pasar esas pruebas.

```sh
node releases/nova-flow-repair-20261030/build.mjs
node releases/nova-flow-repair-20261030/verify-package.mjs
node --experimental-vm-modules --test releases/nova-flow-repair-20261030/tests/package-integration.test.mjs
node releases/nova-flow-repair-20261030/clientes/ui-tests/run-tests.mjs
```

Los demás comandos y límites están en `clientes/OTP-TESTS.md`, `referencias/README.md` y `plataformas/README.md`. No ejecutar fixtures contra un DSN real. El cron, rutas, servicios, Durable Objects, Hyperdrive, flags y secretos por nombre se conservan; configuración tomada nuevamente de los dos Workers el 30/10/2026. No se modifican Sofía, KORA Worker, AURA Worker, REGISTRO ni despliegues ajenos.

## Publicación y reversión

1. Aprobar revisión independiente del paquete exacto y registrar commit local. La revisión técnica no constituye por sí sola autorización; la ejecución debe estar comprendida en la instrucción vigente de Óscar y seguir el orden de REGLAS.md.
2. Revalidar versión/hash de ambos predecesores y catálogo/ACL/constraints de las funciones, y respaldar su configuración. Abortar ante deriva. No ejecutar db push de migraciones históricas ni modificar el control global de KORA.
3. Con autorización concreta, aplicar las tres migraciones fijadas por hash: referencias solo en DITI/AURA; guard OTP y consentimiento solo en KORA. Aplicar SQL antes del código, usando historial real y verificación de privilegios; no generar/reabrir solicitudes ni diálogos históricos.
4. Publicar CLIENTES primero, para habilitar su allowlist privada; luego NOVA. Verificar módulos vivos byte por byte, 31/44 bindings, cuatro cron y cinco rutas, además de rechazo sin credenciales y SMS apagado.
5. No enviar mensajes de prueba ni reconsultar clientes como parte de verificar el despliegue. Una prueba humana/provider requiere consentimiento vigente y su flujo autorizado. Mantener separados aceptado, entregado, leído, respondido y decisión.

La reversión preferida restaura los dos Workers anteriores manteniendo las protecciones SQL compatibles. Si se necesita revertir SQL, primero retirar dependencias del Worker y validar datos actuales: nunca estrechar el constraint de referencias mientras haya filas `uncertain`, borrar evidencia, reiniciar consentimientos o liberar desafíos activos para poder revertir. `sql/kora-consent-repair-rollback.sql` conserva historial y restaura definiciones; no se ejecuta automáticamente ni como parte de esta reparación.

## Estado publicado

Publicado con autorización expresa de Óscar para NOVA y CLIENTES. `production-receipt.json` acredita módulos vivos, versiones, bindings, rutas, tareas y pruebas HTTP; `manifest.json` describe el artefacto de construcción. Las migraciones se renombraron al historial real mediante `preflight/applied-migration-aliases.json`, conservando exactamente el SQL aprobado. SMS continúa apagado y los bloqueos externos indicados siguen abiertos.
