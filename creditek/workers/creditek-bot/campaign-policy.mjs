const PHONE_RE = /^57\d{10}$/;
const TEMPLATE_RE = /^[a-z0-9_]{1,512}$/;
const LANGUAGE_RE = /^[a-z]{2,3}(?:_[A-Z]{2})?$/;

export const CAMPAIGN_INELIGIBLE_REASON = Object.freeze({
  INVALID_PHONE: 'invalid_phone',
  NO_WHATSAPP_OPTIN: 'no_whatsapp_optin',
  NO_COMMERCIAL_OPTIN: 'no_commercial_optin',
  NO_CONSENT_EVIDENCE: 'no_consent_evidence',
  SUPPRESSED: 'suppressed',
});

export function normalizeColombianWhatsappPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('3')) return `57${digits}`;
  return digits;
}

export function evaluateCampaignEligibility(customer, suppression = null) {
  const phone = normalizeColombianWhatsappPhone(customer?.telefono);
  const reasons = [];
  if (!PHONE_RE.test(phone)) reasons.push(CAMPAIGN_INELIGIBLE_REASON.INVALID_PHONE);
  if (customer?.optin_comercial !== true) reasons.push(CAMPAIGN_INELIGIBLE_REASON.NO_COMMERCIAL_OPTIN);
  if (customer?.optin_whatsapp !== true) reasons.push(CAMPAIGN_INELIGIBLE_REASON.NO_WHATSAPP_OPTIN);
  if (!customer?.optin_fecha || !customer?.optin_canal || !customer?.optin_version || !customer?.optin_evidence_id) {
    reasons.push(CAMPAIGN_INELIGIBLE_REASON.NO_CONSENT_EVIDENCE);
  }
  if (suppression?.active === true) reasons.push(CAMPAIGN_INELIGIBLE_REASON.SUPPRESSED);
  return { eligible: reasons.length === 0, phone, reasons };
}

function parameter(value) {
  return { type: 'text', text: String(value ?? '') };
}

export function buildMarketingTemplatePayload({
  to,
  templateName,
  language = 'es_CO',
  bodyParameters = [],
  headerImageUrl = null,
  buttonParameters = [],
}) {
  const phone = normalizeColombianWhatsappPhone(to);
  if (!PHONE_RE.test(phone)) throw new Error('INVALID_WHATSAPP_PHONE');
  if (!TEMPLATE_RE.test(templateName || '')) throw new Error('INVALID_TEMPLATE_NAME');
  if (!LANGUAGE_RE.test(language)) throw new Error('INVALID_TEMPLATE_LANGUAGE');
  if (!Array.isArray(bodyParameters) || !Array.isArray(buttonParameters)) throw new Error('INVALID_TEMPLATE_PARAMETERS');

  const components = [];
  if (headerImageUrl) {
    const imageUrl = new URL(headerImageUrl);
    if (imageUrl.protocol !== 'https:') throw new Error('INVALID_HEADER_IMAGE_URL');
    components.push({ type: 'header', parameters: [{ type: 'image', image: { link: imageUrl.toString() } }] });
  }
  if (bodyParameters.length) components.push({ type: 'body', parameters: bodyParameters.map(parameter) });
  for (const button of buttonParameters) {
    if (!Number.isInteger(button?.index) || button.index < 0) throw new Error('INVALID_BUTTON_INDEX');
    components.push({ type: 'button', sub_type: button.subType || 'url', index: String(button.index), parameters: [parameter(button.value)] });
  }

  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
    type: 'template',
    template: { name: templateName, language: { code: language }, components },
  };
}

export function summarizeEligibility(rows) {
  const summary = { total: 0, eligible: 0, excluded: 0, reasons: {} };
  for (const row of rows || []) {
    summary.total++;
    const result = evaluateCampaignEligibility(row.customer, row.suppression);
    if (result.eligible) summary.eligible++;
    else {
      summary.excluded++;
      for (const reason of result.reasons) summary.reasons[reason] = (summary.reasons[reason] || 0) + 1;
    }
  }
  return summary;
}
