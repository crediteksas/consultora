const PUBLISHER_OPTIONS_URL = 'https://aura-meta-ads-api.comercial-853.workers.dev/v1/publisher/options';

export function countPendingPublications(pieces) {
  if (!Array.isArray(pieces)) return 0;
  return pieces.filter(piece => (
    piece?.estado === 'lista_para_publicar'
    && typeof piece?.imagen_url === 'string'
    && piece.imagen_url.trim().length > 0
  )).length;
}

export async function fetchPendingPublications({
  token,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!token) throw new Error('AURA_SESSION_REQUIRED');
  const response = await fetchImpl(PUBLISHER_OPTIONS_URL, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(data.pieces)) {
    throw new Error('PUBLISHER_CATALOG_UNAVAILABLE');
  }
  return countPendingPublications(data.pieces);
}
