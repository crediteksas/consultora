import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '../..');
const require = createRequire(import.meta.url);
const productionEndpoints = require('../../config/production-endpoints.js');
const environment = require('../../config/kora-environment.js');

const valid = {
  KORA_ENV: 'staging',
  KORA_VERSION: '1.0.0',
  KORA_ENV_LABEL: 'STAGING',
  KORA_ERP_SUPABASE_URL: 'https://erp-staging.example.invalid',
  KORA_ERP_SUPABASE_ANON_KEY: 'public-anon-erp-staging',
  KORA_AGENTS_SUPABASE_URL: 'https://agents-staging.example.invalid',
  KORA_AGENTS_SUPABASE_ANON_KEY: 'public-anon-agents-staging',
  KORA_CLIENTS_WORKER_URL: 'https://clients-staging.example.invalid',
  KORA_GEMINI_WORKER_URL: 'https://gemini-staging.example.invalid',
  KORA_PDF_COMBINER_URL: 'https://pdf-staging.example.invalid',
  KORA_BOT_WORKER_URL: 'https://bot-staging.example.invalid',
  KORA_AGENTS_AUTH_URL: 'https://auth-staging.example.invalid',
};

test('incluye todos los Workers públicos identificados', () => {
  assert.ok(environment.PUBLIC_KEYS.includes('KORA_BOT_WORKER_URL'));
});

test('rechaza variables públicas obligatorias faltantes sin revelar valores', () => {
  assert.throws(
    () => environment.validateEnvironment({ ...valid, KORA_ERP_SUPABASE_URL: '' }, { productionEndpoints }),
    error => {
      assert.match(error.message, /KORA_ERP_SUPABASE_URL/);
      assert.doesNotMatch(error.message, /public-anon/);
      return true;
    },
  );
});

test('rechaza staging conectado a un host productivo', () => {
  assert.throws(
    () => environment.validateEnvironment({
      ...valid,
      KORA_ERP_SUPABASE_URL: `https://${productionEndpoints.hosts[0]}`,
    }, { productionEndpoints }),
    /destino productivo/i,
  );
});

test('mantiene separados los proyectos ERP y Agentes', () => {
  assert.throws(
    () => environment.validateEnvironment({
      ...valid,
      KORA_AGENTS_SUPABASE_URL: valid.KORA_ERP_SUPABASE_URL,
    }, { productionEndpoints }),
    /ERP y Agentes deben usar proyectos distintos/i,
  );
});

test('rechaza service role y claves administrativas en configuración pública', () => {
  for (const key of ['service_role', 'header.payload.service_role.signature']) {
    assert.throws(
      () => environment.validateEnvironment({
        ...valid,
        KORA_ERP_SUPABASE_ANON_KEY: key,
      }, { productionEndpoints }),
      /credencial no permitida/i,
    );
  }
});

test('crea window.__KORA_ENV__ únicamente con valores públicos validados', async () => {
  const source = await readFile(path.join(root, 'config/kora-environment.js'), 'utf8');
  const context = {
    window: { __KORA_ENV__: valid },
    globalThis: null,
    URL,
    console: { error() {} },
  };
  context.globalThis = context.window;
  vm.runInNewContext(
    await readFile(path.join(root, 'config/production-endpoints.js'), 'utf8'),
    context,
  );
  vm.runInNewContext(source, context);

  const installed = context.window.KoraEnvironment.install();
  assert.equal(installed.KORA_ENV, 'staging');
  assert.equal(Object.isFrozen(installed), true);
  assert.deepEqual(
    Object.keys(installed).sort(),
    environment.PUBLIC_KEYS.slice().sort(),
  );
});

test('los errores y el logger redactan claves y URLs', () => {
  const messages = [];
  const logger = environment.createSafeLogger({ error: message => messages.push(message) });
  logger.error('Configuración inválida', {
    KORA_ERP_SUPABASE_ANON_KEY: 'clave-completa-prohibida',
    KORA_ERP_SUPABASE_URL: 'https://proyecto-sensible.supabase.co',
  });
  const output = messages.join(' ');
  assert.doesNotMatch(output, /clave-completa-prohibida|proyecto-sensible/);
  assert.match(output, /\[REDACTED\]/);
});

test('muestra un error visible y seguro sin incluir detalles sensibles', () => {
  const inserted = [];
  const fakeDocument = {
    createElement() {
      return {
        id: '',
        textContent: '',
        className: '',
        attributes: {},
        setAttribute(name, value) { this.attributes[name] = value; },
      };
    },
    body: { prepend(node) { inserted.push(node); } },
  };

  const node = environment.renderConfigurationError(
    new Error('https://proyecto-sensible.supabase.co clave-completa'),
    fakeDocument,
  );

  assert.equal(node.attributes.role, 'alert');
  assert.match(node.textContent, /configuración de KORA no está disponible/i);
  assert.doesNotMatch(node.textContent, /proyecto-sensible|clave-completa/);
  assert.equal(inserted.length, 1);
});
