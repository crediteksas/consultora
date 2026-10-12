# Corrección del destino real de la aplicación

La inspección de rutas del 11 de octubre identificó la causa de que no apareciera el acceso: `creditek-aura-shell` tiene tres rutas sobre el dominio de `creditek-aura`. Esas rutas sirven un HTML incorporado en el Worker, independiente de los assets del origen. Los despliegues previos modificaron el origen, no este componente. El soporte preparado no debe enviarse como explicación de este problema.

La corrección conserva una copia exacta de los dos módulos del shell activo y la envuelve con el mismo HTMLRewriter ya probado. Solo cambia los dos GET del panel, añadiendo tarjeta y menú de Contenido orgánico. El resto, incluso el proxy `fetch(request)` documentado para Routes frente a Custom Domains, se delega al código original sin cambios. No necesita nuevo Worker, bindings ni cambios de rutas/assets. Se conserva la fecha de compatibilidad y los logs actuales; no se agregan dependencias Node en runtime.

## Verificación y despliegue

1. `npm run test:organic`: 24/24 pasan, incluidos preservación byte por byte del HTML y solicitudes no relacionadas.
2. `npm run build:aura:organic` y `node scripts/build-aura-organic-shell.mjs`.
3. `node scripts/check-organic-app-local.mjs`: bundle real del shell, sesión/APIs simuladas; abrir tarjeta, actualizar, borrador en memoria, escribir, scroll y Volver. No guarda ni publica.
4. Revisión Claude, commit y push antes de subir.
5. `node scripts/check-aura-organic-shell-remote.mjs`: exige hashes originales, rutas y bindings esperados; conservar versión anterior para rollback.
6. `wrangler versions upload --no-bundle -c releases/aura-organic-20261011/wrangler.shell.jsonc` y `wrangler versions deploy ID@100 --yes -c ...`. Usar versiones, no un deploy que sincronice rutas.
7. `node scripts/check-aura-organic-shell-remote.mjs --after` y `node scripts/check-organic-app-local.mjs --live`. Verificar que no cambien rutas ni otros módulos. Si falla, redeplegar la versión anterior con el mismo config; no sobrescribir assets ni datos.

No dar el congelamiento de la ventana de Oscar por reproducido: requiere confirmar allí tras recargar la aplicación instalada. No se activan publicaciones automáticas ni se consulta soporte.

Referencia oficial del proxy ya existente: https://developers.cloudflare.com/workers/configuration/routing/routes/#background

## Resultado confirmado · 11 octubre 19:41 Colombia

- Revisión Claude: APROBADO. Implementación y baseline preservado en commit `3126233`, subido antes de desplegar.
- Versión anterior para rollback: `c81ad04a-cf76-43ec-bf50-8ca26f8105e8`.
- Versión activa al 100%: `68763df5-f3d8-4b4b-817a-6b8aed9a5877`; deployment `31762533-18df-4249-8354-8b2a32051b2f`.
- Bundle remoto y local SHA-256: `070d9bf58420993cef68679e9c73566331aee886d99cc0f0e5acc31e31b6cdb7`.
- Primera lectura inmediatamente después del deploy aún sirvió la versión anterior; una segunda comprobación tras propagación pasó sin realizar otro despliegue.
- Ambos GET públicos del panel (incluido `?source=pwa`) devuelven HTTP 200, menú/tarjeta nuevos y `x-aura-organic-app-release:20261011-shell`. Quitando únicamente las dos inserciones, HTML idéntico al anterior por SHA-256.
- Las tres rutas y bindings vacíos conservados. No hubo sincronización de rutas ni modificación de assets.
- Prueba con HTML publicado, sesión/backend simulados: clic en tarjeta, abrir visor interno, actualizar, borrador en memoria, escribir, bajar 1933 px, subir a 0, Volver: correcto. Indicadores y telemetría deliberadamente bloqueados en la prueba. No publicaciones ni guardados reales.
- Se comparan por SHA-256 seis archivos públicos antes/después: estudio HTML/JS/CSS, auth, pantalla Sofía y auto-navigation, sin cambios.
- El problema de acceso interno está corregido. Aún falta confirmación de Oscar tras recargar la ventana instalada para cerrar su reporte de congelamiento; no afirmar que se reprodujo. No se necesita enviar el caso preparado para explicar la ausencia del menú.
