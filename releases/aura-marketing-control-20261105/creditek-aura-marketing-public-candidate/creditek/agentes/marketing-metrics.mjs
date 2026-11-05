// Presentation contract: unavailable is null; independent outcomes never added.
export function metric(value) {
  if (value === null || value === undefined || typeof value === 'boolean' || (typeof value === 'string' && !value.trim())) return null;
  if (!['number', 'string'].includes(typeof value)) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
export function cost(spend, count) {
  return spend !== null && count !== null && count > 0 ? spend / count : null;
}
export function normalizeMetrics(raw = {}) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const fields = ['spend','impressions','reach','clicks','conversations','leads','conversions'];
  const result = Object.fromEntries(fields.map(k => [k, metric(raw[k])]));
  const {conversions:combinedResults,...separate}=result;
  return {...separate, combinedResults, costConversation: cost(result.spend,result.conversations), costLead:cost(result.spend,result.leads)};
}
export function comparison(current, previous) {
  if (current === null || previous === null) return {state:'unavailable',percent:null};
  if (previous === 0) return {state:current===0?'unchanged':'no_base',percent:null};
  return {state:'comparable',percent:(current-previous)/previous*100};
}
export function normalizeDashboard(payload) {
  if (!payload || payload.ok !== true || !payload.metrics || typeof payload.metrics !== 'object' || Array.isArray(payload.metrics)) throw new Error('Datos del tablero no disponibles');
  return {metrics:normalizeMetrics(payload.metrics),range:payload.range || {},campaigns:Array.isArray(payload.campaigns)?payload.campaigns.map(c=>({id:String(c.id??''),name:String(c.name??'Sin nombre'),status:String(c.status??'Sin estado'),metrics:normalizeMetrics(c.metrics)})):[]};
}
export async function loadDashboard({token,fetchImpl=globalThis.fetch,period=7}={}) {
  if(typeof token!=='string'||!token.trim()||/\s/.test(token))throw new Error('Sesión AURA requerida');
  if(![7,14,30].includes(period))throw new Error('Periodo no permitido');
  const res=await fetchImpl(`https://aura-meta-ads-api.comercial-853.workers.dev/v1/dashboard?period=${period}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
  if(!res.ok)throw new Error('No se pudieron actualizar las métricas');
  return normalizeDashboard(await res.json());
}
