const KORA_SERVICE_WORKER_VERSION = '1.0.0';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

// No guarda respuestas ni información autenticada. La aplicación instalada
// conserva exactamente las mismas reglas de red y seguridad que KORA web.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request));
});

self.addEventListener('message', event => {
  if (event.data === 'KORA_VERSION') event.source?.postMessage({ version: KORA_SERVICE_WORKER_VERSION });
});
