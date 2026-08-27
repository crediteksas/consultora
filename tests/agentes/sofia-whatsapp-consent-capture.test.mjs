import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workerPath = new URL('../../creditek/workers/creditek-bot/index.js', import.meta.url);
const sourcePath = new URL('../../creditek/workers/creditek-bot/index.ts', import.meta.url);

for (const [label, path] of [['deployable worker', workerPath], ['TypeScript source', sourcePath]]) {
  test(`${label}: separa consentimiento operativo y marketing de WhatsApp`, async () => {
    const source = await readFile(path, 'utf8');
    assert.match(source, /OPTIN_MARKETING/);
    assert.match(source, /Es opcional y tu respuesta no afecta esta atenci/);
    assert.match(source, /marketing_si/);
    assert.match(source, /marketing_no/);
    assert.doesNotMatch(source, /optin_datos:\s*true,\s*optin_operativo:\s*true,\s*optin_comercial:\s*true/);
  });

  test(`${label}: conserva evidencia verificable y no habilita envíos`, async () => {
    const source = await readFile(path, 'utf8');
    assert.match(source, /whatsapp_marketing_v1_2026-08-27/);
    assert.match(source, /sofia_consent_events/);
    assert.match(source, /source_message_id/);
    assert.match(source, /optin_evidence_id/);
    assert.match(source, /decision:\s*granted \? ["']granted["'] : ["']denied["']/);
    assert.doesNotMatch(source, /campaigns\/send/);
  });
}
