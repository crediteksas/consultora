# Mapa oficial de repositorios Creditek

Fecha de verificación: 2026-08-03 (America/Bogota).

## 1. Regla de fuente única

El nombre del repositorio o del Worker no determina el nombre del producto. La relación oficial se establece con cuatro evidencias combinadas:

1. ruta productiva consultada;
2. configuración de rutas y assets de Wrangler;
3. deployment y versión activos en Cloudflare;
4. coincidencia del artefacto publicado con un blob de Git.

No se debe desarrollar desde una rama solo porque contiene una carpeta con el nombre del producto. El trabajo debe partir del commit productivo reproducible indicado en este documento y de la rama recomendada para ese sistema.

## 2. KORA ERP

- **Nombre oficial:** KORA ERP.
- **Repositorio local:** `/Users/oscarpacheco/consultora`.
- **Remote Git:** `https://github.com/oscarjp88-arch/consultora.git` (`origin`, fetch y push).
- **Rama productiva verificable:** `codex/kora-auth-preview`.
- **Commit productivo actual:** `ec8a0d4fb8bf038ea4a5e72eb96e73a552208f19` (`fix: unifica autenticación frontend de KORA`). La punta observada de la rama es `aeb276ed`, posterior al deployment.
- **Worktree recomendado:** un worktree limpio futuro de `codex/kora-auth-preview`, creado desde el commit aprobado más reciente que conserve `ec8a0d4`. No usar `/Users/oscarpacheco/consultora` mientras tenga cambios ajenos.
- **Publicación:** Worker estático Cloudflare `consultora`.
- **URL productiva:** `https://registro.crediteksas.com/creditek/erp/app`.
- **Supabase:** proyecto `creditek-erp`, Project Ref `jfkmiyvcdfbsbwchyvol`.
- **Variables públicas:** `KORA_ERP_SUPABASE_URL` y `KORA_ERP_SUPABASE_ANON_KEY`, instaladas dentro de `window.__KORA_ENV__`. El artefacto general también declara `KORA_ENV`, `KORA_VERSION`, `KORA_ENV_LABEL` y URLs públicas de Workers relacionados.
- **Archivo principal:** `creditek/erp/app.html`.
- **Carpeta principal:** `creditek/erp/`.
- **Build:** `npm run build`, que en `ec8a0d4` ejecuta `build:environment`, valida la configuración, genera `config/generated/kora-environment.generated.js`, construye `public/` mediante `scripts/build-public.mjs` y verifica el artefacto.
- **Despliegue:** `npm run deploy` → build validado → `wrangler deploy` con `wrangler.jsonc` (`name: consultora`, assets `./public`).

### Evidencia productiva de KORA

- Deployment activo: `b4c605a0-0043-41ae-a1f6-09761da6a4e1`.
- Versión activa: `25f7a560-c803-42c1-b45d-8da97e9207b6`, número 174.
- El deployment revierte explícitamente a la versión publicada con el mensaje `Promueve infraestructura de autenticacion KORA ec8a0d4`.
- El HTML productivo y `creditek/erp/app.html` de `ec8a0d4` tienen el mismo SHA-256 después de retirar únicamente los sufijos de invalidación de caché `?v=2.0.4` añadidos al artefacto publicado.
- `git branch --contains ec8a0d4...` devuelve `codex/kora-auth-preview`.

### Riesgos de confusión

- `consultora` es el nombre técnico del repositorio y del Worker, no el producto.
- El mismo Worker raíz sirve otras superficies; modificar `public/` sin build selectivo puede afectar AURA, Portal o páginas auxiliares.
- La rama abierta en `/Users/oscarpacheco/consultora` no contiene `ec8a0d4` y tiene cambios sin confirmar; no es fuente válida para cambios de KORA.
- Existen páginas históricas con configuración Supabase embebida. La fuente aprobada para el acceso actual es `window.__KORA_ENV__` en el árbol de `ec8a0d4`.

## 3. AURA

