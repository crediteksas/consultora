# AURA 2 Cartera — Supabase sandbox

- Owner: Creditek S.A.S.
- Parent AURA: `ditiwpndvmyuqcagupea`
- Development branch: `aura2-cartera-sandbox`
- Branch project ref: `gjkyxhmtrhnaiphajxha`
- Branch ID: `b8096f97-3f55-4696-ade9-53df2d23614a`
- Compute: Micro, efímero, sin copia de datos productivos
- Esquema aislado: `cartera`

## Seguridad

Las credenciales de la branch no se guardan en Git ni se entregan al navegador. El frontend local consulta un puente local de solo lectura que exige `AURA_CARTERA_SANDBOX_DATABASE_URL` y valida la referencia de la branch. El esquema no fue agregado a los esquemas públicos de PostgREST.

Los roles conceptuales se mapean mediante `app_metadata.cartera_role`: admin y manager gestionan; auditor solo lee; advisor queda limitado a clientes asignados y no puede modificar pagos; integration_kora solo puede escribir snapshots normalizados en customers, obligations, installments y payments.

## Migraciones y rollback

Los UP versionados están en `supabase/migrations`. Los DOWN explícitos están en `supabase/rollback` para impedir que la CLI los ejecute accidentalmente como migraciones de avance. El rollback total elimina únicamente el esquema `cartera` de esta branch.

## Ejecución local

El servidor requiere la URL privada de la branch en memoria y escucha solo en `127.0.0.1`. No usa Meta, WhatsApp, Cloudflare, KORA real ni datos productivos.

La branch genera compute por hora mientras permanezca activa. Debe eliminarse cuando Oscar termine la revisión y ya no se necesiten pruebas.
