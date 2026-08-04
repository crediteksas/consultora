import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const source = await readFile(
  path.resolve(import.meta.dirname, '../../creditek/erp/sidebar.js'),
  'utf8',
);
const accessSource = await readFile(
  path.resolve(import.meta.dirname, '../../creditek/erp/kora-access-control.js'),
  'utf8',
);

function classList(initial = [], onChange = () => {}) {
  const values = new Set(initial);
  return {
    add: (...names) => names.forEach(name => values.add(name)),
    remove: (...names) => names.forEach(name => {
      values.delete(name);
      onChange('remove', name);
    }),
    contains: name => values.has(name),
    toggle: name => values.has(name) ? values.delete(name) : values.add(name),
  };
}

function createHarness({
  session = null,
  appReady = false,
  profileError = false,
  sessionHangs = false,
  immediateTimers = false,
  profileRole = 'admin_tienda',
  storeCode = 'T-01',
  pathname = '/creditek/erp/ventas.html',
} = {}) {
  const events = [];
  const errors = [];
  const listeners = {};
  const styles = [];
  let bootError = null;
  const rootClasses = classList([], (operation, name) => {
    events.push(`${operation}:${name}`);
  });
  const appClasses = classList(appReady ? ['show'] : []);
  const sidebarNode = {
    classList: classList(),
    querySelectorAll: () => [],
  };
  const overlayNode = { classList: classList(), addEventListener() {} };
  const hamburgerNode = { addEventListener() {} };
  const app = {
    classList: appClasses,
    insertBefore(node) {
      events.push(`insert:${node === sidebarNode ? 'sidebar' : 'unknown'}`);
    },
  };
  const body = {
    appendChild(node) {
      if (node.id === 'creditekShellBootError') bootError = node;
      events.push(`append:${node === hamburgerNode ? 'hamburger' : 'overlay'}`);
    },
  };

  const document = {
    readyState: 'loading',
    documentElement: { classList: rootClasses },
    head: {
      appendChild(node) {
        styles.push(node);
      },
    },
    body,
    addEventListener(name, callback) {
      listeners[name] = callback;
    },
    createElement(tag) {
      if (tag === 'style') return { id: '', textContent: '' };
      if (tag === 'div') {
        const button = { addEventListener() {} };
        return {
          id: '',
          innerHTML: '',
          setAttribute() {},
          querySelector(selector) {
            if (selector === 'button') return button;
            if (selector === '#sidebarHamburguesa') return hamburgerNode;
            if (selector === '#sidebarOverlay') return overlayNode;
            if (selector === '#sidebarEl') return sidebarNode;
            return null;
          },
        };
      }
      throw new Error(`Elemento inesperado: ${tag}`);
    },
    getElementById(id) {
      if (id === 'app') return app;
      if (id === 'sidebarEl') return sidebarNode;
      if (id === 'creditekShellBootError') return bootError;
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };

  function queryResult(data) {
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data }),
      order: async () => ({ data }),
    };
    return chain;
  }

  const client = {
    auth: {
      getSession: sessionHangs
        ? () => new Promise(() => {})
        : async () => ({ data: { session } }),
      signOut: async () => {},
    },
    from(table) {
      events.push(`from:${table}`);
      if (table === 'perfiles') {
        if (profileError) {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => {
                  throw new Error('fallo sintético');
                },
              }),
            }),
          };
        }
        return queryResult({
          id: session?.user?.id,
          nombre: 'Usuario sintético',
          rol: profileRole,
          tienda_codigo: storeCode,
          activo: true,
        });
      }
      return queryResult([]);
    },
  };

  let clientCreations = 0;
  const context = {
    console: {
      error(...args) { errors.push(args); },
    },
    document,
    window: {
      __KORA_ENV__: {
        KORA_ERP_SUPABASE_URL: 'https://erp.test.invalid',
        KORA_ERP_SUPABASE_ANON_KEY: 'public-test-key',
      },
      supabase: {
        createClient: () => {
          clientCreations += 1;
          return client;
        },
      },
    },
    location: {
      pathname,
      reload() { events.push('reload'); },
    },
    localStorage: { getItem: () => null, setItem() {} },
    setTimeout: immediateTimers
      ? callback => {
          queueMicrotask(callback);
          return 1;
        }
      : setTimeout,
    clearTimeout: immediateTimers ? () => {} : clearTimeout,
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
  };

  vm.runInNewContext(accessSource, context, { filename: 'kora-access-control.js' });
  vm.runInNewContext(source, context, { filename: 'sidebar.js' });
  return {
    rootClasses,
    styles,
    listeners,
    events,
    createPageClient: () => context.window.supabase.createClient(
      context.window.__KORA_ENV__.KORA_ERP_SUPABASE_URL,
      context.window.__KORA_ENV__.KORA_ERP_SUPABASE_ANON_KEY,
    ),
    getClientCreations: () => clientCreations,
    getBootError: () => bootError,
    getErrors: () => errors,
  };
}

