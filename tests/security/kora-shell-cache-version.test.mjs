import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const ERP_DIRECTORY = new URL('../../creditek/erp/', import.meta.url);
const EXPECTED_VERSION = '2.0.15';

test('todas las páginas ERP versionan el shell y su guard con el mismo identificador', async () => {
  const htmlFiles = (await readdir(ERP_DIRECTORY)).filter(name => name.endsWith('.html'));
  let shellPages = 0;

  for (const file of htmlFiles) {
    const html = await readFile(new URL(file, ERP_DIRECTORY), 'utf8');
    if (!/src="sidebar\.js/.test(html)) continue;
    shellPages += 1;

    const sidebarVersions = [...html.matchAll(/src="sidebar\.js\?v=([^"]+)"/g)].map(match => match[1]);
    const guardVersions = [...html.matchAll(/src="kora-access-control\.js\?v=([^"]+)"/g)].map(match => match[1]);

    assert.deepEqual(sidebarVersions, [EXPECTED_VERSION], `${file}: sidebar sin versión única vigente`);
    assert.deepEqual(guardVersions, [EXPECTED_VERSION], `${file}: guard omitido o con versión antigua`);
    assert.ok(
      html.indexOf('src="kora-access-control.js') < html.indexOf('src="sidebar.js'),
      `${file}: el guard debe cargar antes del sidebar`,
    );
  }

  assert.equal(shellPages, 35, 'debe validar todas las páginas ERP que montan el shell');
});

test('el build conserva la versión única vigente del shell', async () => {
  const buildScript = await readFile(new URL('../../scripts/build-public.mjs', import.meta.url), 'utf8');
  assert.match(buildScript, /const KORA_SHELL_ASSET_VERSION = '2\.0\.15'/);
  assert.match(buildScript, /const KORA_ACCESS_CONTROL_ASSET_VERSION = '2\.0\.15'/);
  assert.doesNotMatch(buildScript, /KORA_SHELL_ASSET_VERSION = '2\.0\.4'/);
});
