import { auraSessionToken } from './agente3-aura-session.mjs';

const TEXT_WORKER_URL = 'https://creditek-gemini-proxy.comercial-853.workers.dev/generate-text';

export async function requestAuraText(payload, fetcher = globalThis.fetch) {
  const token = auraSessionToken();
  if (!token) throw new Error('La sesión AURA venció. Inicia sesión nuevamente.');
  const response = await fetcher(TEXT_WORKER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Error ${response.status}`);
  if (!data?.text) throw new Error('La generación no devolvió contenido.');
  return data;
}
