(function (global) {
  'use strict';

  const CURRENT = new Set(['active', 'current']);
  const RISK = new Set(['late', 'delinquent', 'loss']);

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function money(value) {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency', currency: 'COP', maximumFractionDigits: 0,
    }).format(number(value));
  }

  function statusLabel(status) {
    return ({
      active: 'Activo', current: 'Al día', late: 'En mora', delinquent: 'Mora crítica',
      paid: 'Pagado', refinanced: 'Refinanciado', loss: 'Pérdida', cancelled: 'Cancelado',
      approved: 'Autorizado', denied: 'Negado', expired: 'Vencido', revoked: 'Revocado',
      pre_nova: 'Anterior a Nova', missing: 'Sin decisión',
    })[status] || status || 'Sin estado';
  }

  function summarize(rows) {
    const safe = Array.isArray(rows) ? rows : [];
    return safe.reduce((summary, row) => {
      summary.credits += 1;
      summary.original += number(row.original_amount);
      summary.outstanding += number(row.outstanding_amount);
      summary.paid += number(row.validated_repayments);
      if (CURRENT.has(row.status)) summary.current += 1;
      if (RISK.has(row.status)) summary.risk += 1;
      if (row.status === 'paid') summary.closed += 1;
      if (row.pre_nova) summary.preNova += 1;
      if (row.nova_status === 'approved') summary.novaApproved += 1;
      if (number(row.broken_promises) > 0) summary.brokenPromises += 1;
      return summary;
    }, { credits: 0, original: 0, outstanding: 0, paid: 0, current: 0, risk: 0,
      closed: 0, preNova: 0, novaApproved: 0, brokenPromises: 0 });
  }

  function filter(rows, { query = '', platform = '', status = '', origin = '' } = {}) {
    const needle = String(query).trim().toLocaleLowerCase('es');
    return (Array.isArray(rows) ? rows : []).filter(row => {
      const haystack = [row.cliente_nombre,row.cliente_documento,row.external_credit_id,row.tienda]
        .filter(Boolean).join(' ').toLocaleLowerCase('es');
      return (!needle || haystack.includes(needle))
        && (!platform || row.plataforma === platform)
        && (!status || row.status === status)
        && (!origin || row.origen_codigo === origin);
    });
  }

  global.KoraCreditPortfolioDomain = Object.freeze({ filter, money, number, statusLabel, summarize });
})(typeof window !== 'undefined' ? window : globalThis);
