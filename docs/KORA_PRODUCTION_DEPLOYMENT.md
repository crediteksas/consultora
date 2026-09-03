# KORA v3.1 — Producción

KORA v3.1 es la versión productiva oficial del ERP Creditek: Shell V2, Creditek Retail,
Creditek B2B, Creditek Aliados, Motor de Liquidaciones unificado, Tesorería y
Centro de Incidencias. La arquitectura permanece preparada para AURA, sin
compartir autenticación ni proyecto Supabase.

## Versionado

- `3.0.x`: correcciones compatibles.
- `3.1`: nuevos módulos compatibles.
- `4.0`: cambios mayores de arquitectura.

## Único despliegue autorizado

```bash
npm run deploy:kora:production
```

Está prohibido ejecutar `wrangler deploy` o publicar la carpeta `public` desde
otro worktree. El comando valida repositorio, ruta, rama, commit, limpieza,
pruebas, build, manifiesto, SHA-256, Shell V2, caché uniforme, Supabase KORA y
ausencia de material privado. La versión se carga con una anotación que incluye
commit y SHA; después se promueve al 100 % y se compara producción. Una
divergencia ejecuta automáticamente la promoción de la versión anterior.

El historial autoritativo queda en los deployments de Cloudflare. Una copia
operativa de cada resultado se guarda fuera del repositorio en `/tmp`.

## Identificación visible y manifiesto

Todas las pantallas ERP muestran `KORA ERP v3.1`, el build corto y el ambiente.
El modal **Acerca de KORA** consume exclusivamente
`/kora-build-manifest.json`. El Worker combina el manifiesto inmutable del
artefacto con `CF_VERSION_METADATA` y el registro técnico `KORA_RELEASES`; así
expone el Deployment ID y Worker Version activos sin entregar credenciales al
navegador. El estado **Versión verificada** exige coincidencia de HTML, SHA,
recursos, Shell y release activa.

## Preparación para CI

El pipeline acepta `KORA_DEPLOY_EXECUTOR=ci` y, en ese modo, exige que
`KORA_PRODUCTION_COMMIT` coincida exactamente con `HEAD`. No se incluye todavía
un workflow de GitHub Actions. La siguiente etapa puede restringir la credencial
Cloudflare al runner autorizado sin cambiar el proceso de build o promoción.

## Incidente de recuperación 2026-08-05

Un deployment sin anotación sustituyó el tráfico con un `public/app.html`
histórico. Producción fue recuperada promoviendo, sin recompilar, la Worker
Version `5891986e-e905-4c46-be94-91a53a5f664c`, correspondiente al commit
`41240a3` y al SHA `b8e4e1367b7788125dd7ac0b34d1170a11fcebe862634281ea376c3cbebe09b7`.
