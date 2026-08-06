import test from 'node:test';
import assert from 'node:assert/strict';

import { createIframeController } from '../../creditek/agentes/aura-iframe-controller.mjs';

function element() {
  const classes = new Set();
  return {
    style: { display: '' },
    hidden: true,
    textContent: '',
    href: '',
    classList: {
      add: value => classes.add(value),
      remove: value => classes.delete(value),
      contains: value => classes.has(value),
    },
  };
}

function iframe() {
  const target = element();
  const listeners = new Map();
  target.src = 'about:blank';
  target.addEventListener = (name, callback) => listeners.set(name, callback);
  target.removeEventListener = name => listeners.delete(name);
  target.emit = name => listeners.get(name)?.();
  return target;
}

function fixture({ status = 200, timeoutMs = 30 } = {}) {
  const mainContent = element();
  const iframeView = element();
  const title = element();
  const link = element();
  const frame = iframe();
  const events = [];
  const errors = [];
  const controller = createIframeController({
    iframe: frame,
    iframeView,
    mainContent,
    titleElement: title,
    linkElement: link,
    baseUrl: 'https://registro.crediteksas.com/creditek/agentes/',
    timeoutMs,
    fetchImpl: async () => ({ ok: status >= 200 && status < 400, status }),
    log: event => events.push(event),
    onError: message => errors.push(message),
  });
  return { controller, mainContent, iframeView, title, link, frame, events, errors };
}

test('conserva el dashboard hasta que el iframe confirma load', async () => {
  const f = fixture();
  const opening = f.controller.open('/creditek/agentes/creditek-agente-redes.html', 'Redes Sociales');
  await Promise.resolve();
  await Promise.resolve();

  assert.notEqual(f.mainContent.style.display, 'none');
  assert.equal(f.iframeView.classList.contains('visible'), false);
  assert.equal(f.frame.src, 'https://registro.crediteksas.com/creditek/agentes/creditek-agente-redes.html');

  f.frame.emit('load');
  assert.equal(await opening, true);
  assert.equal(f.mainContent.style.display, 'none');
  assert.equal(f.iframeView.classList.contains('visible'), true);
});

for (const status of [401, 403, 404, 500]) {
  test(`restaura el panel y presenta un error recuperable para HTTP ${status}`, async () => {
    const f = fixture({ status });
    assert.equal(await f.controller.open('/modulo', 'Módulo'), false);
    assert.notEqual(f.mainContent.style.display, 'none');
    assert.equal(f.iframeView.classList.contains('visible'), false);
    assert.match(f.errors.at(-1), new RegExp(String(status)));
    assert.equal(f.frame.src, 'about:blank');
  });
}

test('un timeout nunca deja el área de contenido en blanco', async () => {
  const f = fixture({ timeoutMs: 5 });
  assert.equal(await f.controller.open('/modulo-lento', 'Módulo lento'), false);
  assert.notEqual(f.mainContent.style.display, 'none');
  assert.equal(f.iframeView.classList.contains('visible'), false);
  assert.match(f.errors.at(-1), /tiempo/i);
});

test('rechaza URL inválida y close usa about:blank', async () => {
  const f = fixture();
  assert.equal(await f.controller.open('javascript:alert(1)', 'Inválido'), false);
  assert.match(f.errors.at(-1), /válida/i);
  f.frame.src = '/anterior';
  f.controller.close();
  assert.equal(f.frame.src, 'about:blank');
  assert.notEqual(f.mainContent.style.display, 'none');
});
