# NOVA: invitación visual a referencias

Las referencias nuevas reciben el logo oficial de Creditek y dos respuestas rápidas: `Responder referencia` y `No participar`. El primer botón inicia la autorización existente, sin conceder consentimiento. Los enlaces anteriores conservan su validez original.

## Estado

- Implementación local; todavía no publicada.
- 45 pruebas aprobadas, cero omitidas. Claude aprobó el código; el manifiesto final fija los archivos de la entrega.
- Plantilla `nova_referencia_visual_v2`, `es_CO`, categoría solicitada `UTILITY`: enviada a Meta el 30/10/2026, ID `1848451827284866`, estado visible `En revisión`.
- Sin mensajes de prueba a personas ni modificaciones de datos, fotos, decisiones o base de datos.
- La selección usa V1 hasta que V2 esté aprobada, coincidan cuerpo/imagen/botones y se verifique el PNG público exacto. La aprobación del proveedor se comprueba desde el cron existente; este código no crea plantillas automáticamente.

## Compilación y comprobación

Desde la raíz del repositorio, con `esbuild` instalado:

```sh
node releases/nova-reference-buttons-20261030/build.mjs
node --test releases/nova-reference-buttons-20261030/*.test.mjs
node --check releases/nova-reference-buttons-20261030/index.mjs
wrangler deploy --dry-run --config releases/nova-reference-buttons-20261030/wrangler.jsonc
```

`NOVA_ESBUILD_PATH` permite indicar una instalación local ya existente de esbuild. No hace falta instalar dependencias durante una compilación.

`production-base.mjs` es la copia literal del Worker `creditek-nova` en producción, SHA256 `18b11dc3907fa57ad67c0756932db78684c3d74634924987e73a8481e4e6ada5`. El transform exige ese hash y anclas únicas; se detiene ante cambios. `index.mjs` es el artefacto completo, no requiere otro bundle. `build-receipt.json` y `testall-receipt.json` contienen los hashes verificados.

## Alcance y controles

Los payloads firmados de 87 caracteres vinculan acción, referencia, aplicación, origen, huella del expediente, destinatario y vencimiento de 24 horas. No llevan teléfonos ni nombres. Se aceptan únicamente después de validar la firma del webhook de Meta y se convierten dentro del servidor al comando existente, sin extender su vencimiento. Se conserva la verificación de fuente actual, consentimiento explícito, OTP, concurrencia y deduplicación de eventos.

La reserva de envío existente sigue siendo la autoridad. Los componentes se validan antes de reservar; si el transporte puede haberse iniciado y falta respuesta concluyente, queda `uncertain`, sin reenvío automático a ciegas. Un cambio de fuente detectado antes del transporte no se registra como posible envío. Los mensajes aceptados o inciertos no se reenvían para cambiarles el diseño.

El logo se sirve sin autenticación en `/branding/creditek-logo.png`; es el archivo de marca público, sin datos de clientes. Su SHA256 exacto es `8e24591baa84201ea72eab0638b42e11af4503d24230548d6385aedad8a45191`. El preflight solo lee metadata de las plantillas y la imagen; tiene límites de bytes, tiempo y redirecciones. Mantiene separados la aprobación de Meta y el estado efectivo de selección.

## Publicación controlada

Seguir `REGLAS.md`: revisión de Claude, commit/push, autorización/publicación y comprobación del artefacto real. No usar Quick Edit. Revalidar el hash actual de `creditek-nova`, sus 44 bindings, secretos heredados y cron `* * * * *` antes de publicar. Si difieren, detenerse y adaptar el candidato a la nueva base. No publicar `creditek-bot`, `creditek-clientes`, KORA, AURA ni Aliados con esta mejora.

La prueba en seco final usa Wrangler 4.156.0 y conserva byte por byte el SHA del candidato. La configuración conserva el tag de migración actual `nova-krediya-v1`, comprobado en los metadatos de la versión activa `539cf9d8-c82d-4a8a-87c7-32c8b3ce453d`. La entrada contiene solo el tag existente: no crea, migra, renombra, transfiere ni elimina clases ni cambia su almacenamiento. Wrangler no genera migraciones cuando el último tag de la configuración coincide con el tag desplegado. Si ese tag cambia antes de publicar, detenerse y revalidar. No reemplazarlo por una declaración de almacenamiento inventada.

Tras publicar: comparar el módulo descargado con `index.mjs`, los bindings y cron con el respaldo, verificar el PNG público por hash y `/pilot/retail-health`. Registrar V1/V2 seleccionada según la decisión real de Meta. No afirmar entrega real ni consentimiento a partir de mocks o del estado `accepted` del proveedor. Una prueba humana de una invitación nueva debe usar un destinatario autorizado; no reenviar invitaciones existentes para verificar el diseño.

## Fuentes de contrato

- [Colección oficial de Meta: plantilla interactiva](https://www.postman.com/meta/whatsapp-business-platform/request/lwtlz1k/send-message-template-interactive).
- [Buenas prácticas de Cloudflare Workers](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/).

El límite local de 128 caracteres ASCII para payloads es conservador; no se presenta como un límite numérico de Meta comprobado en esta revisión.
