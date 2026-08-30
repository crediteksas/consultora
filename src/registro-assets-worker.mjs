const SECURITY_HEADERS = Object.freeze({
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(self), microphone=(), geolocation=()',
  'x-frame-options': 'SAMEORIGIN',
});

const ALLOWED_PATHS = [
  /^\/$/,
  /^\/index\.html$/,
  /^\/creditek\/convenios(?:\/|\/index\.html)?$/,
  /^\/creditek\/erp\/registro(?:\.html|\/)?$/,
  /^\/creditek\/legal(?:\/|\/index\.html)?$/,
  /^\/design-system\/components\/kora-product\.(?:css|js)$/,
];

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (!ALLOWED_PATHS.some(pattern => pattern.test(pathname))) {
      return new Response('No encontrado', { status: 404, headers: SECURITY_HEADERS });
    }
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};
