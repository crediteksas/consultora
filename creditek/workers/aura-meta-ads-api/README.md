# aura-meta-ads-api

Backend exclusivo de Agente 3 en AURA. La primera fase es estrictamente de solo lectura.

## Endpoints

- `GET /health`: disponibilidad del Worker, sin datos de Meta.
- `GET /v1/session`: permisos efectivos del usuario autenticado.
- `GET /v1/dashboard?period=7|14|30`: métricas, campañas, ranking, tendencia y alertas.

Todo endpoint distinto de `GET` devuelve `405` mientras la gestión no esté aprobada.

Las respuestas autenticadas usan `Cache-Control: no-store`; en esta primera activación la caché compartida queda deshabilitada deliberadamente para evitar cruces de permisos o datos obsoletos.

## Secretos requeridos

Se configuran con el mecanismo de secretos de Cloudflare y nunca se incluyen en archivos:

- `SUPABASE_ANON_KEY`
- `META_ACCESS_TOKEN`
- `META_AD_ACCOUNT_ID`

## Estado seguro

Si falta un secreto, falla la auditoría, el usuario no tiene `meta_ads.read`, Meta rechaza la consulta o se supera el límite, el Worker falla cerrado y no devuelve datos históricos ni simulados.