- **Nombre oficial:** AURA Hub.
- **Repositorio local:** `/Users/oscarpacheco/consultora`.
- **Remote Git:** `https://github.com/oscarjp88-arch/consultora.git`.
- **Rama productiva verificable:** `codex/aura-unified-auth`.
- **Commit productivo reproducible:** `2204c92` (`fix(meta-ads): finaliza cargas y muestra errores seguros`). La punta observada es `af1be04`; sus assets de AURA Hub verificados coinciden con los publicados, pero contiene trabajo posterior de Meta Ads en otro Worker.
- **Worktree recomendado:** `/private/tmp/consultora-aura-unified-auth`, mientras permanezca limpio y apuntando a `codex/aura-unified-auth`.
- **Publicación:** Worker Cloudflare `aura-hub` con handler `creditek/workers/aura-hub/src/index.js` y assets `public-aura-hub/`.
- **URL productiva:** `https://registro.crediteksas.com/creditek/agentes/`.
- **Supabase:** Project Ref `ditiwpndvmyuqcagupea`.
- **Configuración:** `AURA_AUTH.url`, clave pública de cliente y almacenamiento `aura_supabase_session_v1` en `creditek/agentes/aura-auth.mjs`. Los Workers auxiliares usan `SUPABASE_URL` y `SUPABASE_ANON_KEY`; las claves privadas permanecen como secretos de Worker.
- **Archivo principal:** `creditek/agentes/index.html`.
- **Carpeta principal:** `creditek/agentes/`.
- **Build:** `npm run build:aura-hub` → `scripts/build-aura-hub.mjs` → verificación de `public-aura-hub/`.
- **Despliegue:** `npm run deploy:aura-hub` → `wrangler deploy --config wrangler.aura-hub.jsonc`.

### Evidencia productiva de AURA

- Deployment activo: `76e889af-876f-4e1d-b930-c85ead65a70c`.
- Versión activa: `0fffacfd-fc27-4100-980f-8c7bd9d6d9b2`.
- `wrangler.aura-hub.jsonc` asigna explícitamente las rutas `/creditek/agentes`, `/creditek/agentes/`, el login, el módulo de autenticación y los módulos permitidos al Worker `aura-hub`.
- El blob Git de `creditek/agentes/index.html` coincide exactamente con el HTML publicado (SHA-256 `0c918f...ff67`).
- El módulo OTP publicado coincide con la salida de build de `creditek/agentes/aura-auth.mjs` más la marca de release añadida por el builder.
- `git branch --contains 2204c92` incluye `codex/aura-unified-auth` y su remote.

### Riesgos de confusión

- AURA vive en el mismo repositorio que KORA, pero tiene Worker, build, rutas, sesión y Supabase distintos.
- La configuración pública de autenticación de AURA está encapsulada en `AURA_AUTH`, no en `window.__KORA_ENV__`.
- El Hub sirve una vista de Sofía y Meta Ads, pero no contiene el backend conversacional de Sofía.
- La punta de rama incluye commits de Workers auxiliares que no necesariamente cambiaron el artefacto `aura-hub`; el deployment carece de anotación de commit.

## 4. Portal B2B

