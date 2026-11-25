(function (root) {
  'use strict';
  function calcular({ total, base, tarifa = 2.5 }) {
    const importe = Number(total), antesIVA = base === '' || base == null ? NaN : Number(base);
    if (!Number.isFinite(importe) || importe < 0 || !Number.isFinite(antesIVA) || antesIVA <= 0 || antesIVA > importe
        || Math.abs(antesIVA * 100 - Math.round(antesIVA * 100)) > 0.00001 || Number(tarifa) !== 2.5) {
      throw new Error('Confirma la base antes de IVA de la factura.');
    }
    const valor = Math.round(Math.round(antesIVA * 100) * Number(tarifa) / 100) / 100;
    return { base: antesIVA, tarifa: Number(tarifa), valor, neto: Math.round((importe - valor) * 100) / 100 };
  }
  function centavos(value, mensaje) {
    const numero = typeof value === 'number' || typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
    const cents = Math.round(numero * 100);
    if (!Number.isFinite(numero) || numero < 0 || !Number.isSafeInteger(cents)
      || Math.abs(numero * 100 - cents) > 0.00001) throw new Error(mensaje);
    return cents;
  }
  // El costo de los productos ya incluye IVA. No se presupone una tarifa de IVA.
  function calcularDesdeIVA({total, iva, tarifa = 2.5}) {
    const bruto = centavos(total, 'Revisa el total de los productos.');
    const impuesto = centavos(iva, 'Ingresa el IVA de la factura o confirma que no tiene IVA.');
    if (bruto <= 0 || impuesto >= bruto) throw new Error('El IVA debe ser menor que el total de la factura.');
    return {...calcular({total:bruto / 100, base:(bruto - impuesto) / 100, tarifa}), iva:impuesto / 100};
  }
  function calcularDesdeFactura({total, factura, tarifa = 2.5}) {
    const bruto = centavos(total, 'Revisa el total de los productos.');
    const facturaTotal = centavos(factura.total, 'El XML no contiene un total válido.');
    if (bruto !== facturaTotal) throw new Error('El total del XML no coincide con los productos. Completa o revisa sus cantidades y costos.');
    const base = centavos(factura.baseAntesIVA, 'El XML no discrimina la base antes de IVA. Ingresa el IVA que figura en la factura.');
    // Base y total iguales permiten confirmar IVA cero solo sin desglose fiscal.
    const sinDesglose = factura.iva == null && Array.isArray(factura.detalleIVA) && factura.detalleIVA.length === 0;
    const impuesto = centavos(sinDesglose && base === facturaTotal ? 0 : factura.iva,
      'El XML no discrimina el IVA. Ingresa el IVA que figura en la factura.');
    if (base + impuesto !== facturaTotal) throw new Error('La base y el IVA del XML no suman su total. Revisa el desglose antes de registrar.');
    return calcularDesdeIVA({total:bruto / 100, iva:impuesto / 100, tarifa});
  }
  root.CreditekRetencionAutomatica = { calcular, calcularDesdeIVA, calcularDesdeFactura };
})(typeof window === 'undefined' ? globalThis : window);
