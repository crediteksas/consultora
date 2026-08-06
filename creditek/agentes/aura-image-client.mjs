import { auraSessionToken } from './agente3-aura-session.mjs';

const IMAGE_WORKER_URL = 'https://creditek-gemini-proxy.comercial-853.workers.dev';
const ALLOWED_PATHS = new Set(['/generate', '/openai/responses']);

export async function requestAuraImage(path, payload, fetcher = globalThis.fetch) {
  if (!ALLOWED_PATHS.has(path)) throw new Error('Operación de imagen no permitida.');
  const token = auraSessionToken();
  if (!token) throw new Error('La sesión AURA venció. Inicia sesión nuevamente.');
  const response = await fetcher(`${IMAGE_WORKER_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Error ${response.status}`);
  return data;
}
