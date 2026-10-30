# AURA Sofía: actualizar la conversación abierta — 30 octubre 2026

El sondeo existente de 15 segundos cargaba mensajes, clientes y contadores, pero no volvía a pintar el historial del chat seleccionado. También ocurría al pulsar Actualizar. En la grabación del propietario el mensaje manual se veía, mientras su Hola posterior y la respuesta de Sofía ya estaban guardados y no aparecían en esa vista.

La carga completa ahora refresca únicamente el contenido de la conversación abierta. Se comparte el formateador con la apertura inicial del chat; se trata el texto recibido como texto para impedir HTML ejecutable. El editor, su selección, el estado de envío y los detalles no se reconstruyen. Si el usuario lee historial se conserva su posición; si está al final acompaña los mensajes nuevos. No se repinta cuando el contenido no cambia. Se conserva el sondeo de 15 segundos.

Validación: nueve pruebas nuevas de comportamiento y capa selectiva. En la selección ampliada, 74 de 76 comprobaciones pasan; las dos restantes ya fallan en HEAD sin esta corrección (expectativas antiguas de URL /api/enviar-mensaje y autorización inline de Meta). Se comprobó la misma pareja de fallos sobre una copia temporal de HEAD. No se modificaron ni se desactivaron esos tests. Las pruebas del proxy autenticado pasan.

La publicación conserva los ocho módulos previos y añade live-chat-ui.mjs con verificación exacta del predecesor. Las otras rutas, el código de creditek-bot y NOVA, configuraciones y presupuesto permanecen iguales. No se enviaron mensajes ni se escribieron registros de clientes para probar el arreglo.

En producción se observaron el Hola entrante y la respuesta de las 15:50 de Colombia, y se comprobó que Actualizar conserva un borrador, que luego se retiró sin enviarlo. El aviso de SLA existente corresponde al seguimiento de la prueba anterior; este cambio no lo oculta ni lo marca como contacto de tienda.

Evidencia: verification.json. La publicación falla ante cambios concurrentes; no repetir --apply sobre el despliegue ya actualizado.
