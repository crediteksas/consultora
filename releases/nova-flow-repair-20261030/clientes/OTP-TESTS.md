# OTP03 — pruebas independientes

No modifica `otp-transform.mjs` ni la migración del root.

- `otp-repair.test.mjs`: 20/20 pruebas offline contra el Worker transformado, SQL real capturado y formulario compuesto de `ui-transform.mjs`.
- `otp-fixture.mjs`: PGlite, transporte cerrado y captura estricta de los endpoints simulados. Acepta PGLITE_MODULE; nunca instala paquetes ni llama proveedores.
- `otp-test-receipt.json` y `otp-test-results.tap`: resultado y hashes.
- `otp-acl-receipt.json`: ACL, SECURITY DEFINER/INVOKER y search_path leídos de las dos funciones reales. Los tests conservan esos permisos.
- `native-concurrency.mjs`: preparado para el contenedor local del root. No inicia contenedores. Utiliza dos sesiones PostgreSQL reales y una base propia `nova_otp_flow_20261030`, separada de las pruebas de plataformas. El resultado solo se acredita cuando exista `otp-native-concurrency-receipt.json` de una ejecución satisfactoria.

## Casos que pasan

1. Primer HTTP200 aceptado perdido entre backend y navegador. Con CAPTCHA nuevo, la segunda solicitud devuelve202 accepted, el formulario compuesto muestra dónde introducir el código, conserva las tres fotos y no reserva ni envía otro.
2. Dos solicitudes del mismo contexto leen simultáneamente ausencia. El guard SQL permite una sola reserva; la otra relee el reto de su contexto y devuelve202. Se simula la carrera de solicitudes en PGlite; la concurrencia de PostgreSQL multiproceso se prueba aparte.
3. Otro documento/enlace con el mismo celular obtiene409 sin identificar el reto previo ni revelar documento, celular, enlace o estado de aceptación.
4. Resultado incierto, fallo o ACK perdido conserva el reto y su plazo. No hay otro envío mientras siga activo.
5. Reto vencido, verificado o consumido permite una nueva solicitud explícita, sujeta a las cuotas originales3 por celular y60 por enlace.
6. Lectura o reserva indeterminada, metadatos grandes/malformados y estados contradictorios bloquean antes de enviar.
7. Lectura activa ocurre después del CAPTCHA y validación de contexto. Reutilizar el CAPTCHA falla antes de leer el reto; la recuperación necesita otro CAPTCHA manual.
8. El guard es invocador; la reserva conserva su SECURITY DEFINER previo. No se amplían privilegios ni se cambian las cuotas.
9. SMS permanece apagado y ningún mock admite API SMS o endpoints reales.

## Ejecutar desde la raíz del checkout

```sh
node --test releases/nova-flow-repair-20261030/clientes/otp-repair.test.mjs
NOVA_SQL_NATIVE_CONTAINER=nova-flow-sql-20261030-a1 node releases/nova-flow-repair-20261030/clientes/native-concurrency.mjs
```

Las pruebas nativas verifican WA/WA, WA/SMS y SMS/WA con bloqueo real entre dos sesiones: segundo intento OTP_ACTIVE y un único reto activo. No acreditan recepción real del código ni una validación humana. Los fixtures y pruebas no pertenecen al bundle de despliegue.

