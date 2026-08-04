# aura-meta-ads-api

Backend exclusivo de Agente 3 en AURA. Conserva analítica de solo lectura y concentra toda escritura a Meta en el servidor.

## Endpoints

- `GET /health`: disponibilidad del Worker, sin datos de Meta.
- `GET /v1/session`: permisos efectivos del usuario autenticado.
- `GET /v1/dashboard?period=7|14|30`: métricas, campañas, ranking, tendencia y alertas.
- `GET /v1/publisher/options`: piezas aprobadas y ciudades oficiales autorizadas.
- `POST /v1/publisher/publish`: crea campaña, conjunto, creativo y anuncio en estado `PAUSED` después de la confirmación final.

La publicación exige sesión AURA, permisos `meta_ads.publish`, `meta_ads.manage` y `meta_ads.budget.manage`, cabecera `Idempotency-Key`, catálogo oficial, presupuesto y fechas válidas. El Worker valida el `app_id` y `ads_management` del token antes de escribir.

Las respuestas autenticadas usan `Cache-Control: no-store`. `PublicationCoordinator` evita publicaciones simultáneas o repetidas con la misma clave y la auditoría persiste usuario, pieza, ciudades, plataformas, presupuesto y los IDs devueltos por Meta.

## Secretos requeridos

Se configuran con el mecanismo de secretos de Cloudflare y nunca se incluyen en archivos:

- `SUPABASE_ANON_KEY`
- `META_ACCESS_TOKEN`
- `META_AD_ACCOUNT_ID`

## Variables públicas del Worker

- `META_PAGE_ID`
- `META_INSTAGRAM_ACTOR_ID`
- `META_DESTINATION_URL`

## Estado seguro

Si falta un secreto, falla la auditoría, faltan permisos, el token no pertenece a una app válida con `ads_management`, Meta rechaza una operación o se supera el límite, el Worker falla cerrado y no expone detalles internos ni tokens.
