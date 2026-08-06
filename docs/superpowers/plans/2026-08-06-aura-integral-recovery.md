# AURA Integral Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recuperar AURA desde `8ca1cc6`, conservar la autenticación segura posterior y entregar un único build donde Panel general, Sofía y los agentes 1, 3 y 4 funcionen con una sola shell AURA.

**Architecture:** El Hub es la única shell. Los agentes muestran solo su contenido cuando reciben `embedded=1`; cuando se abren como página independiente vuelven al Hub mediante `return_to`, que abre el mismo módulo en la shell canónica. Los datos de Sofía usan la sesión AURA y los servicios de imagen usan JWT contra el Worker, sin secretos en el navegador.

**Tech Stack:** HTML/CSS/JavaScript, Node test runner, Cloudflare Workers/Assets, Supabase Auth/PostgREST, Chrome real.

## Global Constraints

- Base exacta: `8ca1cc6cc054530e80d53d871c0ce84dec0642c7`.
- Rama: `fix/aura-integral-recovery-20260806`.
- No modificar KORA ni `creditek-bot`.
- No rediseñar colores, tipografías, tamaños, distribución ni tarjetas.
- No desplegar antes del informe previo solicitado.
- No publicar secretos, `WORKER_SHARED_SECRET`, `X-Worker-Secret`, `service_role` ni claves OpenAI en el navegador.
- El Centro Corporativo de Incidencias sigue siendo único y administrado en KORA; AURA será únicamente un punto de creación.

---

### Task 1: Contrato único de navegación y shell

**Files:**
- Create: `creditek/agentes/aura-module-config.js`
- Create: `creditek/agentes/aura-agent-bootstrap.js`
- Modify: `creditek/agentes/index.html`
- Modify: `creditek/agentes/creditek-agente-redes.html`
- Modify: `creditek/agentes/creditek-agente-respuestas.html`
- Modify: `creditek/agentes/agente3-meta-ads.html`
- Modify: `creditek/agentes/creditek-agente-calendario.html`
- Modify: `scripts/build-aura-hub.mjs`
- Modify: `creditek/workers/aura-hub/src/index.js`
- Test: `tests/security/aura-integral-navigation.test.mjs`

**Interfaces:**
- Consumes: sesión existente de `aura-auth.mjs` y `openModule(url,title,element,appId)`.
- Produces: `window.AURA_MODULES`, `aura-agent-bootstrap.js`, navegación `return_to` y contenido embedded visible.

- [ ] **Step 1: Escribir pruebas que reproduzcan los fallos**

  Probar que los cuatro accesos usan los nombres oficiales, que el iframe agrega `embedded=1`, que `return_to` de un agente abre el módulo dentro del Hub, que ningún agente carga `sidebar.js`, KORA Incident Center ni textos KORA, y que standalone redirige al Hub sin redirigir el modo embedded.

- [ ] **Step 2: Ejecutar las pruebas y confirmar RED**

  Run: `node --test tests/security/aura-integral-navigation.test.mjs`

  Expected: FAIL porque no existen la configuración ni el bootstrap canónicos y los nombres aún son los anteriores.

- [ ] **Step 3: Implementar el contrato mínimo**

  Centralizar rutas/nombres; conservar la shell aprobada de `8ca1cc6`; reemplazar la dependencia de navegación KORA por el bootstrap AURA; abrir agentes con `embedded=1`; resolver `return_to` dentro del Hub.

- [ ] **Step 4: Confirmar GREEN**

  Run: `node --test tests/security/aura-integral-navigation.test.mjs tests/security/aura-stabilization-01.test.mjs tests/security/aura-visible-viewport-regression.test.mjs tests/security/aura-interaction-regressions.test.mjs`

### Task 2: Carga completa de Sofía

**Files:**
- Modify: `creditek/agentes/creditek-agente-respuestas.html`
- Test: `tests/security/sofia-aura-loading.test.mjs`

**Interfaces:**
- Consumes: `supaFetch`, `allConvs`, `allClients`, sesión AURA.
- Produces: carga de tiendas y estadísticas sin llamadas pausadas ni secretos.

- [ ] **Step 1: Escribir prueba de carga real del frontend**

  Probar que tiendas se consultan con la sesión Supabase, las estadísticas se calculan desde los datos cargados y no se lanza `Integración pausada`.

- [ ] **Step 2: Confirmar RED**

  Run: `node --test tests/security/sofia-aura-loading.test.mjs`

