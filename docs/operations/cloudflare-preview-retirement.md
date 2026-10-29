# Retiro reversible de pruebas antiguas — 29 de octubre de 2026

Autorización: revisión de Claude con código y pruebas ficticias, subida del commit
y retiro reversible del lote. No se autorizó borrado definitivo ni cambios de
datos, secretos, bases, logs, planes de facturación o aplicaciones operativas.

## Alcance fijo

Cerrar `workers.dev` y las URLs de preview de estos ocho Workers:

- `aura-agent1-design-preview`
- `aura-agent4-v1-1-preview`
- `aura-hub-staging`
- `aura-hub-staging-image-proxy`
- `aura-kora-agents-preview`
- `aura-ux-preview`
- `aura-commercial-kpis-api-staging`
- `creditek-integrations`

Quitar solamente el cron `*/5 * * * *` de `aura-agent4-api-core-preview`.
La fuente inspeccionada de `aura-runtime-core-preview` declara el consumidor
desactivado; su hash exacto es una precondición. Los seis Workers de ese conjunto
permanecen publicados. Se conservan sus datos y conexiones.

El procedimiento permite nueve ajustes de configuración; no despliega código.
KORA, AURA, Sofía, NOVA, sus entornos aislados, rutas y dominios se conservan.
Tampoco retira las previews de versión que usa el pipeline oficial de KORA.

## Preparación y revisión

1. Leer las reglas y `git status`. Trabajar aislado para no incluir otros cambios.
2. Ejecutar `node --test tests/security/cloudflare-preview-retirement.test.mjs`,
   `node --check scripts/maintenance/cloudflare-retire-previews.mjs` y `git diff --check`.
3. Enviar a Claude exclusivamente este procedimiento, el código y las pruebas
   ficticias. No adjuntar los snapshots ni datos de la cuenta.
4. Con la revisión aprobada, crear el commit y subir únicamente su rama a GitHub.
   No publicar KORA/AURA ni sincronizar commits ajenos pendientes de main.

## Aplicación

Definir `CREDITEK_REPOSITORY` con la ruta del checkout canónico cuya caché de
Wrangler identifica la cuenta. Usar su autenticación existente; nunca imprimirla.
Los archivos reales quedan fuera de Git y fuera de la revisión de Claude.

```sh
node scripts/maintenance/cloudflare-retire-previews.mjs capture /ruta/privada/antes.json
node scripts/maintenance/cloudflare-retire-previews.mjs apply /ruta/privada/antes.json HASH_INDICADO /ruta/privada/aplicacion.json
```

El snapshot debe tener como máximo 30 minutos y conservar su hash. Se exigen cero
invocaciones registradas del lote en los últimos 30 días, ausencia de rutas,
dominios, crons, consumidores de Tail y dependencias de entrada. La evidencia
faltante o truncada bloquea el cambio. Antes de escribir se repite la lectura.
Los techos conservadores son 99 Workers, 49 zonas y 999 filas agregadas de uso;
alcanzar el límite de página provoca un bloqueo para revisar la paginación,
nunca una conclusión de ausencia de dependencias o tráfico.

Las escrituras son únicamente POST de dos booleanos en `/subdomain` y PUT de la
lista vacía en `/schedules`. No hay DELETE, PATCH, despliegue o cambio de bindings.
Cada intento se registra antes de enviar y se comprueba después por GET. Se
verifican inventario, huellas de código/configuración, logs, rutas y ajustes
protegidos de todos los Workers. El recibo conserva el antes y el después.
Se fija también el deployment activo y sus versiones, para proteger los archivos
de Workers estáticos que no tienen ETag de JavaScript. Una versión ausente,
alterada o con reparto incompleto bloquea la aplicación y la reapertura.

Un error intenta restaurar los ajustes ya intentados, incluso ante respuesta de
red ambigua o fallo al escribir el journal. Si otra operación cambió el ajuste
o el código, se detiene esa restauración y se informa; nunca se fuerza.

## Reversión explícita

Además de la reversión automática ante fallo, se puede restaurar un recibo
aplicado, usando su hash canónico y un archivo de salida nuevo:

```sh
node scripts/maintenance/cloudflare-retire-previews.mjs restore /ruta/privada/aplicacion.json HASH_DEL_RECIBO /ruta/privada/restauracion.json
```

Esta función exige que el recibo y el snapshot estén íntegros y que las
operaciones pertenezcan al lote. No reabre código o configuración distintos ni
sobrescribe cambios concurrentes. Las pruebas ficticias verifican restauración
exacta después de una aplicación completa; no se hace una reapertura real como
prueba.

Después, comprobar por lectura páginas públicas de producción y los estados de
acceso del lote. No realizar ventas, envíos, pagos o cambios de datos como prueba.
La configuración del cron se comprueba por API; su propagación global es
asíncrona. No atribuir a esta ejecución el tráfico acumulado de otra ventana.

## Fuentes de la API

- [Subdomain](https://developers.cloudflare.com/api/typescript/resources/workers/subresources/scripts/subresources/subdomain/methods/create/)
- [Cron](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/schedules/methods/update/)
- [Métricas agregadas](https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-workers-metrics/)

No confundir una huella de metadatos con respaldo completo para borrar un Worker.
El borrado definitivo continúa pendiente de un respaldo restaurable y de una
autorización específica posterior.