- **Nombre oficial:** AURA B2B — Portal de Pedidos.
- **Repositorio local:** `/Users/oscarpacheco/consultora`.
- **Remote Git:** `https://github.com/oscarjp88-arch/consultora.git`.
- **Rama productiva verificable:** `codex/aura-unified-auth`.
- **Commit productivo actual:** `d4c18fd` (`fix(aura): unifica autenticacion y permisos del portal`). Este commit reproduce el frontend y el API activos.
- **Worktree recomendado:** `/private/tmp/consultora-aura-unified-auth`, en la rama `codex/aura-unified-auth`.
- **Publicación frontend:** Worker Cloudflare `aura-b2b` con assets `public-aura-b2b/`.
- **Servicio backend:** Worker `aura-b2b-api`, publicado en `https://aura-b2b-api.comercial-853.workers.dev`.
- **URL productiva:** `https://registro.crediteksas.com/creditek/portal/`.
- **Supabase:** Project Ref `ditiwpndvmyuqcagupea`, usado para Auth, sesión, permisos y auditoría de AURA. Los datos de pedidos y catálogo conservan una integración backend con Google Apps Script mediante `APPS_SCRIPT_URL` y `APPS_SCRIPT_SECRET` en el Worker.
- **Variables:** frontend mediante la sesión de `aura-auth.mjs`; API con `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `APPS_SCRIPT_URL`, `APPS_SCRIPT_SECRET` y `ALLOWED_ORIGIN`.
- **Archivo principal:** `creditek/portal/index.html`.
- **Carpeta principal:** `creditek/portal/`.
- **Build:** `npm run build:aura-b2b` → `scripts/build-aura-b2b.mjs` → verificación de `public-aura-b2b/`.
- **Despliegue:** `npm run deploy:aura-b2b` → `wrangler deploy --config wrangler.aura-b2b.jsonc`. El API se despliega desde `creditek/workers/aura-b2b-api/` con su `wrangler.toml`.

### Evidencia productiva de Portal B2B

- Frontend: deployment activo `d070a34b-6648-4d38-a545-766e9555eb01`, versión `29ab0869-6b91-4854-9f4d-14ac5f73393f`.
- API: deployment activo `95008e8d-099c-4d38-b7c3-5be84b4cc493`, versión `0e7f43dd-f811-48be-8ab2-93f3aef1c7ea`.
- `wrangler.aura-b2b.jsonc` asigna `/creditek/portal/*` al Worker `aura-b2b`.
- El blob `creditek/portal/index.html` de Git coincide exactamente con producción (SHA-256 `0fc219...f13`).
- El deployment del API ocurrió inmediatamente después del commit `d4c18fd`; `git branch --contains d4c18fd` identifica `codex/aura-unified-auth`.

### Riesgos de confusión

- Portal B2B comparte identidad y Supabase con AURA, pero no es la misma superficie ni el mismo Worker.
- El frontend, API Cloudflare y backend heredado de Apps Script son tres piezas separadas.
- El archivo aún conserva una URL de Apps Script en código cliente para compatibilidad; las operaciones autorizadas nuevas pasan por `aura-b2b-api`.
- No debe confundirse con los módulos KORA denominados Retail, Aliados o Liquidaciones.

## 5. Sofía

- **Nombre oficial:** Sofía — agente comercial omnicanal de Creditek.
- **Repositorio backend local:** `/Users/oscarpacheco/Downloads/creditek-bot`.
- **Remote Git backend:** `https://github.com/oscarjp88-arch/creditek-bot.git`.
- **Rama backend productiva verificable:** `codex/sofia-p0-illegal-invocation`.
- **Commit backend productivo actual:** `f9fbc17` (`fix(sofia): desacopla fetch del repositorio idempotente`). La versión activa posterior fue creada por actualización de secretos y conserva el código del deployment anterior.
- **Worktree backend recomendado:** un worktree limpio futuro desde `codex/sofia-p0-illegal-invocation`; los worktrees temporales listados aparecen como `prunable` y no deben reutilizarse.
- **Worker backend:** `creditek-bot`.
- **Endpoint Worker:** `https://creditek-bot.comercial-853.workers.dev/`; existe y responde `403` a un GET no autorizado. Su uso productivo principal son webhooks de Meta, cron y endpoints administrativos protegidos.
- **Supabase backend:** Project Ref `ditiwpndvmyuqcagupea`.
- **Variables backend:** `CONVERSATIONS`, `CONVERSACION_DO`, `WHATSAPP_TOKEN`, `PHONE_NUMBER_ID`, `VERIFY_TOKEN`, `SUPABASE_SERVICE_KEY`, `ANTHROPIC_API_KEY`, `META_ACCESS_TOKEN`, `META_PAGE_ACCESS_TOKEN`, `WORKER_SHARED_SECRET` y variables opcionales de supervisión/plantillas. Los valores privados son Wrangler Secrets.
- **Archivo backend principal:** `src/index.ts`.
- **Carpeta backend principal:** `src/`.
- **Build backend:** compilación/bundle gestionado por Wrangler desde TypeScript; verificación local con `npm test`, la suite independiente y `npx tsc`.
- **Despliegue backend:** `npm run deploy` → `wrangler deploy` con `wrangler.toml` (`name = "creditek-bot"`).

### Interfaz de Sofía dentro de AURA

- **Repositorio:** `/Users/oscarpacheco/consultora`.
- **Rama:** `codex/aura-unified-auth`.
- **Commit frontend reproducible:** `9609c95` (`fix(aura): restaura Hub y publica Sofía sin canonicalización`).
- **Archivo principal:** `creditek/agentes/creditek-agente-respuestas.html`.
- **URL productiva:** `https://registro.crediteksas.com/creditek/agentes/sofia-aura-20260803b.html`.
- **Publicación:** Worker `aura-hub`, no `creditek-bot`.
- El HTML productivo coincide exactamente con el blob Git (SHA-256 `96d5a1...eb7f`).

### Evidencia productiva del backend de Sofía

- Deployment de código activo antes de la rotación de secreto: `8f823347-eb5d-47ca-b6a6-1a3773eb3ecb`, versión `95e95b2d-ac6d-4020-ad3e-d4d5b837752f`.
- Deployment activo actual por actualización de secreto: `2578af2a-9f0d-436f-9217-7d2c6fae1a49`, versión `1e8e88f8-da2f-4b5a-9c46-1b8e58c28ab5`.
- El deployment de código se produjo dos minutos después de `f9fbc17`.
- `git branch --contains f9fbc17` identifica `codex/sofia-p0-illegal-invocation`.
- `wrangler.toml` declara el Worker, KV, Durable Object y cron productivos.

### Riesgos de confusión

- Sofía tiene backend en `creditek-bot`, pero su panel operativo se publica desde `consultora` mediante `aura-hub`.
- Sofía comparte Project Ref de Supabase con AURA; es una separación lógica, no física.
- El `main` local de `creditek-bot` no contiene el commit productivo `f9fbc17` y está por delante de `origin/main` con otro cambio; no debe usarse para un hotfix productivo.
- Actualizar un secreto crea una nueva versión activa sin un nuevo commit de código, por lo que deployment activo y commit deben documentarse por separado.

## 6. Inventario consolidado de Cloudflare

| Worker | Producto/capacidad | Configuración | Deployment activo | Versión activa |
| --- | --- | --- | --- | --- |
| `consultora` | KORA ERP y assets estáticos generales | `wrangler.jsonc` | `b4c605a0-0043-41ae-a1f6-09761da6a4e1` | `25f7a560-c803-42c1-b45d-8da97e9207b6` |
| `aura-hub` | AURA Hub y panel frontend de Sofía | `wrangler.aura-hub.jsonc` | `76e889af-876f-4e1d-b930-c85ead65a70c` | `0fffacfd-fc27-4100-980f-8c7bd9d6d9b2` |
| `aura-b2b` | Frontend Portal B2B | `wrangler.aura-b2b.jsonc` | `d070a34b-6648-4d38-a545-766e9555eb01` | `29ab0869-6b91-4854-9f4d-14ac5f73393f` |
| `aura-b2b-api` | API autorizado Portal B2B | `creditek/workers/aura-b2b-api/wrangler.toml` | `95008e8d-099c-4d38-b7c3-5be84b4cc493` | `0e7f43dd-f811-48be-8ab2-93f3aef1c7ea` |
| `creditek-bot` | Backend omnicanal Sofía | `wrangler.toml` en `creditek-bot` | `2578af2a-9f0d-436f-9217-7d2c6fae1a49` | `1e8e88f8-da2f-4b5a-9c46-1b8e58c28ab5` |

## 7. Inventario consolidado de Supabase

| Project Ref | Sistemas | Uso | Separación efectiva |
| --- | --- | --- | --- |
| `jfkmiyvcdfbsbwchyvol` | KORA ERP | Auth, perfiles, operación ERP, Storage y Workers de clientes | Proyecto exclusivo de KORA ERP dentro de este mapa |
| `ditiwpndvmyuqcagupea` | AURA, Portal B2B y Sofía | Auth/permisos AURA, auditoría y datos operativos de agentes/Sofía | Compartido; la separación depende de tablas, RPC, RLS, tokens y permisos |

No se documentan valores de claves. Un Project Ref identifica el proyecto, no autoriza acceso.

## 8. Recomendación oficial de fuente única

1. **KORA ERP:** repositorio `consultora`, rama `codex/kora-auth-preview`, base productiva `ec8a0d4`, carpeta `creditek/erp/`.
2. **AURA:** repositorio `consultora`, rama `codex/aura-unified-auth`, base reproducible `2204c92`, carpetas `creditek/agentes/` y `creditek/workers/aura-hub/`.
3. **Portal B2B:** repositorio `consultora`, rama `codex/aura-unified-auth`, base productiva `d4c18fd`, carpetas `creditek/portal/` y `creditek/workers/aura-b2b-api/`.
4. **Sofía backend:** repositorio `creditek-bot`, rama `codex/sofia-p0-illegal-invocation`, base productiva `f9fbc17`, carpeta `src/`.
5. **Sofía frontend:** repositorio `consultora`, rama `codex/aura-unified-auth`, base reproducible `9609c95`, archivo `creditek/agentes/creditek-agente-respuestas.html`.

Antes de cualquier cambio se debe volver a consultar el deployment activo, comprobar `git branch --contains`, confirmar que el worktree esté limpio y comparar el artefacto público con la base seleccionada.

## 9. Tabla final

| Sistema | Repositorio | Rama | Commit producción | Worker | URL | Supabase | Archivo principal |
| --- | --- | --- | --- | --- | --- | --- | --- |
| KORA ERP | `consultora` | `codex/kora-auth-preview` | `ec8a0d4` | `consultora` | `https://registro.crediteksas.com/creditek/erp/app` | `jfkmiyvcdfbsbwchyvol` | `creditek/erp/app.html` |
| AURA Hub | `consultora` | `codex/aura-unified-auth` | `2204c92` | `aura-hub` | `https://registro.crediteksas.com/creditek/agentes/` | `ditiwpndvmyuqcagupea` | `creditek/agentes/index.html` |
| AURA B2B | `consultora` | `codex/aura-unified-auth` | `d4c18fd` | `aura-b2b` + `aura-b2b-api` | `https://registro.crediteksas.com/creditek/portal/` | `ditiwpndvmyuqcagupea` | `creditek/portal/index.html` |
| Sofía | `creditek-bot` (backend) + `consultora` (panel) | `codex/sofia-p0-illegal-invocation` + `codex/aura-unified-auth` | `f9fbc17` + `9609c95` | `creditek-bot` + `aura-hub` | Webhooks/API protegida + `https://registro.crediteksas.com/creditek/agentes/sofia-aura-20260803b.html` | `ditiwpndvmyuqcagupea` | `src/index.ts` + `creditek/agentes/creditek-agente-respuestas.html` |

## 10. Comandos de auditoría utilizados

```bash
git remote -v
git branch -a --contains <commit>
git log --all --oneline --decorate
git worktree list
npx wrangler deployments list --config <config> --json
npx wrangler versions view <version> --config <config> --json
curl -LfsS https://registro.crediteksas.com/<ruta>
git hash-object <artefacto-descargado>
git rev-list --objects --all
```

Las comparaciones se realizaron contra los deployments activos observados en la fecha indicada. Un despliegue posterior obliga a revalidar este mapa.
