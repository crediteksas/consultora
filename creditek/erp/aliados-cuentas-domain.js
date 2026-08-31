(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CreditekAliadosCuentas = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const clean = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
  const digits = (value) => clean(value).replace(/[^0-9]/g, '');

  function validateNewBeneficiary(input) {
    const normalized = {
      // El codigo es una clave opaca del maestro. Debe viajar exactamente como
      // fue seleccionado; algunos aliados historicos usan codigos minusculos.
      originCode: clean(input.originCode),
      name: clean(input.name),
      identification: digits(input.identification),
      bank: clean(input.bank),
      accountType: clean(input.accountType).toLowerCase(),
      accountNumber: digits(input.accountNumber),
    };
    const errors = [];
    if (!normalized.originCode) errors.push('Selecciona el aliado al que corresponde el pago.');
    if (normalized.name.length < 3) errors.push('Escribe el nombre o razón social del titular.');
    if (normalized.identification.length < 5) errors.push('La identificación debe tener al menos 5 números.');
    if (!normalized.bank) errors.push('Escribe el banco.');
    if (!['ahorros', 'corriente'].includes(normalized.accountType)) errors.push('Selecciona un tipo de cuenta válido.');
    if (normalized.accountNumber.length < 5) errors.push('El número de cuenta debe tener al menos 5 números.');
    return { ok: errors.length === 0, errors, value: normalized };
  }

  return { clean, digits, validateNewBeneficiary };
}));