test('instala una cortina neutral antes de resolver la sesión', () => {
  const harness = createHarness();

  assert.equal(harness.rootClasses.contains('creditek-shell-pending'), true);
  assert.equal(harness.styles.some(style => style.id === 'creditekShellBootStyles'), true);
  assert.match(
    harness.styles.find(style => style.id === 'creditekShellBootStyles').textContent,
    /creditek-shell-pending/,
  );
});

test('el shell y la página reutilizan un único cliente Supabase', async () => {
  const harness = createHarness();

  harness.createPageClient();
  await harness.listeners.DOMContentLoaded();

  assert.equal(harness.getClientCreations(), 1);
});

test('sin sesión retira la cortina y permite mostrar el login real', async () => {
  const harness = createHarness();
  await harness.listeners.DOMContentLoaded();

  assert.equal(harness.rootClasses.contains('creditek-shell-pending'), false);
  assert.equal(harness.rootClasses.contains('creditek-shell-authenticated'), false);
});

test('con sesión inyecta el sidebar antes de revelar el destino', async () => {
  const harness = createHarness({
    session: { user: { id: 'user-test' } },
    appReady: true,
  });
  await harness.listeners.DOMContentLoaded();

  assert.equal(harness.rootClasses.contains('creditek-shell-authenticated'), true);
  assert.equal(harness.rootClasses.contains('creditek-shell-pending'), false);
  assert.ok(
    harness.events.indexOf('insert:sidebar')
      < harness.events.indexOf('remove:creditek-shell-pending'),
  );
});

test('una ruta corporativa bloqueada para tienda no libera la sesión ni consulta datos', async () => {
  const harness = createHarness({
    session: { user: { id: 'user-test' } },
    profileRole: 'admin_tienda',
    pathname: '/creditek/erp/utilidad-creditek.html',
  });
  const pageSession = harness.createPageClient().auth.getSession();

  await harness.listeners.DOMContentLoaded();

  assert.equal((await pageSession).data.session, null);
  assert.equal(harness.events.includes('from:origenes'), false);
  assert.match(harness.getBootError().innerHTML, /Acceso denegado/);
  assert.equal(harness.events.includes('insert:sidebar'), false);
});

test('un fallo de bootstrap no deja la interfaz oculta', async () => {
  const harness = createHarness({
    session: { user: { id: 'user-test' } },
    profileError: true,
  });
  await harness.listeners.DOMContentLoaded();

  assert.equal(harness.rootClasses.contains('creditek-shell-pending'), true);
  assert.equal(harness.rootClasses.contains('creditek-shell-authenticated'), true);
  assert.equal(harness.rootClasses.contains('creditek-shell-error'), true);
});

test('un fallo autenticado informa la etapa exacta sin exponer la sesión', async () => {
  const harness = createHarness({
    session: { user: { id: 'user-test' } },
    profileError: true,
  });

  await harness.listeners.DOMContentLoaded();

  assert.equal(harness.getErrors().length, 1);
  const [message] = harness.getErrors()[0];
  assert.match(message, /^\[KORA Shell\] Error de inicialización \| etapa=profile/);
  assert.match(message, /mensaje=fallo sintético/);
  assert.doesNotMatch(message, /user-test|session|userId/);
});

test('un getSession bloqueado muestra un error recuperable', async () => {
  const harness = createHarness({
    sessionHangs: true,
    immediateTimers: true,
  });
  await harness.listeners.DOMContentLoaded();

  assert.equal(harness.rootClasses.contains('creditek-shell-pending'), true);
  assert.equal(harness.rootClasses.contains('creditek-shell-error'), true);
});

test('un destino que no se muestra termina en un error accesible', async () => {
  const harness = createHarness({
    session: { user: { id: 'user-test' } },
    immediateTimers: true,
  });
  await harness.listeners.DOMContentLoaded();

  const errorEl = harness.getBootError();
  assert.equal(harness.rootClasses.contains('creditek-shell-error'), true);
  assert.equal(errorEl.id, 'creditekShellBootError');
  assert.match(errorEl.innerHTML, /Recargar/);
});
