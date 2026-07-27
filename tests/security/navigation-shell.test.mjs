import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const source = await readFile(
  path.resolve(import.meta.dirname, '../../creditek/erp/sidebar.js'),
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
} = {}) {
  const events = [];
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
          rol: 'admin_tienda',
          tienda_codigo: 'T-01',
          activo: true,
        });
      }
      return queryResult([]);
    },
  };

  let clientCreations = 0;
  const context = {
    document,
    window: {
      supabase: {
        createClient: () => {
          clientCreations += 1;
          return client;
        },
      },
    },
    location: {
      pathname: '/creditek/erp/ventas.html',
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

  vm.runInNewContext(source, context, { filename: 'sidebar.js' });
  return {
    rootClasses,
    styles,
    listeners,
    events,
    createPageClient: () => context.window.supabase.createClient(
      'https://jfkmiyvcdfbsbwchyvol.supabase.co',
      'anon-key',
    ),
    getClientCreations: () => clientCreations,
    getBootError: () => bootError,
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
