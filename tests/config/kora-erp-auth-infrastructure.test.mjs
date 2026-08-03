import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const erpRoot = path.join(root, 'creditek/erp');
const projectUrl = 'https://jfkmiyvcdfbsbwchyvol.supabase.co';
const embeddedJwt = /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/;

async function erpSources() {
  const names = await readdir(erpRoot);
  return Promise.all(
    names
      .filter(name => /\.(?:html|js)$/.test(name))
      .map(async name => ({ name, source: await readFile(path.join(erpRoot, name), 'utf8') })),
  );
}

test('las pantallas ERP no contienen URL ni clave Supabase embebidas', async () => {
  for (const { name, source } of await erpSources()) {
    assert.doesNotMatch(source, embeddedJwt, `${name} contiene una clave JWT embebida`);
    assert.doesNotMatch(source, new RegExp(projectUrl.replaceAll('.', '\\.')), `${name} contiene la URL embebida`);
  }
});

test('toda pantalla ERP que usa Supabase carga primero el entorno generado', async () => {
  for (const { name, source } of await erpSources()) {
    if (!name.endsWith('.html') || !/supabase\.(?:createClient|auth|from|rpc)/.test(source)) continue;
    const environment = source.indexOf('/config/kora-environment.generated.js');
    const firstConsumer = source.search(/(?:<script[^>]+sidebar\.js|supabase\.createClient)/);
    assert.ok(environment >= 0, `${name} no carga el entorno generado`);
    assert.ok(environment < firstConsumer, `${name} carga el entorno después de consumirlo`);
  }
});

test('app y sidebar fallan de forma explícita si falta la configuración', async () => {
  const app = await readFile(path.join(erpRoot, 'app.html'), 'utf8');
  const sidebar = await readFile(path.join(erpRoot, 'sidebar.js'), 'utf8');
  for (const [name, source] of [['app.html', app], ['sidebar.js', sidebar]]) {
    assert.match(source, /KORA_ERP_SUPABASE_URL/);
    assert.match(source, /KORA_ERP_SUPABASE_ANON_KEY/);
    assert.match(source, /Configuración de KORA no disponible/, name);
  }
  assert.doesNotMatch(sidebar, /KORA_ERP_SUPABASE_URL\s*\|\|/);
  assert.doesNotMatch(sidebar, /KORA_ERP_SUPABASE_ANON_KEY\s*\|\|/);
});

test('el pipeline genera, construye y valida el entorno antes de subir preview', async () => {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.match(pkg.scripts['build:environment'], /config:generate[\s\S]*npm run build:public[\s\S]*config:verify-artifact/);
  assert.equal(pkg.scripts.build, 'npm run build:environment');
  assert.match(pkg.scripts['preview:upload'], /^npm run build:environment && wrangler versions upload$/);
  assert.match(pkg.scripts.deploy, /^npm run build:environment && wrangler deploy$/);
});

test('los health checks usan endpoints operativos y nunca el esquema OpenAPI raíz', async () => {
  const source = await readFile(path.join(root, 'scripts/check-kora-supabase-health.mjs'), 'utf8');
  assert.match(source, /\/auth\/v1\/settings/);
  assert.match(source, /\/rest\/v1\/perfiles\?select=id&limit=0/);
  assert.match(source, /\/rest\/v1\/rpc\/es_central/);
  assert.doesNotMatch(source, /fetch\([^\n]*['"`]\/rest\/v1\/?['"`]/);
});

test('la validación del artefacto bloquea proyecto, clave y credenciales privadas incorrectas', async () => {
  const source = await readFile(path.join(root, 'scripts/verify-kora-environment-artifact.mjs'), 'utf8');
  assert.match(source, /jfkmiyvcdfbsbwchyvol\.supabase\.co/);
  assert.match(source, /KORA_ERP_SUPABASE_ANON_KEY/);
  assert.match(source, /service_role/i);
  assert.match(source, /secret key/i);
  assert.match(source, /creditek\/erp\/app\.html/);
  assert.match(source, /creditek\/erp\/sidebar\.js/);
});
