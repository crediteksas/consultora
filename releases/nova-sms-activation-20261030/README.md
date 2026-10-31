# Compatibilidad WhatsApp al activar SMS

Candidato aislado para revisión. No se activó SMS ni se enviaron mensajes reales.

El flag NOVA_SMS_ENABLED seleccionaba el backend gestionado también para formularios WhatsApp legacy que no envían request_id. Con teléfonos fuera del piloto, esos formularios mantienen opciones.smsEnabled=false: después de un200 perdido, el reintento generaba otro UUID, devolvía409 y ocultaba el campo del código ya solicitado.

El cambio quita esa selección implícita. Solo channel/request_id/sms_reason explícitos eligen el protocolo gestionado. WhatsApp legacy continúa usando sendSecureOtp2 ya reparado, que recupera el reto existente mediante202 accepted y conserva la entrada del código. SMS apagado continúa rechazando solicitudes gestionadas explícitas.

## Baseline y alcance

- Baseline copiada de la captura actual de producción: Worker6a5d0d76296d91c44f22398823c54749b4a2ae30ec5923c27e47da254eac0c7d.
- Form ef6c89485e34b4b80f7df3e68f962c0ac66232d4a0e7ec8e3a06073554810b07 permanece idéntico, incluido su script embebido.
- Candidato6010453e3c6aa8d07fb9e4f213c67119cd0a8c9360a864a861b727810ff5fee4.
- Un único cambio de una línea en handleOtpEnviarRoute2. Revertir esa línea reproduce exactamente todos los bytes de la baseline: exports, funciones, formulario embebido y reparaciones previas conservados.
- No cambia SQL, otros Workers, permisos, políticas, límites ni configuración. Root añadirá la configuración copiada de producción con sus bindings. No reutilizar una configuración o bundle anterior del paquete SMS.

## Validación

13/13 pruebas pasan. Usan el router real, emisor gestionado real, emisor legacy cuya igualdad con producción se comprueba, SQL real capturado y el script DOM exacto publicado. Todos los destinos son mocks cerrados.

Cubren la regresión original y recuperación candidata con el primer200 recibido/perdido; mismo código sin segundo envío; replay UUID; SMS bloqueado con flagfalse;403 fuera del piloto; plaintext legacy; retos WhatsApp/SMS que se bloquean mutuamente sin reiniciar el plazo. El guard SQL existente no se modifica. Estas últimas pruebas comprueban ambos órdenes en memoria; las carreras nativas anteriores permanecen como evidencia separada del release nova-flow-repair y no se atribuyen como nuevas ejecuciones a este candidato.

```sh
node releases/nova-sms-activation-20261030/build.mjs
node --test releases/nova-sms-activation-20261030/tests/route.test.mjs
node --check releases/nova-sms-activation-20261030/deploy/index.mjs
```

PGLITE_MODULE puede indicar un módulo local ya instalado. Las pruebas reutilizan helpers del release previo y comprueban que ejecutan exactamente el emisor y script actuales. Los snapshots SQL/fixtures y helpers son exclusivamente de pruebas; desplegar solo deploy/index.mjs y deploy/form.html con la configuración verificada por root. El diff está en candidate.diff, los hashes en manifest.json y los resultados en tests/receipt.json y tests/results.tap.

