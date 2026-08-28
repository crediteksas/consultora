import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  isAdvisorContactQuestion,
  isAllianceRequest,
  isExplicitRejection,
  isExplicitServiceConsent,
  isPublicStoreInfoRequest,
  shouldSuppressAutomatedFollowup,
} from '../../creditek/workers/creditek-bot/conversation-audit-policy.mjs';

test('un saludo nunca equivale a consentimiento', () => {
  for (const text of ['Buenos días', 'Hola', 'Bueno', 'Listo', 'Puede ser']) {
    assert.equal(isExplicitServiceConsent(text), false, text);
  }
});

test('solo una autorización explícita habilita tratamiento de datos', () => {
  assert.equal(isExplicitServiceConsent('Autorizo el uso de mis datos para atención'), true);
  assert.equal(isExplicitServiceConsent('Acepto datos y promociones'), true);
  assert.equal(isExplicitServiceConsent('No autorizo mis datos'), false);
});

test('reconoce cierres, desconfianza y opt-out sin confundir falta de respuesta del asesor', () => {
  for (const text of ['No gracias', 'Ninguna', 'No necesito nada', 'Eso parece estafa', 'STOP']) {
    assert.equal(isExplicitRejection(text), true, text);
  }
  assert.equal(isExplicitRejection('El asesor no me ha escrito'), false);
});

test('la información pública de tiendas no exige datos personales', () => {
  assert.equal(isPublicStoreInfoRequest('¿Dónde queda la tienda de Creditek en Corozal?'), true);
  assert.equal(isPublicStoreInfoRequest('¿Cuál es el horario de la sede?'), true);
  assert.equal(isPublicStoreInfoRequest('Quiero sacar un celular'), false);
});

test('separa intención de alianza de una compra de celular', () => {
  assert.equal(isAllianceRequest('Quiero hacer una alianza comercial con Creditek'), true);
  assert.equal(isAllianceRequest('Quiero comprar un celular a crédito'), false);
});

test('reconoce preguntas sobre el contacto del asesor', () => {
  assert.equal(isAdvisorContactQuestion('¿Ellos me van a escribir?'), true);
  assert.equal(isAdvisorContactQuestion('El asesor me llama o me escribe'), true);
});

test('un cierre bloquea seguimientos automáticos', () => {
  assert.equal(shouldSuppressAutomatedFollowup({ funnelState: 'perdido' }), true);
  assert.equal(shouldSuppressAutomatedFollowup({ funnelState: 'contactado', lastCustomerText: 'No gracias' }), true);
  assert.equal(shouldSuppressAutomatedFollowup({ funnelState: 'contactado', lastCustomerText: 'Quiero información' }), false);
});

test('el Worker productivo consume las guardas nuevas', async () => {
  const bundle = await readFile(new URL('../../creditek/workers/creditek-bot/index.js', import.meta.url), 'utf8');
  assert.match(bundle, /isPublicStoreInfoRequest\(texto\)/);
  assert.match(bundle, /isExplicitServiceConsent\(texto\)/);
  assert.match(bundle, /isExplicitRejection\(texto\)/);
  assert.match(bundle, /isAllianceRequest\(texto\)/);
  assert.match(bundle, /isAdvisorContactQuestion\(texto\)/);
  assert.doesNotMatch(bundle, /conv\.estado !== "HANDOFF" && detectaCierreComercial/);
  assert.match(bundle, /conv\.estado !== "OPTIN" && conv\.estado !== "OPTIN_MARKETING" && conv\.estado !== "ALIANZA_CONSENT"/);
});

test('las alianzas se enrutan al supervisor canónico con consentimiento y sin número fijo', async () => {
  const bundle = await readFile(new URL('../../creditek/workers/creditek-bot/index.js', import.meta.url), 'utf8');
  assert.match(bundle, /ATTENTION_SUPERVISOR_PHONE/);
  assert.match(bundle, /case "ALIANZA_CONSENT"/);
  assert.match(bundle, /aviso_asesor_creditek/);
  assert.match(bundle, /conv\.alianza_notificada/);
  assert.doesNotMatch(bundle, /comercial@crediteksas\.com/);
});
