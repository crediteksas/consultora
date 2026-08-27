import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMarketingTemplatePayload,
  evaluateCampaignEligibility,
  normalizeColombianWhatsappPhone,
  summarizeEligibility,
} from '../../creditek/workers/creditek-bot/campaign-policy.mjs';

const eligibleCustomer = {
  telefono: '3001234567',
  optin_comercial: true,
  optin_whatsapp: true,
  optin_fecha: '2026-08-27T14:00:00.000Z',
  optin_canal: 'whatsapp',
  optin_version: 'v2',
  optin_evidence_id: 'wamid.example',
};

test('normaliza teléfonos colombianos sin alterar números ya normalizados', () => {
  assert.equal(normalizeColombianWhatsappPhone('+57 300 123 4567'), '573001234567');
  assert.equal(normalizeColombianWhatsappPhone('3001234567'), '573001234567');
});

test('solo habilita clientes con opt-in comercial, WhatsApp y evidencia', () => {
  assert.deepEqual(evaluateCampaignEligibility(eligibleCustomer), {
    eligible: true, phone: '573001234567', reasons: [],
  });
  const missing = evaluateCampaignEligibility({ ...eligibleCustomer, optin_evidence_id: null });
  assert.equal(missing.eligible, false);
  assert.ok(missing.reasons.includes('no_consent_evidence'));
});

test('una baja bloquea la campaña aunque los permisos sigan activos', () => {
  const result = evaluateCampaignEligibility(eligibleCustomer, { active: true });
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes('suppressed'));
});

test('construye payload de plantilla de marketing con imagen y variables', () => {
  const payload = buildMarketingTemplatePayload({
    to: '3001234567', templateName: 'promo_celulares_agosto',
    headerImageUrl: 'https://cdn.example.com/promo.jpg', bodyParameters: ['Oscar', 'Corozal'],
    buttonParameters: [{ index: 0, value: 'agosto-2026' }],
  });
  assert.equal(payload.to, '573001234567');
  assert.equal(payload.type, 'template');
  assert.equal(payload.template.components[0].parameters[0].type, 'image');
  assert.equal(payload.template.components[1].parameters.length, 2);
});

test('resume elegibles y exclusiones sin revelar PII', () => {
  const summary = summarizeEligibility([
    { customer: eligibleCustomer },
    { customer: { ...eligibleCustomer, optin_whatsapp: false } },
    { customer: eligibleCustomer, suppression: { active: true } },
  ]);
  assert.deepEqual(summary, {
    total: 3, eligible: 1, excluded: 2,
    reasons: { no_whatsapp_optin: 1, suppressed: 1 },
  });
});