- [ ] **Step 3: Implementar carga mínima**

  Consultar tiendas autorizadas mediante `supaFetch`, cargar conversaciones/clientes primero, calcular indicadores desde esas colecciones y mostrar errores recuperables sin expulsar el Hub.

- [ ] **Step 4: Confirmar GREEN y regresiones de Sofía**

  Run: `node --test tests/security/sofia-aura-loading.test.mjs tests/security/aura-shared-modules.test.mjs`

### Task 3: Conservar seguridad y generación de imágenes

**Files:**
- Modify: `creditek/agentes/creditek-agente-redes.html`
- Modify: `creditek/agentes/creditek-agente-calendario.html`
- Modify: `creditek/workers/gemini-proxy/index.js`
- Create: `creditek/workers/gemini-proxy/auth.mjs`
- Modify: `creditek/workers/gemini-proxy/wrangler.toml`
- Test: `tests/security/agente1-image-pipeline.test.mjs`
- Test: `tests/security/agente4-auth.test.mjs`
- Test: `tests/security/aura-jwt-auth.test.mjs`

**Interfaces:**
- Consumes: JWT de `agente3-aura-session.mjs` y `aura-image-client.mjs`.
- Produces: Worker que valida JWT/permiso y Agent 4 sin llamadas OpenAI ni secreto compartido en navegador.

- [ ] **Step 1: Portar primero las pruebas posteriores de seguridad**

  Incorporar los casos de `9e47fa9`, `1967f01` y `1555082` sin incorporar sus cambios de shell.

- [ ] **Step 2: Confirmar RED sobre `8ca1cc6`**

  Run: `node --test tests/security/agente1-image-pipeline.test.mjs tests/security/agente4-auth.test.mjs tests/security/aura-jwt-auth.test.mjs`

- [ ] **Step 3: Aplicar únicamente la implementación compatible**

  Validar JWT en el Worker, usar el modelo de imagen compatible y enrutar las imágenes de Agent 4 mediante el cliente seguro. No incorporar `aura-sidebar-loader.js`, rutas duplicadas ni cambios de iconos/ayuda.

- [ ] **Step 4: Confirmar GREEN y escanear secretos**

  Run: `node --test tests/security/agente1-image-pipeline.test.mjs tests/security/agente4-auth.test.mjs tests/security/aura-jwt-auth.test.mjs`

### Task 4: Build y validación integral antes de despliegue

**Files:**
- Modify only if a failing regression requires it: files listed in Tasks 1-3.
- Test: existing `tests/security/*.test.mjs`.

**Interfaces:**
- Consumes: build final de AURA.
- Produces: informe previo, capturas de cinco módulos y rollback exacto.

- [ ] **Step 1: Ejecutar build y suites completas**

  Run: `npm run build:aura-hub`

  Run: `npm test`

- [ ] **Step 2: Escanear secretos y alcance**

  Confirmar diff cero en KORA y `creditek-bot`; buscar secretos y llamadas prohibidas en `public-aura-hub`.

- [ ] **Step 3: Validar en Chrome real el build previo**

  Probar Panel, Sofía y agentes 1/3/4 en embedded y standalone, navegación por sidebar/tarjeta, recarga, atrás/adelante, altura, scroll, nombres, iconos y ausencia de KORA/pantallas blancas. Capturar las cinco pantallas.

- [ ] **Step 4: Entregar informe previo y detener el despliegue**

  Reportar causa raíz por módulo, archivos/diff, pruebas, capturas, escaneo, rollback y cero cambios KORA. No publicar hasta completar este checkpoint.

### Task 5: Integración corporativa de incidencias (después de estabilidad)

**Files:**
- Read-only audit first: migrations/API actuales del Centro Corporativo de Incidencias de KORA.
- Future AURA-only changes: shell/Worker de AURA, definidos después de verificar el contrato existente.

**Interfaces:**
- Consumes: entidad corporativa existente de incidencia, comentarios, eventos y auditoría.
- Produces: punto de creación AURA con contexto/evidencias, sin un segundo centro ni tablas duplicadas.

- [ ] **Step 1: Auditar el modelo corporativo existente sin modificar KORA**
- [ ] **Step 2: Presentar extensión mínima de AURA para aprobación**
- [ ] **Step 3: No implementar ni desplegar dentro de la recuperación funcional sin el checkpoint anterior**
