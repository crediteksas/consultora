import { addOrganicEntryNavigation } from './aura-organic-overlay.mjs';

// Wrap the exact active route Worker. Do not change its proxy behaviour, route
// ownership, auth implementation or the static origin's assets configuration.
export function organicAppShell(previous) {
  return {
    async fetch(request, env, ctx) {
      const response = await previous.fetch(request, env, ctx);
      const path = new URL(request.url).pathname;
      if (request.method !== 'GET' || !['/creditek/agentes/', '/creditek/agentes/index.html'].includes(path)
          || response.status !== 200 || !response.headers.get('content-type')?.includes('text/html')) return response;
      const result = addOrganicEntryNavigation(response, path);
      result.headers.set('x-aura-organic-app-release', '20261011-shell');
      return result;
    },
  };
}
