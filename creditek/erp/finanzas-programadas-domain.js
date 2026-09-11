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

  function money(value) {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(number(value));
  }

  function normalizeView(value) {
    return value === 'retail' ? 'retail' : 'general';
  }

  function scopeForView(view) {
    return normalizeView(view) === 'retail' ? 'retail_store' : 'business_general';
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
    BUSINESS_LABELS, CATEGORY_LABELS, STATUS_LABELS, csv, filterEntries, money, normalizeView, number, recurrenceLabel, scopeForView, summarize,
  });
})(typeof window !== 'undefined' ? window : globalThis);
