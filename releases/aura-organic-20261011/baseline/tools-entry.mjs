import previous from './aura.mjs';
import html from './tools-index.html';
export default {
  fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (['GET', 'HEAD'].includes(request.method) && ['/creditek/agentes/', '/creditek/agentes/index.html'].includes(url.pathname)) {
      return new Response(request.method === 'HEAD' ? null : html, {headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'x-aura-tools-release': '20260913-access-links',
      }});
    }
    return previous.fetch(request, env, ctx);
  },
};

