# AURA Password Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar recuperación, invitación y restablecimiento de contraseña íntegramente dentro del login productivo de AURA.

**Architecture:** `aura-auth.mjs` encapsula Supabase Auth y expone operaciones de recuperación, intercambio PKCE y actualización de contraseña. `index.html` representa los tres estados de interfaz y nunca maneja tokens fuera del cliente canónico. El Worker estático aislado publica solo el login y su cliente de autenticación.

**Tech Stack:** HTML/CSS responsive, JavaScript ESM, Supabase Auth REST, Node test runner, Cloudflare Workers Assets.

## Global Constraints

- No modificar Supabase Auth, roles ni KORA.
- No revelar contraseñas, tokens ni existencia de correos.
- Redirección canónica: `https://registro.crediteksas.com/creditek/agentes/`.
- Contraseña mínima: 10 caracteres y confirmación exacta.
- Limpiar parámetros y fragmentos sensibles inmediatamente después de procesarlos.

---

### Task 1: Contrato de recuperación

**Files:**
- Modify: `creditek/agentes/aura-auth.mjs`
- Test: `tests/security/aura-password-recovery.test.mjs`

**Interfaces:**
- Produces: `requestPasswordRecovery(email)`, `consumeAuthCallback(url)`, `updatePassword(password)`, `clearSensitiveUrl(url)`.

- [ ] Escribir pruebas fallidas para recuperación neutral, callback implícito, PKCE, invitación, token inválido y limpieza de URL.
- [ ] Ejecutar `node --test tests/security/aura-password-recovery.test.mjs` y confirmar fallos por funciones ausentes.
- [ ] Implementar las cuatro operaciones usando Supabase REST y la sesión canónica.
- [ ] Ejecutar la prueba y confirmar que pasa.

### Task 2: Interfaz AURA

**Files:**
- Modify: `creditek/agentes/index.html`
- Test: `tests/security/aura-password-recovery.test.mjs`

**Interfaces:**
- Consumes: las cuatro operaciones del Task 1.

- [ ] Añadir pruebas fallidas para identidad visual, mostrar contraseña, enlace de recuperación, tres estados, validación y mensajes accesibles.
- [ ] Ejecutar la prueba y confirmar fallos de UI.
- [ ] Implementar tarjeta clara tipo macOS y controladores de los tres estados sin alterar permisos ni navegación.
- [ ] Ejecutar pruebas específicas y generales.

### Task 3: Usuario, despliegue y validación

**Files:**
- Modify: `scripts/build-aura-hub.mjs` solo si falta un activo visual requerido.
- Test: `tests/security/aura-unified-navigation.test.mjs`

**Interfaces:**
- Produces: versión desplegada de `aura-hub` y evidencia productiva.

- [ ] Verificar de forma sanitizada que `comercial@crediteksas.com` está confirmado y tiene `aura.owner` en `sofia` y `portal_b2b`.
- [ ] Ejecutar suites, build y comprobación de aislamiento KORA.
- [ ] Crear commit y registrar versión previa de Cloudflare como rollback.
- [ ] Desplegar `aura-hub` aislado.
- [ ] Validar visualmente producción y solicitar recuperación para `comercial@crediteksas.com`.
- [ ] Confirmar recepción; Óscar completa la contraseña privada; validar Sofía, Portal sin segundo login y logout compartido.
