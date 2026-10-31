# KREDISINÚ: continuación de referencias

Estado: candidato local para revisión. No se publicó, reenviaron mensajes, reprodujeron webhooks reales ni modificaron datos.

La función `referenceSourceProof` de CLIENTES conservaba dos restricciones del piloto inicial: aceptaba exclusivamente `CK-02` y consultaba el estado de ese origen fijo. KREDISINÚ corresponde a `CK-09`, ya incluido en la configuración piloto. NOVA utiliza esta prueba por el binding `KORA_REGISTRATION_SOURCE`; al obtener filas vacías, `verifyReferenceSource` devuelve false y `processReferenceMessage` se detiene en `guard_4`, antes de registrar la transición o enviar la siguiente pregunta.

El segundo defecto es independiente: se devolvían las referencias originales de `registration.p_referencias`. Después de un reemplazo, ese snapshot no representa al contacto vigente. El candidato utiliza el RPC existente `kora_nova_effective_references(p_source uuid)`, sin fallback al snapshot. El catálogo consultado el 31/10 confirmó función invoker estable, EXECUTE y SELECT de las dos tablas para `service_role`, y ausencia de EXECUTE para `anon`/`authenticated`. No requiere migración ni permisos nuevos.

## Cambio local

- Mantiene el token interno, método POST, UUID, límites, timeouts, aislamiento por solicitud/cliente/aplicación, autorización y vinculación por hash de teléfono que ya comprobaba NOVA.
- Exige origen `CK-01` a `CK-09` incluido en `NOVA_REGISTRATION_PILOT_ORIGINS`; los distintos de `CK-02` requieren además `NOVA_RETAIL_ENABLED=true`, igual que el enlace piloto existente.
- Consulta el origen exacto del expediente y exige una sola fila, código concordante y estado activo.
- Lee las referencias efectivas del mismo `sourceId`; valida 1–2 roles únicos, teléfono de formato válido y autorización booleana. Cada rol sigue comprobándose de forma independiente en NOVA. Un fallo del RPC detiene el flujo; nunca recupera un contacto antiguo.

Solo cambia `referenceSourceProof`. El resto del Worker y el HTML externo/incrustado permanecen idénticos al antecesor publicado `f3fd64f53e7e0d3049964a4f6fab384dd3941376ebae72fbe3324c654670665d`. Se conservan el piloto SMS y sus controles, los OTP, deduplicación y todos los límites. No contiene claves, teléfonos reales, códigos ni datos de clientes.

## Verificación

Desde la raíz del repositorio:

```sh
node releases/nova-reference-source-origins-20261031/build.mjs
node releases/nova-reference-source-origins-20261031/tests/run.mjs
```

Las 62 pruebas ejecutan la función real de CLIENTES junto al `context` y `verifyReferenceSource` reales de NOVA dentro de VM con todas las llamadas cerradas a respuestas ficticias. Reproducen CK-09 rechazado en el antecesor y permitido con el candidato, los nueve orígenes y subconjuntos configurados, origen activo incorrecto, cliente/aplicación/solicitud/teléfono/consentimiento cruzados, referencia reemplazada vigente frente a la anterior y errores del RPC sin fallback. Dos expedientes existentes ficticios con el mismo teléfono siguen aislados por fuente y aplicación. Las funciones HMAC reales de NOVA rechazan diferencias de aplicación, fuente, rol, versión del expediente, destinatario y expiración. Se fija el hash del antecesor y se verifica igualdad de todos los bytes fuera de la función. El Worker completo supera `node --check`.

El recibo vigente y hash del candidato están en `tests/receipt.json` y `manifest.json`. Los mocks no prueban entrega real, no validan un webhook histórico específico y no hacen llamadas a proveedores. Los auxiliares de token y lectura acotada se simulan en VM; sus implementaciones y sus llamadas no cambian en el candidato. La firma de los payloads y su vínculo con versión/teléfono/aplicación siguen en NOVA sin modificaciones.

## Recuperación operativa

Los datos de producción y el diagnóstico del caso reportado se conservan fuera de este paquete. La revisión de código utiliza solamente datos ficticios. El defecto por origen se reproduce determinísticamente con CK-09 en las pruebas cerradas.

Publicar esta corrección no reproduce automáticamente un clic previo. Para recuperar un evento histórico hace falta el webhook original firmado y correlacionado, o un nuevo clic en la invitación vigente. No se debe sintetizar una aceptación ni afirmar que se contestó el formulario. Este paquete no envía invitaciones ni reproduce webhooks.

Se consultó la documentación oficial de prácticas Workers. Este cambio no introduce APIs, bindings, configuración ni tipos nuevos.
