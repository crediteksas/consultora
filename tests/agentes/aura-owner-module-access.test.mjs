import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../creditek/agentes/index.html', import.meta.url), 'utf8');

test('el acceso de propietario se conserva al abrir Sofía y Publicación y métricas', () => {
  assert.match(source, /appId === 'sofia' && !hasAuraCapability\(auraAccess, AURA_CAPABILITIES\.SOFIA\)/);
  assert.match(source, /appId === 'meta_ads' && !hasAuraCapability\(auraAccess, AURA_CAPABILITIES\.META_ADS\)/);
  assert.doesNotMatch(source, /appId === 'meta_ads' && !hasPermission\(auraAccess, appId, 'meta_ads\.read'\)/);
});
