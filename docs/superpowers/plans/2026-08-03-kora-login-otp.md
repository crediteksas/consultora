# KORA Login OTP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modernizar el login oficial de KORA ERP e incorporar recuperación de contraseña por OTP de seis dígitos usando exclusivamente Supabase Auth de KORA.

**Architecture:** `app.html` conserva la creación del cliente Supabase desde `window.__KORA_ENV__`, la restauración de sesión y la resolución de perfiles/roles. Un módulo ERP pequeño y puro, `kora-auth.js`, encapsula validaciones y llamadas OTP contra el cliente recibido; no conoce AURA, no contiene endpoints ni claves y permite pruebas unitarias con un adaptador Supabase simulado.

**Tech Stack:** HTML/CSS/JavaScript ES modules, Supabase JS v2, Node.js `node:test`, Cloudflare Workers Static Assets, Wrangler 4.

## Global Constraints

- Base exacta: `ec8a0d4fb8bf038ea4a5e72eb96e73a552208f19`.
- Autenticación exclusiva de KORA mediante `window.__KORA_ENV__`.
- No importar código, configuración, sesión ni Project Ref de AURA.
- No crear usuarios ni modificar UUID, perfil, rol, permisos o datos de negocio.
- Recuperación exclusivamente OTP de seis dígitos; no enlaces ni PKCE.
- No exponer errores técnicos, existencia de correos, claves privadas ni contraseñas.
- No modificar Portal B2B, Sofía, Retail, Aliados o Liquidaciones.

---

### Task 1: Contrato OTP aislado de KORA

**Files:**
- Create: `creditek/erp/kora-auth.js`
- Create: `tests/erp/kora-auth.test.mjs`

**Interfaces:**
- Consumes: cliente Supabase JS creado por `app.html`.
- Produces: `createKoraRecoveryClient(auth)`, `validateRecoveryEmail(email)`, `validateRecoveryCode(code)` y `validateNewPassword(password, confirmation)`.

- [ ] Escribir pruebas que fallen porque el módulo no existe y cubran correo inválido, payload `resetPasswordForEmail` sin `redirectTo`, mensaje neutro, OTP de seis dígitos, OTP inválido/expirado, mínimo de diez caracteres, confirmación distinta, `updateUser`, cierre de sesión temporal y errores seguros.
- [ ] Ejecutar `node --test tests/erp/kora-auth.test.mjs` y confirmar fallo por módulo ausente.
- [ ] Implementar el módulo sin constantes de URL/clave y con mensajes en español independientes de errores Supabase.
- [ ] Repetir la prueba hasta obtener cero fallos.

### Task 2: Login visual y flujo de vistas

**Files:**
- Modify: `creditek/erp/app.html`
- Modify: `tests/erp/kora-auth.test.mjs`

**Interfaces:**
- Consumes: funciones públicas de `kora-auth.js` y cliente `sb` construido con `KORA_ERP_SUPABASE_URL`/`KORA_ERP_SUPABASE_ANON_KEY`.
- Produces: vistas `login`, `forgot`, `verify-code` y `password-updated`; funciones UI para solicitar OTP, verificarlo, actualizar contraseña y volver al login.

- [ ] Añadir pruebas de integración DOM/contrato que fallen por ausencia de controles, estados, etiquetas accesibles, botón mostrar/ocultar, recordar sesión y vistas OTP.
- [ ] Ejecutar la suite dirigida y confirmar que falla por la interfaz todavía básica.
- [ ] Adaptar la estructura visual de AURA a KORA con Montserrat/DM Sans, `#0B1E3D`, `#00C4CC`, logo Creditek, tarjeta responsive y mensajes `aria-live`.
- [ ] Integrar el módulo sin alterar `entrarApp`, consulta de `perfiles`, redirecciones por rol, restauración o cierre normal de sesión.
- [ ] Tras actualización exitosa, ejecutar `sb.auth.signOut()`, limpiar campos y mostrar login oficial sin iniciar sesión automáticamente.
- [ ] Repetir la suite dirigida hasta obtener cero fallos.

### Task 3: Verificación integral y preview

**Files:**
- Modify only if required by failing tests caused by this change: `creditek/erp/app.html`, `creditek/erp/kora-auth.js`, `tests/erp/kora-auth.test.mjs`.

**Interfaces:**
- Consumes: artefacto construido desde los archivos anteriores.
- Produces: versión preview inmutable y evidencia visual de escritorio/móvil.

- [ ] Ejecutar `node --test tests/erp/*.test.mjs`, `npm test`, `npm run test:config`, `npm run test:design-system`, `npm run build`, `git diff --check` y revisión de consola.
- [ ] Subir el artefacto con `wrangler versions upload` sin activarlo y registrar el Version ID/Preview URL.
- [ ] Capturar el login desktop y móvil desde el preview; verificar recuperación, OTP, validaciones y responsive sin enviar correo real ni cambiar contraseñas reales.
- [ ] Confirmar que KORA usa el Project Ref ERP y que AURA/Portal/Sofía no aparecen en el diff.

### Task 4: Commit y promoción del mismo artefacto

**Files:**
- Commit only: `creditek/erp/app.html`, `creditek/erp/kora-auth.js`, `tests/erp/kora-auth.test.mjs`, este plan.

**Interfaces:**
- Consumes: Version ID aprobado en Task 3.
- Produces: commit reproducible y deployment Cloudflare al 100 % de esa misma versión.

- [ ] Crear un commit Conventional Commit limitado al login KORA.
- [ ] Promover el Version ID validado mediante deployment de versión, sin reconstruir.
- [ ] Verificar `https://registro.crediteksas.com/creditek/erp/app`, comparar hashes/markers, revisar consola y confirmar que el deployment activo usa el Version ID aprobado.
- [ ] Ejecutar nuevamente pruebas live aplicables y `git diff --check` antes de la entrega.
