No pude crear el archivo de plan (la herramienta `Write` está deshabilitada en esta sesión) ni dispongo de `ExitPlanMode`, así que entrego la revisión completa aquí mismo, en texto, como el resultado final — es solo lectura, sin cambios aplicados.

## Revisión (solo lectura) — corrección de video Aliados (`aliados-video-20261029`)

**Archivos leídos**: README del release; `creditek/convenios/video-mp4.mjs` y `video-ffmpeg.mjs`; `creditek/convenios/video-codec/asset-routes.mjs` (+ manifiestos); `src/registro-assets-worker.mjs`; `releases/.../registro-video-candidate.mjs`, `worker-form-transform.mjs`, `build-candidate.mjs`, `build-codec-assets.mjs`, `pendientes-app-candidate.js`; parches `Codigo-video-validation.patch` y `Pendientes-video-filter.patch`; `baseline/pending-file-validator.gs`; `wrangler.jsonc` dedicado; `baseline-manifest.json`; `evidence/wasm-synthetic-conversions.json`; pruebas `video-mp4.test.mjs`, `video-ffmpeg.test.mjs`, `integration.test.mjs`, `tests/security/registro-isolation.test.mjs`. No existen `worker-video-wrapper.test.mjs` ni `real-registro-worker.test.mjs` en el repo.

### Verificaciones cruzadas contra el código real (no contra el documento)
- El hash congelado en `baseline-manifest.json` (`ec96c1f2c408796d5f3281e3ee9c396fd554606c4b37792a356843fce44ab983`) coincide exactamente con el que indicaste como baseline exacto.
- `registro-video-candidate.mjs` (archivo real committeado) es idéntico carácter por carácter al template que genera `build-candidate.mjs` — sin drift manual.
- Los SHA256 de wrapper/core de ffmpeg.wasm coinciden en cuatro archivos independientes (`video-ffmpeg.mjs`, `core-manifest.json`, `ffmpeg-manifest.json`, `baseline-manifest.json`).
- `tests/security/registro-isolation.test.mjs` (ya existente, no nueva) importa `src/registro-assets-worker.mjs`, ejercitando la cadena real `registro-assets-worker → registro-video-candidate → baseline`. Confirmé en código que para rutas denegadas (`/creditek/agentes/`, `/creditek/erp/app`, `/creditek/portal/`) el wrapper nuevo no intercepta nada y delega 100% a `baseline.fetch`, preservando el 404 sin tocar `ASSETS`.
- `wrangler.jsonc` dedicado solo declara binding `ASSETS`, sin KV/D1/vars/secrets, con `keep_assets:true`.

### Hallazgos por dimensión

**Privacidad / no pérdida de datos**: el video nunca se sube durante la preparación (todo local al navegador; el único `fetch` de red es a assets de codec fijos, sin cookies/Authorization/body). En cualquier error de `prepareAllyVideo`, ni el Blob original se altera (test: *"failed conversion leaves source unchanged"*) ni se sobreescribe el `video360` previamente guardado hasta que la nueva preparación tiene éxito.

**Selección anterior / cancelación**: en Correcciones, el input se deshabilita durante la preparación y se revalida `selectedInput.files[0]!==selectedFile` justo antes de llamar a la API — si cambió, aborta sin llamar `pending_upload` (validado por `integration.test.mjs`). En alta, cada nueva selección incrementa un `sequence` y aborta (`AbortController`) la preparación anterior; `AudioContext`/`MediaRecorder`/`ObjectURL` se limpian en `finally` con pruebas específicas de cuelgues. Nota menor no bloqueante: en alta, tras una reselección fallida, el envío completo del formulario queda bloqueado (`allyVideoError`) aunque el video válido anterior siga intacto en memoria — es friction de UX, no pérdida de datos ni falla de seguridad.

**Duración / audio**: se mapea el audio original (`-map 0:a:0?`), se exige retener audio si el original lo tenía, códecs h264/aac, y duración final dentro de `max(.7s, 1%)`. Evidencia real: diffs ≤0.061s en AVI/WebM/MOV/MKV con audio.

**Integridad/tamaño de activos**: WASM (32MB) no commiteado, solo referenciado por URL fija + SHA256 + tamaño, verificado en navegador antes de ejecutar. El core.js sí commiteado, con hash/tamaño fijados en tres manifiestos consistentes entre sí y con npm.

**Rutas / no SSRF**: `serveFFmpegAsset` resuelve por *lookup* exacto en objeto cerrado; nunca interpola la URL del request en la URL de origen (siempre usa la constante `asset.upstream`). Query string, método ≠GET/HEAD, o path fuera de lista cerrada → 404/405 sin hacer ningún fetch. Sin reenvío de cookies/Authorization/body. Confirmado en test con intentos tipo `?url=https://evil.test`.

**Compatibilidad de Workers**: todo el código de Worker usa solo Web APIs estándar (`Request`/`Response`/`Headers`/`URL`/`fetch`); las APIs de Node (`node:fs`/`node:crypto`/`node:vm`) solo están en los scripts de build, no en el Worker desplegado.

**Preservación de rutas/permisos**: el wrapper solo intercepta 3 casos (assets de codec; `GET .../pendientes/app.js`; `GET /creditek/convenios[/|/index.html]`); todo lo demás pasa intacto a `baseline.fetch`. Las rutas de KORA/AURA/portal siguen en 404 sin tocar `ASSETS`, sin referencias a `env.KORA/AURA/SUPABASE`, `service_role`, `API_KEY` ni `SECRET`. Sin bindings nuevos.

**Backend (Apps Script)**: el parche de `Código.gs` solo inserta una llamada al validador *ya existente* `auraArchivo_(...)`, sin modificarlo. `integration.test.mjs` simula con `vm` y confirma que un video disfrazado se rechaza antes de tocar `PropertiesService` (ningún efecto de registro). El parche de `Pendientes.gs` solo toca el `accept` del picker; `auraArchivo_` sigue exigiendo MP4 real. **Limitación declarada**: no puedo verificar el contexto completo alrededor de la inserción contra el `Código.gs` v33 real porque, por diseño, ese archivo no está en este release (solo el parche aislado) — ya señalado en el README como paso manual previo a aplicar.

### Nota operativa no bloqueante (a confirmar antes de publicar)
Si el HTML vivo difiere de los anclajes exactos que busca `patchAliadosVideoHtml`, lanza `ALLY_VIDEO_FORM_DRIFT` **sin try/catch** en `registro-video-candidate.mjs` — esto típicamente produce un error 500 para toda la página de Aliados, no un fallback silencioso al HTML sin parchear. Es "fail-closed" intencional (probado en `integration.test.mjs`) y el README ya exige revalidar el HTML en vivo antes de desplegar por esta misma razón. Lo señalo para que decidas si aceptas ese comportamiento (outage total ante drift) o prefieres que una futura iteración capture el error y sirva el HTML original.

### Veredicto: **APPROVED**

Dentro del alcance descrito (ampliar filtro + validar MP4 real antes de efectos, sin tocar v33 completo, bindings, permisos ni rutas existentes). No encontré defectos bloqueantes en ninguna de las dimensiones pedidas. Los dos puntos no bloqueantes (bloqueo de envío tras error de reselección en alta; 500 total ante drift de HTML) quedan como límites razonables a tener presentes, no como condición para aprobar.

No ejecuté pruebas ni build — esta revisión es solo lectura de código.
