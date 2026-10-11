# Despliegue autorizado · 11 octubre 2026

Oscar autorizó subir el cambio a GitHub y desplegar AURA manteniendo la publicación automática desactivada. No hay autorización de ninguna pieza real ni calendario.

Claude aprobó el código de d10e877 para la siguiente etapa. Las 20 pruebas y build/verify de AURA se repitieron con éxito. La pausa antes de editar es una restricción de interfaz; el servidor invalida la aprobación al guardar y bloquea cambios una vez iniciado un envío.

## Preflight

**BLOQUEADO: Cloudflare devolvió 10042 (R2 no habilitado), incluso después de la primera confirmación del usuario. No desplegar ninguna de las dos partes hasta verificar la activación y crear el bucket.** No hay despliegue parcial autorizado por este procedimiento.

`PREFLIGHT.json` registra la respuesta no secreta leída de producción en esta sesión. La configuración vieja `wrangler.aura.jsonc` NO es la configuración activa ni la fuente de verdad de estos bindings. Esta divergencia se comprobó contra Cloudflare, no por inferencia del repositorio.

Los cuatro hashes de producción se volvieron a comprobar y coinciden con los baselines de REVIEW.md. Versiones previas activas:
- AURA: 55919bbd-b5ba-4aef-a10b-51a5ce8bfeeb.
- API Meta: 526c453d-fc37-4dd6-8cec-fc8375ffcf29.

Conexiones AURA preservadas: ASSETS, REGISTRATION_SERVICE (creditek-clientes, production, AuraRegistrationGateway), WORKER_SHARED_SECRET. Fechas de compatibilidad y subdominios no se cambian.

## Configuración de publicación

`wrangler.overlay.jsonc` usa exclusivamente el bundle del overlay verificado, no dist/aura. `unsafe.metadata.keep_assets=true` pasa a la API el campo oficial que conserva el conjunto de archivos existente; `unsafe.bindings` declara ASSETS sin subir ni sustituir archivos. Wrangler conserva secretos y `keep_vars` conserva variables. El servicio de registro se declara con su entrypoint exacto activo. No se declaran ni modifican rutas personalizadas.

Referencia: https://developers.cloudflare.com/workers/static-assets/direct-upload/#createdeploy-new-version

La documentación oficial, sección Create/Deploy New Version, permite reutilizar assets existentes mediante `keep_assets: true` sin enviar un nuevo completion token; su ejemplo Asset Binding usa exactamente `{ "name": "ASSETS", "type": "assets" }` en metadata.bindings. Wrangler admite bindings arbitrarios por `unsafe.bindings` y fusiona `unsafe.metadata` con el upload metadata (comprobado en su cli.js). Se usa ese transporte para los campos oficiales, no se cambia el servicio ni se carga dist/aura. Esto verifica la forma del payload, NO demuestra un despliegue que todavía no se ha realizado. El dry-run no llama a la API de despliegue.

Backend: configuración ya revisada en creditek/workers/aura-meta-ads-api/wrangler.toml, con `ORGANIC_AUTOMATION_ENABLED=false`, conservando RateLimiter y PublicationCoordinator; se añaden únicamente OrganicCalendar y el bucket privado aura-organic-media.

Antes del deploy: compilar/verificar, dry-run de ambos y revisión de Claude de esta configuración adicional. Después: comparar código servido con los bundles, bindings y namespaces previos; verificar rutas públicas existentes en lectura y bloqueo sin sesión de rutas orgánicas. No crear calendarios, no generar imágenes pagadas ni enviar posts durante esta comprobación.

El manifest generado sigue intencionalmente en `deployable: false`: faltan R2 y las verificaciones reales. No representa una autorización ni se consumirá como si fuera true. La aprobación del código o configuración no sustituye estas comprobaciones. La validación real de permisos Meta debe ocurrir después de instalar el backend apagado y antes de habilitar cualquier publicación.

## Revisión adicional completada

Claude aprobó wrangler.overlay.jsonc, DEPLOYMENT.md y PREFLIGHT.json como configuración correcta después de contrastar la evidencia de producción. Se verificaron programáticamente los tres hashes AURA: 64 caracteres cada uno y coincidencia exacta con los archivos descargados. Dictamen explícito: aprobación de configuración únicamente; el despliegue permanece bloqueado por R2 10042. Pruebas repetidas: 20/20, build/verify y ambos dry-runs correctos.
