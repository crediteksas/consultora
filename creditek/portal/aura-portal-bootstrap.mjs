import {
  auraAuth,
  auraPortalFetch,
  guardPortal,
  hasPermission,
} from './aura-portal-guard.mjs';

function applyStoreScope(grant) {
  const stores = Array.isArray(grant?.scope?.stores) ? grant.scope.stores : [];
  if (stores.length === 0) return;
  document.querySelectorAll('#tiendaPedido option[value], #histSelectTienda option[value]').forEach(option => {
    if (!option.value) return;
    const store = option.value.split('|')[0];
    if (!stores.includes(store)) option.remove();
  });
  document.querySelectorAll('#tiendaPedido optgroup, #histSelectTienda optgroup').forEach(group => {
    if (!group.querySelector('option')) group.remove();
  });
}

async function bootstrap() {
  const result = await guardPortal();
  if (result.decision === 'redirect') return result;
  if (result.decision === 'deny') {
    document.body.classList.remove('aura-auth-pending');
    document.getElementById('portalAccessDenied').style.display = 'flex';
    document.querySelectorAll('body > *:not(#portalAccessDenied)').forEach(element => {
      element.style.display = 'none';
    });
    return result;
  }

  const canAdmin = hasPermission(result.access, 'portal_b2b', 'portal.admin');
  document.querySelectorAll('[data-portal-permission="portal.admin"]').forEach(element => {
    element.hidden = !canAdmin;
  });
  if (canAdmin) document.getElementById('oscarPanel').style.display = 'block';
  applyStoreScope(result.grant);
  document.body.classList.remove('aura-auth-pending');
  return { ...result, canAdmin };
}

window.AuraPortalReady = bootstrap();
window.AuraPortal = Object.freeze({
  fetch: auraPortalFetch,
  async signOut() {
    await auraAuth.signOut();
    location.replace('/creditek/agentes/');
  },
});
