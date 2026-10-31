# WhatsApp OTP: rechazo confirmado y recuperación sin reenvíos

Cuando Meta aceptaba un OTP y luego lo rechazaba, CLIENTES conservaba solo el
booleano de aceptación. El formulario decía «Ya hay un código solicitado» sin
incorporar el rechazo firmado. El caso KREDISINÚ se diagnosticó en producción,
pero este paquete contiene únicamente datos ficticios y código.

La corrección mantiene el registro de aceptación y añade un vínculo inmutable
OTP–wamid, leído solo en el servidor. NOVA utiliza su binding y secreto existentes
para consultar por ID exacto, destinatario exacto, fecha y fuente signed_webhook.
El endpoint interno requiere el secreto de intake; nunca devuelve teléfonos,
documentos ni códigos a clientes. El cliente consulta su enlace, cédula y celular, fijando además el intento
mediante un UUID opaco recibido del servidor. Ese UUID no revela el código ni
el ID de Meta y no autoriza otra identidad. Recibe un estado mínimo con rate limit.

Un fallo firmado prevalece sobre progreso incluso fuera de orden; se registra
aparte de la aceptación. Ningún evento de otra identidad o intento puede aplicarse.
El SQL es aditivo, SECURITY INVOKER, service_role exclusivamente, con RLS y un
guard que impide verificar un OTP cuyo mensaje exacto haya sido rechazado. No se
modifican las cuotas ni la espera conservadora de cinco minutos para otro envío.
El nuevo sender se usa solo en WhatsApp seguro; el helper booleano del legado
plaintext permanece intacto. Los verificadores heredados y registro/fotos se
conservan, salvo comprobar el nuevo rechazo antes de verificar el OTP seguro.

El formulario nuevo consulta cada ocho segundos durante el tiempo restante del
intento, conserva los mismos nodos y objetos File y nunca reenvía automáticamente.
Un rechazo oculta la entrada de código y da una acción concreta y una cuenta
regresiva para solicitar OTRO código. Aceptación no se presenta como entrega.
Un código rechazado tampoco se restaura por respuestas de estado antiguas.

Las pestañas que ya estaban abiertas tienen el JavaScript anterior. Este paquete
no las recarga ni garantiza una actualización en caliente: recargar puede perder
selecciones todavía no enviadas. Un click posterior que consulte un intento
rechazado recibe HTTP502 (también evita devolver «pendiente» al HTML viejo).
Los intentos antiguos sin wamid no se vinculan por teléfono y hora; se conserva
su expiración original y se informa vencimiento finito, sin inventar evidencia.

SMS permanece bloqueado por su policy SQL. Su código, llave, límites, ledger,
proveedor y flags no cambian. La recepción humana de la prueba anterior llegó
aproximadamente2h19después, fuera del OTP. El timeout de8s de la confirmación
es un problema distinto de la demora y no se considera su causa. Este paquete
no envía SMS, no aumenta el TTL, no amplía el piloto ni crea una segunda prueba.

Validación reproducible:

```
node releases/nova-otp-delivery-20261031/build.mjs
node --test releases/nova-otp-delivery-20261031/tests/server-helper.test.mjs
node --test releases/nova-otp-delivery-20261031/ui/delivery.test.mjs
node --test releases/nova-otp-delivery-20261031/sql-tests/delivery.test.mjs
node releases/nova-otp-delivery-20261031/tests/workerd-bundle.mjs
```

Las pruebas de SQL usan PostgreSQL embebido PGlite; no se afirma haber ejecutado
carreras nativas en un servidor PostgreSQL independiente. El guard adquiere
locks de fila en el mismo orden que la aplicación del recibo. Workerd ejecuta
los paquetes completos con toda salida interceptada y destinos sintéticos.
No se han usado números reales en pruebas ni se han publicado estos archivos
al preparar el paquete. La revisión Claude, commit/push y publicación requieren
comprobantes separados, y se verifican hashes y configuración antes/después.
