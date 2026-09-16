(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./aliados-reversiones-domain.js'));
  else root.CreditekTableroEjecutivos = factory(root.CreditekReversiones);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (reversiones) {
  'use strict';
  function day(value) {
    if (!value) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    return new Intl.DateTimeFormat('en-CA', {timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
  }
  function month(now = new Date()) {
    const start = day(now).slice(0, 7) + '-01';
    const next = new Date(start + 'T12:00:00Z');
    next.setUTCMonth(next.getUTCMonth() + 1);
    return { start, end: next.toISOString().slice(0, 10) };
  }
  async function allRows(sb, table, columns, key = 'id', filter = q => q) {
    const rows = [];
    for (let from = 0;; from += 500) {
      const {data, error} = await filter(sb.from(table).select(columns)).order(key).range(from, from + 499);
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error('Respuesta incompleta de ' + table);
      rows.push(...data);
      if (data.length < 500) return rows;
    }
  }
  // Fuente única: operaciones de Liquidaciones, nunca ventas ni históricos sueltos.
  function credits(data, period) {
    return reversiones.reportingOperations(data.operations, data.reversions)
      .filter(o => day(o.operation_at) >= period.start && day(o.operation_at) < period.end);
  }
  async function loadCreditData(sb) {
    const [operations, reversions] = await Promise.all([
      allRows(sb,'liquidation_operations','id,plataforma,external_id,operation_at,origen_codigo,ejecutivo_id,tipo_establecimiento,reconocida,normalized_data,utilidad_creditek'),
      allRows(sb,'aliados_reversiones','id,tipo,fecha,original_operation_id,cancellation_operation_id,liquidation_id,snapshot'),
    ]);
    return {operations, reversions};
  }
  function summarize(data, period) {
    const ops = credits(data, period);
    const opIds = new Set(ops.map(o => o.id));
    const beneficiaries = new Map(data.beneficiaries.map(b => [b.id, b.ejecutivo_id]));
    const bonuses = data.bonuses.filter(b => !['anulado','rechazado'].includes(b.estado)).concat(reversiones.bonusEntries(data.reversions));
    const list = data.executives.filter(e => e.activo).map(e => ({
      id:e.id, name:e.nombre,
      activeAllies:data.origins.filter(o => o.tipo === 'aliado' && o.activo && o.ejecutivo_id === e.id).length,
      credits:reversiones.creditCount(ops.filter(o => o.tipo_establecimiento === 'aliado' && o.ejecutivo_id === e.id)),
      platforms:Object.fromEntries(['payjoy','alo','krediya'].map(p => [p,reversiones.creditCount(ops.filter(o => o.tipo_establecimiento === 'aliado' && o.ejecutivo_id === e.id && o.plataforma === p))])),
      commission:bonuses.filter(b => opIds.has(b.operation_id) && beneficiaries.get(b.beneficiary_id) === e.id).reduce((total,b) => total + Number(b.valor || 0), 0),
    }));
    const activeIds = new Set(list.map(e => e.id));
    const unassigned = reversiones.creditCount(ops.filter(o => o.tipo_establecimiento === 'aliado' && !activeIds.has(o.ejecutivo_id)));
    return {list, unassigned};
  }
  async function load(sb, now = new Date(), creditData = loadCreditData(sb)) {
    const period = month(now);
    const [executives, origins, data, bonuses, beneficiaries] = await Promise.all([
      allRows(sb,'ejecutivos','id,nombre,activo'),
      allRows(sb,'origenes','codigo,tipo,activo,ejecutivo_id','codigo'),
      creditData,
      allRows(sb,'liquidation_bonuses','id,operation_id,beneficiary_id,estado,valor'),
      allRows(sb,'liquidation_beneficiaries','id,ejecutivo_id'),
    ]);
    return summarize({executives,origins,...data,bonuses,beneficiaries},period);
  }
  return {load, summarize, month, allRows, credits, loadCreditData};
});
