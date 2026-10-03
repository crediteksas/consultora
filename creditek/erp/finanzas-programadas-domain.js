(function (global) {
  'use strict';

  const BUSINESS_LABELS = Object.freeze({ retail: 'Retail', b2b: 'B2B', aliados: 'Aliados' });
  const CATEGORY_LABELS = Object.freeze({
    nomina: 'Nómina', arriendo: 'Arriendo', contador: 'Contador', servicio: 'Servicio', otro: 'Otro', retiro: 'Retiro de utilidad',
  });
  const STATUS_LABELS = Object.freeze({
    pendiente_aprobacion: 'Pendiente de aprobar', aprobado: 'Aprobado', rechazado: 'Rechazado', pagado: 'Pagado', anulado: 'Anulado',
  });

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function destinationAccount(bank, type, account) {
    const value = String(account || '').trim();
    if (!bank && !type && !value) return null;
    if (!bank || !type || !/^\d{6,20}$/.test(value)) throw new Error('Selecciona banco o billetera, tipo de cuenta y un número válido de 6 a 20 dígitos. No ingreses un correo.');
    return `${bank} · ${type} · ${value}`;
  }

  function money(value) {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(number(value));
  }

  function parseMoneyInput(value) {
    const raw=String(value??'').replace(/[\s\u00a0\u202f]/g,'').replace(/^\$/,'');
    if (!raw) return null;
    if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(raw)) throw new Error('Escribe el valor en pesos, por ejemplo $ 2.225.734.');
    const parsed=Number(raw.replaceAll('.','').replace(',','.'));
    if (!Number.isFinite(parsed) || parsed<0) throw new Error('Escribe un valor válido en pesos.');
    return parsed;
  }

  function formatMoneyInput(value) {
    if (value===null || value===undefined || value==='') return '';
    const amount=typeof value==='number'?value:parseMoneyInput(value);
    if (!Number.isFinite(amount)) throw new Error('Escribe un valor válido en pesos.');
    return new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0,maximumFractionDigits:2}).format(amount);
  }

  function normalizeView(value) {
    return value === 'retail' ? 'retail' : 'general';
  }

  function scopeForView(view) {
    return normalizeView(view) === 'retail' ? 'retail_store' : 'business_general';
  }

  function withdrawalPeriod(closures, business, dueDate) {
    if (!BUSINESS_LABELS[business] || !/^\d{4}-\d{2}-\d{2}$/.test(String(dueDate || ''))) throw new Error('Selecciona un negocio y una fecha válidos.');
    const closed = (Array.isArray(closures) ? closures : [])
      .filter(row => row.negocio === business && /^\d{4}-\d{2}-01$/.test(String(row.periodo || '')) && row.periodo < `${dueDate.slice(0,7)}-01`)
      .sort((a, b) => b.periodo.localeCompare(a.periodo))[0];
    if (!closed) throw new Error(`Falta registrar el último cierre de utilidad de ${BUSINESS_LABELS[business]}. No se puede calcular el disponible.`);
    const next = new Date(`${closed.periodo}T12:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const from = next.toISOString().slice(0, 10);
    if (from > dueDate) throw new Error('No hay utilidad posterior al cierre para retirar.');
    return { from, to: dueDate, carry: number(closed.disponible), closed: closed.periodo };
  }

  function withdrawalBalance(profit, period, entries, business) {
    if (!Number.isFinite(Number(profit)) || !Number.isFinite(period.carry)) throw new Error('No se pudo verificar la utilidad acumulada.');
    const reserved = (Array.isArray(entries) ? entries : []).filter(row =>
      row.entry_type === 'retiro_utilidad' && row.business_unit === business &&
      ['pendiente_aprobacion', 'aprobado', 'pagado'].includes(row.status) &&
      row.due_date >= period.from && row.due_date <= period.to
    ).reduce((sum, row) => sum + number(row.amount), 0);
    return { profit: number(profit), reserved, available: Math.max(0, Math.round((period.carry + number(profit) - reserved) * 100) / 100) };
  }

  function recurrenceLabel(days) {
    const safe = [...new Set((Array.isArray(days) ? days : []).map(number).filter(day => day >= 1 && day <= 31))].sort((a, b) => a - b);
    return safe.map(day => day === 31 ? 'fin de mes' : `día ${day}`).join(' y ') || 'Sin fecha';
  }

  function filterEntries(rows, filters = {}) {
    const needle = String(filters.query || '').trim().toLocaleLowerCase('es');
    return (Array.isArray(rows) ? rows : []).filter(row => {
      const haystack = [row.concept,row.beneficiary,row.beneficiary_document,row.store_name,row.store_code]
        .filter(Boolean).join(' ').toLocaleLowerCase('es');
      return (!filters.scope || row.scope === filters.scope)
        && (!filters.business || row.business_unit === filters.business)
        && (!filters.store || row.store_code === filters.store)
        && (!filters.status || row.status === filters.status)
        && (!filters.type || row.entry_type === filters.type)
        && (!filters.from || row.due_date >= filters.from)
        && (!filters.to || row.due_date <= filters.to)
        && (!needle || haystack.includes(needle));
    });
  }

  function summarize(rows) {
    return (Array.isArray(rows) ? rows : []).reduce((out, row) => {
      const amount = number(row.amount);
      out.count += 1;
      if (row.status === 'pendiente_aprobacion') out.pending += 1;
      if (row.entry_type === 'retiro_utilidad') {
        out.withdrawals += amount;
        if (row.status === 'pagado') out.paidWithdrawals += amount;
      } else {
        out.expenses += amount;
        if (row.status === 'pagado') out.paidExpenses += amount;
      }
      return out;
    }, { count: 0, pending: 0, expenses: 0, paidExpenses: 0, withdrawals: 0, paidWithdrawals: 0 });
  }

  function csv(rows) {
    const headers = ['Fecha','Negocio','Tienda','Tipo','Categoría','Concepto','Beneficiario','Identificación','Valor','Estado'];
    const quote = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const lines = (Array.isArray(rows) ? rows : []).map(row => [
      row.due_date, BUSINESS_LABELS[row.business_unit] || row.business_unit, row.store_name || row.store_code || '',
      row.entry_type === 'retiro_utilidad' ? 'Retiro de utilidad' : 'Gasto', CATEGORY_LABELS[row.category] || row.category,
      row.concept,row.beneficiary,row.beneficiary_document,number(row.amount),STATUS_LABELS[row.status] || row.status,
    ].map(quote).join(','));
    return `\ufeff${headers.map(quote).join(',')}\n${lines.join('\n')}`;
  }

  global.KoraFinancialDomain = Object.freeze({
    BUSINESS_LABELS, CATEGORY_LABELS, STATUS_LABELS, destinationAccount, csv, filterEntries, money, parseMoneyInput, formatMoneyInput, normalizeView, number, recurrenceLabel, scopeForView, summarize, withdrawalPeriod, withdrawalBalance,
  });
})(typeof window !== 'undefined' ? window : globalThis);
