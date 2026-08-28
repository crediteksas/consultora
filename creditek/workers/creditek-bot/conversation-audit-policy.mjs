function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isExplicitServiceConsent(value) {
  const text = normalizeText(value);
  if (!text || isExplicitRejection(value)) return false;
  return /\b(autorizo|acepto)\b.{0,45}\b(datos|atencion|chat|tratamiento|promociones)\b/.test(text)
    || /\b(consent_both|consent_service)\b/.test(text);
}

export function isExplicitRejection(value) {
  const text = normalizeText(value).replace(/[.!]+$/g, '').trim();
  if (/no.*(contest|respond|llam|escrib)/.test(text)) return false;
  return /^(no|no gracias|ninguna|ninguno|dejemos asi|deja eso asi)$/.test(text)
    || /^no (quiero|acepto|autorizo|necesito|me interesa|deseo|puedo|voy a)\b/.test(text)
    || /\b(es una estafa|es estafa|parece estafa|no confio|no me da confianza)\b/.test(text)
    || /^(salir|stop|cancelar|cancela|chao|adios)\b/.test(text);
}

export function isPublicStoreInfoRequest(value) {
  const text = normalizeText(value);
  const store = /\b(tienda|sede|punto|local|creditek)\b/.test(text);
  const publicInfo = /\b(donde|direccion|ubicacion|horario|telefono|numero|ciudad|queda|abren|cierran|atienden)\b/.test(text);
  return store && publicInfo;
}

export function isAllianceRequest(value) {
  const text = normalizeText(value);
  return /\b(alianza|aliado|convenio|sociedad|distribuidor|proveedor|trabajar con creditek|vender con creditek|ser aliado)\b/.test(text);
}

export function isAdvisorContactQuestion(value) {
  const text = normalizeText(value);
  return /\b(ellos?|asesor|vendedor)\b.{0,30}\b(escrib|contact|llam|habl)\w*/.test(text)
    || /\b(me van a|va a)\b.{0,20}\b(escrib|contact|llam)\w*/.test(text);
}

export function shouldSuppressAutomatedFollowup({ funnelState, lastCustomerText } = {}) {
  const state = normalizeText(funnelState);
  return ['perdido', 'cerrado', 'rechazado', 'opt_out'].includes(state)
    || isExplicitRejection(lastCustomerText || '');
}

