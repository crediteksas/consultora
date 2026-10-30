## Veredicto: **APPROVED FINAL** (delta de piloto SMS — código, migración y pruebas acotadas a este candidato)

Verifiqué el delta real (no los documentos), corrí las pruebas permitidas y contrasté cada afirmación del prompt contra el código y las pruebas. No encontré P1/P2.

### Verificación de integridad (ejecutada por mí)
```
shasum -a 256 index.mjs form.html migración.sql → coincide exactamente con lo declarado
node --experimental-vm-modules --test *.test.mjs   → 42/42 pass
node --test ui-tests/form-candidate.test.mjs       → 21/21 pass
node verify-package.mjs                            → passed:true, 30 bindings, 12 secret-names-only, 3 crons, deploy=[index.mjs,form.html], SHAs ok
```

### Delta backend (`managed-otp.mjs`)
- Línea 65: `options` solo pasa `input.celular` a SQL si es `string` que matchea `^3\d{9}$`; cualquier otro valor (undefined, no-string, número, formato inválido) se convierte en `NULL`. Confirmado contra el bundle `index.mjs:200` también (idéntico).
- Línea 117: `SMS_PILOT_LIMITED` → `notSent(403,...)` antes de cualquier intento de transporte; no hay fallback automático a WA en esa rama.
- Los 2 tests nuevos (`managed-otp.test.mjs:103` y `:109`) prueban exactamente esto: 4 variantes de celular inválido → `p_celular=null` y el body público solo contiene la clave `smsEnabled` (sin filtrar el número); y un rechazo SQL `SMS_PILOT_LIMITED` → 403/`not_sent`/`retry_after:0`, sin evento de proveedor y sin fila de ledger (`f.getLedger()===null`).
- El resto del archivo (TTL, replay de UUID, costo, `uncertain` sin retry, etc.) lo leí completo línea por línea y coincide con lo ya aprobado en la revisión base — solo cambiaron esas dos piezas.

### Migración SQL
- `pilot_allowed_phones text[]` con CHECK que exige `cardinality<=1` y, si hay uno, `array_ndims=1 and array_lower=1` y regex colombiano — rechaza NULL (columna `not null`), dos teléfonos, dimensiones o límites manipulados.
- Defaults: `enabled=false`, `mode='pilot'`, lista vacía, `daily_sms_limit=1`, `monthly_sms_limit=1`, `unit_price_cop=39` (fijo por CHECK), `monthly_budget_cop=39`.
- `nova_client_otp_reserve`: el chequeo de `mode='pilot' and not(celular=any(allowed))` (línea 109) ocurre dentro del mismo bloque de locks ya existentes (`otp:celular`, `otp:enlace`, `otp:request`, más `otp:sms:budget:v1`) y **antes** del `insert` en `nova_client_otp_dispatch` (línea 123) y de `reservar_otp_registro_seguro` (línea 121).
- `nova_client_otp_options(uuid, text default null)`: con `p_celular=NULL` o celular no autorizado en modo piloto, `smsEnabled` resuelve a `false` vía `(... is true)`; el backend solo reenvía ese booleano, descartando `costAnomaly`/límites/contadores que SQL sí calcula internamente.
- Privilegios: `revoke all ... from service_role` + `grant select only` sobre `nova_client_otp_policy` (línea 44-45) — el backend no puede `UPDATE` modo, teléfonos ni límites; cambiar a `active` o ampliar el piloto exige una migración/acción directa fuera del código de servicio.
- Techos duros por CHECK, inamovibles aunque un admin edite la fila: `daily_sms_limit between 0 and 10`, `monthly_sms_limit between 0 and 100`, `monthly_budget_cop between 0 and 3900`, y `cardinality(pilot_allowed_phones)<=1` siempre — Postgres rechazaría un intento de poner 2 teléfonos aunque lo haga un rol con permisos elevados.

### Delta UI (`pilot-ui-delta.patch` + `form-otp-sms.js`)
- `smsOtpAllowed` (capacidad dinámica por piloto) queda separado de `smsOtpEnabled` (protocolo del intento). `aplicarPermisoSmsOtp()` solo reasigna `smsOtpEnabled` si **no** hay intento/envío/consulta/verificación en vuelo — una vez iniciado un intento, perder capacidad no cambia `smsOtpEnabled`.
- `programarOpcionesOtp()` cancela el timer previo, incrementa `otpOptionsGeneration`, oculta el permiso de inmediato, y solo si el contexto/celular son válidos dispara `cargarOpcionesOtp()` tras 350 ms; dentro de esa función, `current()` descarta cualquier respuesta cuya generación o celular ya no coincidan.
- Si la capacidad es falsa/falla **antes** de cualquier intento, `smsOtpEnabled` se fija en `false` y se reactiva el `return` temprano preexistente de `renderOtpGestionado()` — el handler legado de WhatsApp queda intacto (ya probado en la base).
- Si la capacidad desaparece **después** de un intento gestionado, `smsOtpEnabled` no se toca (sigue `true`), por lo que `renderOtpGestionado()` solo oculta el botón de SMS (`!smsOtpAllowed`) pero **no** toca `btnConsultarOtp` (su visibilidad depende solo de `otpGestionadoConsultable()`/`otpVerificado`, no de `smsOtpAllowed`) — el UUID, la consulta y la verificación del intento siguen vivos.
- Las 6 pruebas nuevas (de 21 totales, 15 ya existían en la base) cubren exactamente estos escenarios: binding de celular válido/invalido, debounce+generación, respuesta vieja que no reactiva, denegación tras `uncertain`/tras `accepted`, y cambio de celular a uno denegado sin perder el intento original.

### Evidencia que NO corresponde a este delta (correctamente señalado, lo confirmé yo mismo)
- `ui-tests/evidence/browser-summary.json` declara `candidateSha256: 3a87f636...`, que **no coincide** con el `index.mjs`/`form.html` congelados de este release (`9a9c81c3.../0f95fd30...`). Los 8 checkpoints de Chrome son de la base anterior, no de este delta — no los cuento como validación nueva.

### Límites que declaro honestamente
1. **No reejecuté el harness SQL (PGlite/PG nativo) yo mismo.** El comando con `PGLITE_MODULE=...` requirió aprobación explícita del usuario dos veces y no fue concedida en esta sesión; por instrucción no reintenté una tercera vez el mismo comando. Me apoyé en leer el código fuente completo de la migración (lo hice línea por línea, arriba) y en que los recibos declaran el mismo SHA-256 de migración que verifiqué yo mismo con `shasum`.
2. No verifiqué precios de proveedor externo ni tengo acceso de red en esta sesión.
3. No abrí credenciales/env, no toqué red/DB remota, no hice commit/push/deploy, no até esto a autorización de compra o piloto humano — `enabled` sigue `false` y `mode` sigue `pilot` con lista vacía hasta una acción administrativa explícita fuera de este código.

Esto es revisión de código acotada al delta; no autoriza gasto, piloto real ni publicación.
