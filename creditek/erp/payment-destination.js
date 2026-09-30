(function (root) {
  'use strict';

  function parse(value) {
    const parts = String(value || '').split(' · ').map(part => part.trim());
    if (parts.length === 3 && parts[0] && parts[1] && /^\d{6,20}$/.test(parts[2]))
      return { bank: parts[0], accountType: parts[1], number: parts[2], complete: true };
    return { bank: '', accountType: '', number: /^\d{6,20}$/.test(String(value || '').trim()) ? String(value).trim() : '', complete: false };
  }

  function format(bank, accountType, number) {
    const b = String(bank || '').trim(), t = String(accountType || '').trim(), n = String(number || '').trim();
    if (!b || b.includes('·') || !t || t.includes('·') || !/^\d{6,20}$/.test(n))
      throw new Error('Indica banco o billetera, tipo y número de 6 a 20 dígitos.');
    return `${b} · ${t} · ${n}`;
  }

  const api = { parse, format };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KoraPaymentDestination = api;
})(typeof window === 'undefined' ? globalThis : window);
