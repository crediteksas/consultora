import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const read = relative => readFile(new URL(relative, root), 'utf8');
const readOrEmpty = relative => read(relative).catch(() => '');

const officialModules = [
  ['sofia', 'Sofía', '/creditek/agentes/creditek-agente-respuestas.html'],
  ['agent-1', 'Agente 1 · Piezas comerciales', '/creditek/agentes/creditek-agente-redes.html'],
  ['agent-3', 'Agente 3 · Publicación y métricas', '/creditek/agentes/agente3-meta-ads.html'],
  ['agent-4', 'Calendario de contenido', '/creditek/agentes/creditek-agente-calendario.html'],
];

test('la configuración canónica entrega los nombres y rutas oficiales', async () => {
  const source = await readOrEmpty('creditek/agentes/aura-module-config.js');
  const context = { window: {} };
  vm.runInNewContext(source, context);

  const actual = Object.values(context.window.AURA_MODULES || {}).map(module => [
    module.id,
    module.name,
    module.path,
  ]);
  assert.deepEqual(actual, officialModules);
});

test('un agente standalone vuelve al Hub y embedded revela solo su contenido', async () => {
  const source = await readOrEmpty('creditek/agentes/aura-agent-bootstrap.js');
  const redirects = [];
  const classes = [];
  const context = {
    URLSearchParams,
    encodeURIComponent,
    location: {
      pathname: '/creditek/agentes/creditek-agente-redes.html',
      search: '',
      replace: value => redirects.push(value),
    },
    window: {},
    document: {
      readyState: 'complete',
      documentElement: { classList: { add: value => classes.push(value) } },
      querySelector: () => ({ classList: { add: value => classes.push(value) } }),
    },
  };
  context.window.self = context.window;
  context.window.top = context.window;

  vm.runInNewContext(source, context);
  assert.deepEqual(redirects, [
    '/creditek/agentes/?return_to=%2Fcreditek%2Fagentes%2Fcreditek-agente-redes.html',
  ]);

  redirects.length = 0;
  context.location.search = '?embedded=1';
  context.window.top = {};
  vm.runInNewContext(source, context);
  assert.equal(redirects.length, 0);
  assert.ok(classes.includes('aura-embedded'));
  assert.ok(classes.includes('show'));
});

test('el Hub abre los cuatro agentes en embedded y sin navegación KORA', async () => {
  const [hub, build, ...agents] = await Promise.all([
    read('creditek/agentes/index.html'),
    read('scripts/build-aura-hub.mjs'),
    read('creditek/agentes/creditek-agente-redes.html'),
    read('creditek/agentes/creditek-agente-respuestas.html'),
    read('creditek/agentes/agente3-meta-ads.html'),
    read('creditek/agentes/creditek-agente-calendario.html'),
  ]);

  assert.match(hub, /aura-module-config\.js/);
  assert.match(hub, /buildEmbeddedModuleUrl/);
  assert.match(hub, /requestedModule[\s\S]*openModule/);
  for (const [, name, path] of officialModules) {
    assert.ok(hub.includes(name), `el Hub no muestra ${name}`);
    assert.ok(hub.includes(path), `el Hub no usa ${path}`);
  }

  for (const html of agents) {
    assert.match(html, /aura-agent-bootstrap\.js/);
    assert.doesNotMatch(html, /kora-agent-context\.js|aura-sidebar-loader\.js|\/creditek\/erp\/sidebar\.js|kora-incident-center\.js/);
  }
  assert.match(build, /aura-module-config\.js/);
  assert.match(build, /aura-agent-bootstrap\.js/);
});

test('los encabezados internos conservan los nombres funcionales aprobados', async () => {
  const [agent1, calendar] = await Promise.all([
    read('creditek/agentes/creditek-agente-redes.html'),
    read('creditek/agentes/creditek-agente-calendario.html'),
  ]);
  assert.match(agent1, /Agente 1 · Piezas comerciales/);
  assert.match(calendar, /src="logos\/creditek_logo_corregido_alta\.png"/);
  assert.doesNotMatch(calendar, /src="\/logos\//);
});
