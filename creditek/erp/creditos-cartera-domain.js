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

  function bogotaToday(now = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  }
  function validDay(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
  }
  function collection(row, events = [], today = bogotaToday()) {
    const history = events.filter(e => e.obligation_id === row.id).slice().sort((a,b) => String(b.created_at).localeCompare(String(a.created_at)) || String(b.id).localeCompare(String(a.id)));
    const closed = ['paid','cancelled','refinanced'].includes(row.status);
    const validBalance = row.outstanding_amount !== null && row.outstanding_amount !== '' && row.outstanding_amount !== undefined && Number.isFinite(Number(row.outstanding_amount)) && Number(row.outstanding_amount) >= 0;
    const missing = [];
    if (!row.cliente_id) missing.push('Vincular cliente');
    if (!validBalance) missing.push('Confirmar saldo');
    if (!closed && !validDay(row.next_due_date)) missing.push('Confirmar vencimiento');
    const days = !closed && validDay(row.next_due_date) ? Math.max(0, Math.round((Date.parse(today)-Date.parse(row.next_due_date))/86400000)) : null;
    const promise = history.find(e => ['promise','promise_kept','promise_broken'].includes(e.event_type));
    const pendingPromise = promise?.event_type === 'promise' ? promise : null;
    let reason = closed ? 'Cerrado / revisión especial' : 'Seguimiento';
    let priority = 6;
    if (!closed) {
      if (missing.length) { reason = 'Completar datos'; priority = 0; }
      else if (row.status === 'loss') { reason = 'Revisar cartera clasificada como pérdida'; priority = 1; }
      else if (history.some(e=>e.event_type === 'dispute')) { reason = 'Revisar reclamo'; priority = 1; }
      else if (promise?.event_type === 'promise_broken') { reason = 'Promesa incumplida registrada'; priority = 2; }
      else if (pendingPromise && validDay(pendingPromise.promise_date) && pendingPromise.promise_date < today) { reason = 'Verificar promesa vencida'; priority = 2; }
      else if (pendingPromise?.promise_date === today) { reason = 'Compromiso para hoy'; priority = 3; }
      else if (pendingPromise && validDay(pendingPromise.promise_date) && pendingPromise.promise_date > today) { reason = 'Compromiso próximo'; priority = 6; }
      else if (days > 0 || ['late','delinquent'].includes(row.status)) { reason = 'Revisar vencimiento'; priority = 4; }
      else if (row.next_due_date === today) { reason = 'Vence hoy'; priority = 5; }
      else if (!history.length) { reason = 'Sin gestión registrada'; priority = 6; }
    }
    return {row, history, closed, missing, days, promise:pendingPromise, last:history[0] || null, priority, reason,
      bucket:closed ? 'Cerrados / revisión especial' : days === null ? 'Sin vencimiento' : days === 0 ? 'Sin atraso por fecha' : days <= 7 ? '1–7 días' : days <= 30 ? '8–30 días' : days <= 60 ? '31–60 días' : 'Más de 60 días'};
  }
  function agenda(rows, events, today = bogotaToday()) {
    return rows.map(row => collection(row, events, today)).filter(x=>!x.closed)
      .sort((a,b)=>a.priority-b.priority || (b.days||0)-(a.days||0) || String(a.row.id).localeCompare(String(b.row.id)));
  }

  function selectAgenda(items, scope) {
    return items.filter(x=>scope==='all'||scope==='today'&&x.priority>0&&x.priority<=5||scope==='data'&&x.missing.length||scope==='unmanaged'&&!x.last);
  }
  global.KoraCreditPortfolioDomain = Object.freeze({ selectAgenda, bogotaToday, validDay, collection, agenda, filter, money, number, statusLabel, summarize });
})(typeof window !== 'undefined' ? window : globalThis);
