# AURA v1 Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace AURA's shared-key gate with individual email/password authentication, restore pointer interaction, apply AURA identity throughout the hub, and give each agent a distinct semantic icon.

**Architecture:** Extract authentication behavior from the monolithic hub into a small browser-compatible module with injected network and storage dependencies so it can be tested without production calls. Keep the existing single-page hub structure, but replace the legacy gate and session flag with a Supabase Auth session stored in session storage; apply identity and icon changes only in `creditek/agentes/index.html`.

**Tech Stack:** Static HTML/CSS/JavaScript, Supabase Auth REST API, Node.js built-in test runner, existing public build verifier.

## Global Constraints

- Modify only `creditek/agentes/`, AURA-focused tests, the root test script, and AURA design/plan documentation.
- Do not modify `creditek/erp/`.
- Do not create or alter production users.
- Do not deploy automatically.
- Do not store passwords in localStorage or sessionStorage.
- Do not introduce service-role keys, shared secrets, or private tokens.
- Preserve the visible turquoise keyboard focus ring.

---

### Task 1: Testable AURA authentication client

**Files:**
- Create: `creditek/agentes/aura-auth.js`
- Create: `tests/agentes/aura-auth.test.mjs`
- Modify: `tests/security/build-public.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `window.CreditekAuraAuth.createAuraAuth(options)`
- `options`: `{ supabaseUrl, publishableKey, fetchFn, sessionStorage, allowedRoles }`
- Returned methods: `signIn(email, password)`, `restoreSession()`, `signOut()`, `isAuthorized(user)`
- Session storage key: `aura_supa_session`

- [ ] **Step 1: Write failing authentication tests**

```js
test('signIn sends email and password to Supabase Auth and stores only the returned session', async () => {
  const storage = memoryStorage();
  const auth = createAuth({
    storage,
    fetchFn: async () => response(200, authorizedSession),
  });

  const result = await auth.signIn('oscar@creditek.test', 'secreta');

  assert.equal(result.ok, true);
  assert.equal(storage.getItem('aura_supa_session'), JSON.stringify(authorizedSession));
  assert.equal(storage.getItem('password'), null);
});

test('signIn rejects authenticated users without an allowed AURA role', async () => {
  const auth = createAuth({
    storage: memoryStorage(),
    fetchFn: async () => response(200, unauthorizedSession),
  });

  assert.deepEqual(await auth.signIn('asesor@creditek.test', 'secreta'), {
    ok: false,
    code: 'forbidden',
    message: 'Tu cuenta no tiene acceso a AURA.',
  });
});

test('restoreSession discards expired or unauthorized sessions', async () => {
  const storage = memoryStorage({ aura_supa_session: JSON.stringify(expiredSession) });
  const auth = createAuth({ storage, fetchFn: async () => response(401, {}) });

  assert.equal(await auth.restoreSession(), null);
  assert.equal(storage.getItem('aura_supa_session'), null);
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test tests/agentes/aura-auth.test.mjs`

Expected: FAIL because `creditek/agentes/aura-auth.js` does not exist.

- [ ] **Step 3: Add a failing public-build assertion**

```js
assert.equal(
  (await stat(path.join(out, 'creditek/agentes/aura-auth.js'))).isFile(),
  true,
  'AURA auth module'
);
```

Run: `node --test tests/security/build-public.test.mjs`

Expected: FAIL with `ENOENT` because `aura-auth.js` has not been created.

- [ ] **Step 4: Implement the minimal authentication module**

```js
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CreditekAuraAuth = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const SESSION_KEY = 'aura_supa_session';

  function createAuraAuth({
    supabaseUrl,
    publishableKey,
    fetchFn = fetch,
    sessionStorage,
    allowedRoles = ['gerencia', 'admin'],
  }) {
    function isAuthorized(user) {
      const metadata = user?.app_metadata || {};
      return metadata.aura_access === true || allowedRoles.includes(metadata.role);
    }

    async function signIn(email, password) {
      if (!email.trim() || !password) {
        return { ok: false, code: 'required', message: 'Ingresa correo y contraseña.' };
      }
      const response = await fetchFn(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!response.ok) {
        return { ok: false, code: 'invalid', message: 'No pudimos iniciar sesión con esos datos.' };
      }
      const session = await response.json();
      if (!isAuthorized(session.user)) {
        sessionStorage.removeItem(SESSION_KEY);
        return { ok: false, code: 'forbidden', message: 'Tu cuenta no tiene acceso a AURA.' };
      }
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      return { ok: true, session };
    }

    async function restoreSession() {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      try {
        const session = JSON.parse(raw);
        if (!session.expires_at || session.expires_at * 1000 <= Date.now() || !isAuthorized(session.user)) {
          sessionStorage.removeItem(SESSION_KEY);
          return null;
        }
        return session;
      } catch {
        sessionStorage.removeItem(SESSION_KEY);
        return null;
      }
    }

    function signOut() {
      sessionStorage.removeItem(SESSION_KEY);
    }

    return { signIn, restoreSession, signOut, isAuthorized };
  }

  return { createAuraAuth };
});
```

- [ ] **Step 5: Run the tests and verify GREEN**

Run: `node --test tests/agentes/aura-auth.test.mjs tests/security/build-public.test.mjs`

Expected: PASS with all authentication behaviors covered and the auth module copied by the existing public tree build.

- [ ] **Step 6: Include AURA tests in the default suite**

Change the root script to:

```json
"test": "node --test tests/security/*.test.mjs tests/erp/*.test.mjs tests/agentes/*.test.mjs"
```

- [ ] **Step 7: Commit**

```bash
git add package.json creditek/agentes/aura-auth.js tests/agentes/aura-auth.test.mjs tests/security/build-public.test.mjs
git commit -m "feat(aura): add individual authentication client"
```

### Task 2: Accessible email/password login and session bootstrap

**Files:**
- Modify: `creditek/agentes/index.html`
- Create: `tests/agentes/aura-shell.test.mjs`

**Interfaces:**
- Consumes: `window.CreditekAuraAuth.createAuraAuth(options)`
- Produces DOM controls: `#login-email`, `#login-password`, `#login-submit`, `#login-error`
- Produces browser functions: `doLogin()`, `doLogout()`, `showAuthenticatedApp()`

