import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const worker = await readFile(new URL('../../creditek/workers/creditek-bot/index.js', import.meta.url), 'utf8');

test('la intención de tienda aliada se separa del flujo de crédito', () => {
  assert.match(worker, /function detectaInteresAlianzaComercial/);
  assert.match(worker, /conv\.estado = "ALIANZA"/);
  assert.match(worker, /conv\.tipo_solicitud = "alianza_comercial"/);
  assert.match(worker, /conv\.estado !== "ALIANZA"/);
});

test('el flujo recopila solo los datos comerciales mínimos y valida cada paso', () => {
  for (const paso of ['nombre', 'negocio', 'ciudad', 'correo', 'descripcion']) {
    assert.match(worker, new RegExp(`case "${paso}"`));
  }
  assert.match(worker, /nombreComercialValido/);
  assert.match(worker, /extraerCorreo\(valor\)/);
  assert.doesNotMatch(worker.slice(worker.indexOf('case "ALIANZA"'), worker.indexOf('// ── CELULAR_FB')), /extraerCedula/);
});

test('la oportunidad se entrega exclusivamente a Oscar sin exponer el destino en código', () => {
  assert.match(worker, /ATTENTION_SUPERVISOR_PHONE/);
  assert.match(worker, /notificarAlianzaOscar\(conv, clienteId, env2\)/);
  assert.match(worker, /text: "Oscar"/);
  assert.match(worker, /name: "aviso_asesor_creditek"/);
  assert.doesNotMatch(worker, /ATTENTION_SUPERVISOR_PHONE\s*[:=]\s*["']\d+/);
});

test('el cierre es idempotente y confirma el siguiente responsable al prospecto', () => {
  assert.match(worker, /if \(!conv\.alianza_notificada\)/);
  assert.match(worker, /conv\.alianza_notificada = true/);
  assert.match(worker, /responsable de evaluar nuevas alianzas comerciales/);
});

test('una conversación antigua de alianza se recupera desde su historial', () => {
  assert.match(worker, /const alianzaPendientePrevia = conv\.historial\.some/);
  assert.match(worker, /alianzaPendientePrevia && conv\.optin_aceptado/);
  assert.match(worker, /conv\.alianza_paso = "nombre"/);
});
