# COP sin centavos en el informe de deuda

Corrige exclusivamente la presentación de moneda de los dos formatos de WhatsApp. Conserva los importes originales, suma exacta, pendientes y deduplicación por tienda. Se redondea al peso más cercano; diferencias menores a medio peso se muestran como un intervalo firmado en pesos, nunca como cero.

El código activo de creditek-clientes incluye cambios ajenos todavía ausentes del punto de entrada local. Este release se construye sobre la captura exacta de producción, con hashes fijados y solo dos reemplazos de formateadores más el helper compilado desde `src/moneda-cop.ts`. La reconstrucción inversa prueba que el resto del módulo sigue idéntico. No desplegar el Worker completo desde el wrangler.toml antiguo.

Preparación, con una captura privada en una carpeta temporal:

```sh
node releases/creditek-clientes-cop-enteros-20261120/build.mjs /tmp/kora-cop-20261120
COP_RELEASE_DIR=/tmp/kora-cop-20261120 node --test releases/creditek-clientes-cop-enteros-20261120/release.test.mjs
```

Antes de subir: revisión de Claude solo de código y pruebas ficticias, commit/push, verificación fresca de huellas de código y configuración y dry-run Wrangler del multipart. La configuración generada retiene todos los tipos de bindings del servicio activo. Publicar con `wrangler versions upload --keep-vars`, verificar la versión subida y activar únicamente esa versión con `wrangler versions deploy`. No sincronizar triggers ni rutas. Verificar después huellas, bindings, variables, horarios y subdominio conservados. No enviar mensajes de prueba ni reabrir reservas ya enviadas. La plantilla de Meta permanece idéntica.

`keep_bindings` es un campo funcional del metadata multipart de Cloudflare: conserva los bindings completos por los tipos enumerados, no solo variables. Ver documentación oficial de Upload Version: https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/versions/methods/create/. Wrangler 4.114.0 copia unsafe.metadata al metadata enviado; el dry-run exige igualdad exhaustiva del metadata y se comparan los bindings completos de la versión subida antes de activarla. La verificación de settings es simétrica. Cada recibo tiene nombre único con timestamp. Estos scripts solo leen producción y guardan artefactos locales de auditoría.

Usar `verify.mjs payload`, `verify.mjs preflight` antes de subir, `verify.mjs candidate` antes de activar y `verify.mjs postflight` después, siempre pasando como segundo argumento la carpeta privada de captura. La fase candidate comprueba que la versión activa anterior sigue igual y que la versión subida conserva todos los bindings, antes de dirigirle tráfico. Existe una ventana breve entre la lectura y la activación; detener si se observa una publicación concurrente. Una nueva toolchain o cambio del módulo base exige recaptura y revisión.

La API `services/.../content` devuelve el último módulo subido, incluso antes de activar una versión. Por eso preflight coteja el hash anterior y candidate/postflight cotejan el hash del candidato. El control independiente de deployments exige la versión anterior activa durante candidate y el candidato al 100% en postflight. La subida por sí sola no acredita publicación.