- [ ] **Step 1: Write failing DOM contract tests**

```js
test('AURA login exposes labeled email and password controls', async () => {
  const html = await readAuraHtml();
  assert.match(html, /<label[^>]*for="login-email"[^>]*>Correo<\/label>/);
  assert.match(html, /<input[^>]*type="email"[^>]*id="login-email"[^>]*autocomplete="username"/);
  assert.match(html, /<label[^>]*for="login-password"[^>]*>Contraseña<\/label>/);
  assert.match(html, /<input[^>]*type="password"[^>]*id="login-password"[^>]*autocomplete="current-password"/);
  assert.doesNotMatch(html, /id="login-pwd"/);
});

test('AURA login loads the authentication client and has no shared gate', async () => {
  const html = await readAuraHtml();
  assert.match(html, /<script src="aura-auth\.js"><\/script>/);
  assert.doesNotMatch(html, /const PWD\s*=/);
  assert.doesNotMatch(html, /ck_auth/);
  assert.doesNotMatch(html, /hub-login/);
});
```

- [ ] **Step 2: Run the shell tests and verify RED**

Run: `node --test tests/agentes/aura-shell.test.mjs`

Expected: FAIL because the current page contains only `#login-pwd` and the legacy gate.

- [ ] **Step 3: Replace the login markup**

```html
<form id="login-form" novalidate>
  <div class="login-field">
    <label for="login-email">Correo</label>
    <input type="email" id="login-email" autocomplete="username" required>
  </div>
  <div class="login-field">
    <label for="login-password">Contraseña</label>
    <input type="password" id="login-password" autocomplete="current-password" required>
  </div>
  <button class="login-btn" id="login-submit" type="submit">Ingresar →</button>
  <div class="login-error" id="login-error" role="alert" aria-live="polite"></div>
</form>
```

- [ ] **Step 4: Integrate the authentication controller**

```js
const auraAuth = CreditekAuraAuth.createAuraAuth({
  supabaseUrl: 'https://ditiwpndvmyuqcagupea.supabase.co',
  publishableKey: 'sb_publishable_oVNantrnKzXdtXu5B7YQIg_9fxHp7aW',
  sessionStorage,
  allowedRoles: ['gerencia', 'admin'],
});

async function doLogin() {
  const button = document.getElementById('login-submit');
  const error = document.getElementById('login-error');
  button.disabled = true;
  error.textContent = '';
  try {
    const result = await auraAuth.signIn(
      document.getElementById('login-email').value,
      document.getElementById('login-password').value
    );
    if (!result.ok) {
      error.textContent = result.message;
      return;
    }
    showAuthenticatedApp();
  } catch {
    error.textContent = 'No pudimos conectar. Intenta de nuevo.';
  } finally {
    button.disabled = false;
  }
}
```

- [ ] **Step 5: Fix pointer and keyboard interaction**

```css
.login-field label {
  display:block;
  margin:0 0 6px;
  color:var(--text2);
  font-size:12px;
  font-weight:600;
  text-align:left;
}
.login-field,
.login-field input,
.login-field label {
  pointer-events:auto;
}
.login-field input:focus-visible {
  border-color:var(--turq);
  box-shadow:0 0 0 4px rgba(0,196,204,.18);
}
```

Bind `submit` on `#login-form`; do not rely on inline key handlers.

- [ ] **Step 6: Run shell and auth tests**

Run: `node --test tests/agentes/aura-auth.test.mjs tests/agentes/aura-shell.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add creditek/agentes/index.html tests/agentes/aura-shell.test.mjs
git commit -m "fix(aura): replace shared gate with accessible login"
```

### Task 3: AURA identity and semantic agent icons

**Files:**
- Modify: `creditek/agentes/index.html`
- Modify: `tests/agentes/aura-shell.test.mjs`

