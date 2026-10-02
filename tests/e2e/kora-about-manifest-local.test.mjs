import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { buildKora } from '../../scripts/build-kora.mjs';
import { verifyKoraProductionArtifact } from '../../scripts/verify-kora-production-artifact.mjs';
import worker from '../../src/kora-version-worker.mjs';

test('Acerca de KORA muestra todos los campos y verifica los tres recursos del artefacto publicado', async () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const out = await mkdtemp(path.join(tmpdir(), 'creditek-kora-about-'));
  let browser;
  try {
    await buildKora(root, out);
    const commit = '1234567890abcdef1234567890abcdef12345678';
    const manifest = await verifyKoraProductionArtifact({ commit, artifactRoot: out, writeManifest: true });
    const env = {
      ASSETS: { fetch: async request => new Response(await readFile(path.join(out, new URL(request.url).pathname.slice(1)))) },
      KORA_RELEASES: { get: async () => ({ deploymentId: 'deployment-test', workerVersion: 'worker-test', deployedAt: '2026-10-02T18:00:00Z', branch: 'main', buildStatus: 'Aprobado' }) },
      CF_VERSION_METADATA: { id: 'worker-test' },
    };
    const runtime = await (await worker.fetch(new Request('https://kora-manifest.test/kora-build-manifest.json'), env)).json();
    const sidebar = await readFile(path.join(root, 'creditek/erp/sidebar.js'), 'utf8');
    const logic = sidebar.slice(sidebar.indexOf('  async function koraSha256('), sidebar.indexOf('  function mountKoraShell('));
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage();
    let incomplete = false;
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/test') return route.fulfill({ contentType: 'text/html', body: '<aside><span data-kora-build></span></aside><dialog open><p data-kora-version-status></p><dl data-kora-version-details></dl></dialog>' });
      if (url.pathname === '/kora-build-manifest.json') return route.fulfill({ json: incomplete ? { product: 'KORA', version: '3.3.2', runtimeMatchesRelease: true } : runtime });
      if (url.pathname === '/creditek/erp/app') return route.fulfill({ body: await readFile(path.join(out, manifest.appPath)) });
      const resource = manifest.resources.find(value => value.path === url.pathname);
      if (resource) return route.fulfill({ body: await readFile(path.join(out, resource.path.slice(1))) });
      return route.abort();
    });
    await page.goto('https://kora-manifest.test/test');
    await page.addScriptTag({ content: logic });
    const load = () => page.evaluate(() => loadKoraVersionManifest({ aside: document.querySelector('aside'), aboutDialog: document.querySelector('dialog') }));
    await load();
    assert.equal(await page.locator('[data-kora-version-status]').innerText(), 'Versión verificada');
    const details = await page.locator('[data-kora-version-details]').innerText();
    for (const value of ['KORA v3.3.2', commit, 'deployment-test', 'worker-test', 'Producción', '3/3', manifest.appSha256]) assert.ok(details.includes(value));
    assert.doesNotMatch(details, /No disponible/);
    assert.equal(await page.locator('[data-kora-build]').innerText(), commit.slice(0, 7));
    incomplete = true;
    await load();
    assert.equal(await page.locator('[data-kora-version-status]').innerText(), 'Versión no verificada');
  } finally {
    await browser?.close();
    await rm(out, { recursive: true, force: true });
  }
});
