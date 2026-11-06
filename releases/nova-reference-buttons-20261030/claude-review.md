## Veredicto: **APPROVED** (código revisado), con una condición de proceso antes de publicar

### Hallazgo de proceso — prioridad alta, no es un defecto de código

Durante esta revisión el directorio del release **cambió bajo mis pies**: `reference-webhook.test.mjs`, `README.md` y `wrangler.jsonc` no existían en mi primer listado y aparecieron con mtimes 10:46–10:49 mientras yo ya estaba leyendo archivos (sesión iniciada antes). El prompt indicaba "3 suites, 40/40", pero `testall-receipt.json`/`testall.tap` (presentes desde el inicio) ya registraban **45/45 en 4 archivos**. Ejecuté los 4 archivos actuales y confirmo **45/45 pass**, `node --check index.mjs` OK. El archivo nuevo (`reference-webhook.test.mjs`) es además el que prueba directamente "firma Meta antes del bridge" con HMAC real — es una mejora, no un problema — pero el hecho de que el candidato no estuviera congelado durante la revisión es un problema de proceso: antes de pedir push, hay que fijar el conjunto final de archivos y regenerar/confirmar el receipt con el conteo correcto (45, no 40).

### Verificación de requisitos (todos con evidencia de código + test)

| Requisito | Dónde | Resultado |
|---|---|---|
| Firma Meta antes del bridge | `production-base.mjs:18097` (`validSignature`) se ejecuta antes de `referenceWebhookInput`/`process2`; `reference-webhook.test.mjs:87-92` prueba 401 con HMAC real sin invocar `processed`/`pilot` | ✅ |
| Payload ≤128, HMAC ligado a reference/source/application/fingerprint/contact/action/expiry | `reference-quick-reply.mjs:50-56` (`signingData`) incluye los 8 campos; `reference-quick-reply.test.mjs:121-131` prueba cada campo por separado | ✅ |
| Bridge genera comando legado solo en backend, preserva issued/expires | `reference-quick-reply.mjs:114-121`; test `bridge preserves compact expiry...` (línea 248) | ✅ |
| Inicio = solo autorización, sin consentimiento implícito | `meta-preflight.test.mjs`/`reference-quick-reply.test.mjs:169-178`: tras "start", `stage==='consent'`, `consent !== true` | ✅ |
| No reinicia diálogo por doble tap | `reference-quick-reply.test.mjs:186-193` (mismo payload, distinto `id`, mismo estado) | ✅ |
| Preparar componentes antes de reservar | `production-base.mjs`/`index.mjs:77698-77702`: `buildReferenceInvitationTemplate` se llama antes de `nova_retail_reference_reserve`; `sender-integration.test.mjs:149` verifica orden de llamadas | ✅ |
| 3ª lectura post-reserve bloquea si revocó/cambió | `index.mjs` línea del `catch`/`current = await source(...)`; ahora valida revoked/consent/contact_authorized/teléfono/nombre; test dedicado `source change only after reservation...` (línea 195) → `state:'failed'` | ✅ |
| Uncertain solo si Meta se intentó sin resultado concluyente | default cambia a `"failed"`, se pone `"uncertain"` justo antes del `fetch` real; test `transport acceptance, timeout and HTTP500...` (línea 160) | ✅ |
| v2 solo con Meta APPROVED + estructura exacta + logo verificado; fallback v1 | `meta-preflight.mjs:18-48` (`validateReferenceTemplate`, `selectTemplate`, `referenceHeaderReady`); batería de mutaciones en `meta-preflight.test.mjs:10-21` | ✅ |
| Preflight no crea ni envía templates | `meta-preflight.mjs:85-110` solo hace `GET`; se comprobó que el bloque viejo que sí hacía `POST` (líneas 77097-77133 de `production-base.mjs`) queda eliminado por el `transform.mjs`/`build.mjs` sin referencias colgantes | ✅ |
| Logo exacto con SHA pinneado | `logo-response.mjs`, `meta-preflight.mjs:72-83`; `build.mjs:30` aborta el build si no coincide. **No pude re-hashear el PNG yo mismo** (el hook de permisos bloqueó `shasum`/`node -e` para esa operación) — confío en el build-receipt y en el test de bytes PNG, pero esto queda como verificación no independiente de mi parte | ⚠️ parcial |

### Observaciones menores (no bloqueantes)
1. **`reference-dispatch.mjs:6-10`** — el payload de los botones v2 se firma con el `ctx` leído *antes* del reserve; la 3ª lectura post-reserve no vuelve a comprobar `payload_hash`. Si cambiara en esa ventana, el fallo es cerrado (HMAC no verifica en la respuesta), no abierto — solo un riesgo de usabilidad, no de seguridad.
2. Si `buildReferenceInvitationTemplate` lanza para una referencia, el `catch` a nivel de `id` descarta el resto de referencias de esa misma fuente en ese ciclo (mismo patrón ya existente). Aceptable.
3. `wrangler.jsonc` contiene `account_id`, IDs de KV/Hyperdrive/Durable Objects reales — no son secretos pero sí identificadores operativos; lo leí solo para confirmar que no hay deploy/red disparado, no evalué su corrección contra producción.

### No pude verificar (fuera de alcance explícito)
- Atomicidad real de `nova_retail_reference_reserve`/`nova_retail_reference_finish` (viven en SQL/Supabase, no en este diff).
- Hash binario independiente del PNG vía shell (bloqueado por hook de permisos).
- Cualquier cosa que dependa de red/Meta real, wrangler dry-run o DB (no ejecutado, conforme a instrucciones).

**Conclusión:** el código en los archivos señalados cumple los requisitos y está cubierto por pruebas reales (no triviales) contra el bundle compilado. Antes de pedir el push, pedir a Codex que confirme que el directorio ya no cambiará y actualizar la cifra reportada a **45/45** (no 40/40).
