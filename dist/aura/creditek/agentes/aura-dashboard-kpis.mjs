const COMMERCIAL_KPIS_URL = 'https://aura-commercial-kpis-api.comercial-853.workers.dev/api/commercial-kpis';

function nonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function readCounts(value) {
  const hoy = nonNegativeInteger(value?.hoy);
  const mes = nonNegativeInteger(value?.mes);
  if (hoy === null || mes === null) return null;
  return { hoy, mes };
}

export function normalizeCommercialKpis(payload) {
  const clientesInscritos = readCounts(payload?.clientes_inscritos);
  const leadsHoy = payload?.leads_enviados?.hoy;
  const leadsMes = payload?.leads_enviados?.mes;
  const leadsEnviados = {
    hoy: nonNegativeInteger(leadsHoy?.total),
    mes: nonNegativeInteger(leadsMes?.total),
    tiendas: nonNegativeInteger(leadsMes?.tiendas),
    aliados: nonNegativeInteger(leadsMes?.aliados),
  };
  if (!clientesInscritos || Object.values(leadsEnviados).some(value => value === null)) {
    throw new Error('COMMERCIAL_KPIS_UNAVAILABLE');
  }
  return { clientesInscritos, leadsEnviados };
}

export async function fetchCommercialKpis({
  token,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!token) throw new Error('AURA_SESSION_REQUIRED');
  const response = await fetchImpl(COMMERCIAL_KPIS_URL, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error('COMMERCIAL_KPIS_UNAVAILABLE');
  return normalizeCommercialKpis(payload);
}
