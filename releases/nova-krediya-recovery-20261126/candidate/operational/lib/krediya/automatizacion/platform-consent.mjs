export const PLATFORM_CONSENT_VERSION = 'nova-platform-query-v1';
export const PLATFORM_CONSENT_TEXT = 'Autorizo a Creditek SAS a consultar, para esta solicitud, información de mis obligaciones y pagos en PayJoy, Krediya y Alo Credit, usando mi documento o celular verificado. No autoriza pagos, nuevos créditos ni promociones. La autorización de este piloto vence en 24 horas; puedo solicitar su revocación a Creditek.';
export const QUERY_PLATFORMS = Object.freeze(['PAYJOY','KREDIYA','ALO']);
export function validPlatformConsent(consent, now=Date.now()) {
  const accepted=Date.parse(consent?.accepted_at), expires=Date.parse(consent?.expires_at);
  return consent?.granted===true && consent.revoked===false && [PLATFORM_CONSENT_VERSION, 'nova-platform-query-v2'].includes(consent.text_version)
    && Array.isArray(consent.platforms) && consent.platforms.length===3
    && new Set(consent.platforms).size===3 && QUERY_PLATFORMS.every(p=>consent.platforms.includes(p))
    && Number.isFinite(accepted) && accepted<=now && Number.isFinite(expires) && expires>now
    && expires>accepted && expires-accepted<=(consent.text_version==='nova-platform-query-v2'?15:1)*86400000;
}
