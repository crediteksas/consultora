# Reglas de trabajo Creditek OS

## La regla más importante
**Nunca editar código directamente en Cloudflare (Quick Edit) sin hacer
commit al repo PRIMERO.**

Todo cambio sigue este orden sin excepción:
1. Codex implementa en el repo local
2. Claude revisa y aprueba
3. Oscar hace push a GitHub
4. Oscar hace deploy con wrangler
5. Verificar que producción coincide con el repo

## Regla de auditoría obligatoria
Antes de cualquier propuesta o diagnóstico, verificar contra la realidad:
- Código de producción: curl a la URL real, nunca asumir que el repo es igual
- Supabase: consultar tablas reales
- Git: git status primero, siempre
- Cloudflare: verificar qué Worker sirve qué URL antes de tocar nada

## Repo ≠ producción
El repo ha divergido de producción múltiples veces. Siempre verificar
hashes SHA-256 entre lo que está en el repo y lo que sirve producción
antes de asumir que son iguales.

## Deployments
- creditek-bot (Sofía): SIEMPRE deploy manual por Oscar. Nunca automatizado.
- creditek-kora y creditek-aura: Codex puede hacer deploy con wrangler
- Antes de wrangler deploy: siempre correr build + verify primero
- Si build falla: NO hacer deploy. Diagnosticar primero.

## Credenciales y seguridad
- Nunca meter API keys en el navegador (localStorage/sessionStorage)
- Nunca hardcodear secrets en el frontend
- Nunca pegar tokens en el chat
- Todas las llamadas a APIs externas (Anthropic, OpenAI, Meta) deben ir
  por Workers proxy en el servidor, nunca desde el navegador directamente
- Si un modal pide una API key: es un bug, no una feature

## Workers y dominios
- kora.crediteksas.com → Worker creditek-kora → repo: wrangler.kora.jsonc
- aura.crediteksas.com → Worker creditek-aura → repo: wrangler.aura.jsonc
- registro.crediteksas.com/creditek/portal/* → Worker consultora
- registro.crediteksas.com/creditek/convenios/* → Worker consultora
- creditek-bot → Sofía (WhatsApp + Facebook DM)
- creditek-gemini-proxy → proxy de APIs (Anthropic, OpenAI, Gemini)
- aura-meta-ads-api → Meta Ads API

## Sesión de trabajo de Sofía
Primera acción de cada sesión que toque creditek-bot:
1. git status — ver qué hay sin commitear
2. Commitear cambios pendientes antes de escribir código nuevo
3. Deploy SIEMPRE manual por Oscar

## Incidencias KORA
Flujo estándar para cada incidencia:
1. GPT o Claude genera prompt de diagnóstico
2. Codex diagnostica (solo lectura)
3. Claude revisa el diagnóstico
4. Claude autoriza el parche
5. Codex aplica parche mínimo + pruebas
6. Claude revisa pruebas
7. Oscar autoriza deploy
8. Oscar cierra la incidencia en el Centro de Incidencias de KORA

## Arquitectura KORA/AURA
- KORA = ERP (tiendas, ventas, inventario, caja, remisiones, cartera)
- AURA = Agentes IA (Sofía, Piezas comerciales, Meta Ads, Calendario)
- Son Workers separados con builds independientes
- Un deploy de KORA no debe tocar AURA y viceversa
- Verificar aislamiento con verify-kora-artifact.mjs y verify-aura-artifact.mjs

## Supabase
- KORA: proyecto jfkmiyvcdfbsbwchyvol
- Sofía/AURA: proyecto ditiwpndvmyuqcagupea
- Timestamps siempre en UTC, convertir con AT TIME ZONE 'America/Bogota'
- Kardex es inmutable: nunca UPDATE ni DELETE
- Zero tolerancia en diferencias