**Interfaces:**
- Consumes: existing AURA hub cards and navigation.
- Produces: `.aura-icon` elements with `data-icon` values `social`, `responses`, `meta-ads`, `calendar`.

- [ ] **Step 1: Add failing identity and icon tests**

```js
test('AURA shell identifies itself as AURA and not KORA', async () => {
  const html = await readAuraHtml();
  assert.match(html, /<title>AURA · Creditek<\/title>/);
  assert.match(html, />AURA<\/span>/);
  assert.doesNotMatch(html, />KORA</);
  assert.doesNotMatch(html, /KORA\s*\/\s*PRINCIPAL/);
});

test('each AURA agent card has a distinct semantic icon', async () => {
  const html = await readAuraHtml();
  for (const icon of ['social', 'responses', 'meta-ads', 'calendar']) {
    assert.match(html, new RegExp(`data-icon="${icon}"`));
  }
  assert.equal(new Set([...html.matchAll(/data-icon="([^"]+)"/g)].map(match => match[1])).size, 4);
});
```

- [ ] **Step 2: Run the shell tests and verify RED**

Run: `node --test tests/agentes/aura-shell.test.mjs`

Expected: FAIL on KORA copy and repeated generic card symbols.

- [ ] **Step 3: Apply AURA copy**

Update the document title, login wordmark, sidebar wordmark, breadcrumb, topbar, and accessible labels so the product is consistently named AURA while Creditek remains the corporate byline.

- [ ] **Step 4: Add four semantic icons**

Load pinned Lucide UMD `0.468.0`, initialize it after DOM content loads, and use distinct library icons. Each icon is decorative (`aria-hidden="true"`) next to a visible card title.

```html
<script defer src="https://unpkg.com/lucide@0.468.0/dist/umd/lucide.min.js"></script>
<i class="aura-icon" data-icon="social" data-lucide="megaphone" aria-hidden="true"></i>
<i class="aura-icon" data-icon="responses" data-lucide="message-circle" aria-hidden="true"></i>
<i class="aura-icon" data-icon="meta-ads" data-lucide="chart-no-axes-combined" aria-hidden="true"></i>
<i class="aura-icon" data-icon="calendar" data-lucide="calendar-days" aria-hidden="true"></i>
```

Initialize with:

```js
window.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) window.lucide.createIcons();
});
```

- [ ] **Step 5: Run shell tests and verify GREEN**

Run: `node --test tests/agentes/aura-shell.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add creditek/agentes/index.html tests/agentes/aura-shell.test.mjs
git commit -m "fix(aura): apply product identity and semantic icons"
```

### Task 4: Public build and regression verification

**Files:**
- Verify: `creditek/agentes/index.html`
- Verify: `creditek/agentes/aura-auth.js`

**Interfaces:**
- Consumes: the completed AURA hub and public build pipeline.
- Produces: a public artifact containing the new AURA auth module and no server-only material.

- [ ] **Step 1: Run focused verification**

Run:

```bash
node --test tests/agentes/*.test.mjs
node --test tests/security/build-public.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 2: Run the full local suite**

Run: `npm test`

Expected: 0 failures.

- [ ] **Step 3: Build the public artifact**

Run: `npm run build`

Expected: exit code 0 and artifact verification succeeds.

- [ ] **Step 4: Run static security scans**

Run:

```bash
git diff --check
node --test tests/security/*.test.mjs
```

Expected: no whitespace errors and 0 security test failures.

- [ ] **Step 5: Commit verification metadata only when files changed**

```bash
git status --short
```

Expected: no uncommitted implementation changes. Do not create an empty commit.

### Task 5: Visual verification and handoff

**Files:**
- Verify only: local public preview.
- Update: `docs/superpowers/plans/2026-07-27-aura-v1-correcciones.md` checkboxes as work completes.

**Interfaces:**
- Consumes: built public AURA artifact.
- Produces: screenshots for login and Dashboard at desktop and mobile widths.

- [ ] **Step 1: Start a local static preview**

Run: `python3 -m http.server 4173 --directory public`

Expected: local preview available at `http://127.0.0.1:4173/creditek/agentes/`, without deploying.

- [ ] **Step 2: Verify login in Chrome**

Check email and password labels, pointer focus, Tab order, visible focus, Enter submission, error messaging, and disabled submit state. Do not use production credentials; use a controlled failure response or local test session.

- [ ] **Step 3: Verify Dashboard in Chrome**

Check AURA naming, Creditek byline, distinct icons, no KORA copy, and no horizontal overflow at desktop and 390 px.

- [ ] **Step 4: Verify Safari**

Repeat login and Dashboard layout checks in Safari using the same local artifact.

- [ ] **Step 5: Capture evidence**

Save accepted screenshots for desktop login, focused field, desktop Dashboard, and mobile Dashboard.

- [ ] **Step 6: Final verification**

Run:

```bash
npm test
npm run build
git diff --check
git status --short
```

Expected: tests and build exit 0; only intended AURA, tests, package script, and documentation changes remain.

- [ ] **Step 7: Prepare review handoff**

Return the branch name, commits, changed files, test counts, screenshots, and explicit statement that no deployment occurred.
