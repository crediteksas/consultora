(function () {
  'use strict';

  const MAX_XML = 2 * 1024 * 1024;
  const MAX_ZIP = 10 * 1024 * 1024;
  const hijos = (node, name) => Array.from(node?.children || []).filter(child => child.localName === name);
  const hijo = (node, name) => hijos(node, name)[0];
  const valor = (node, ...path) => path.reduce(hijo, node)?.textContent.trim() || '';
  const numeroFactura = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const nit = value => String(value || '').split('-')[0].replace(/\D/g, '');

  function importe(value) {
    if (!/^\d+(?:\.\d{1,2})?$/.test(value) || !Number.isSafeInteger(Math.round(Number(value) * 100))) return null;
    return Number(value);
  }

  function leerXML(text) {
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('El XML contiene una declaración no admitida.');
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const root = doc.documentElement;
    if (root.localName === 'parsererror') throw new Error('El XML no se pudo leer.');
    return root;
  }

  function leerFactura(text) {
    let factura = leerXML(text);
    if (factura.localName === 'AttachedDocument') {
      factura = leerXML(valor(factura, 'Attachment', 'ExternalReference', 'Description'));
    }
    if (factura.localName !== 'Invoice') throw new Error('El XML no es una factura electrónica.');
    const emisor = hijo(factura, 'AccountingSupplierParty');
    const parte = hijo(emisor, 'Party');
    const nitEmisor = nit(valor(parte, 'PartyTaxScheme', 'CompanyID') || valor(parte, 'PartyLegalEntity', 'CompanyID'));
    const numero = numeroFactura(valor(factura, 'ID'));
    const moneda = valor(factura, 'DocumentCurrencyCode');
    const totales = hijo(factura, 'LegalMonetaryTotal');
    const total = importe(valor(totales, 'TaxInclusiveAmount'));
    if (!nitEmisor || !numero || moneda !== 'COP' || total === null) {
      throw new Error('La factura requiere emisor, número, moneda COP y total.');
    }
    function impuestos(grupo) {
      return hijos(factura, grupo).flatMap(conjunto => hijos(conjunto, 'TaxSubtotal').map(linea => {
        const esquema = hijo(hijo(linea, 'TaxCategory'), 'TaxScheme');
        return { codigo: valor(esquema, 'ID'), tipo: valor(esquema, 'Name'),
          monto: importe(valor(linea, 'TaxAmount')), base: importe(valor(linea, 'TaxableAmount')),
          tarifa: importe(valor(linea, 'Percent') || valor(linea, 'TaxCategory', 'Percent')) };
      }));
    }
    const iva = impuestos('TaxTotal').filter(linea => linea.codigo === '01' || linea.tipo.toUpperCase() === 'IVA');
    const retenciones = impuestos('WithholdingTaxTotal');
    const sum = lineas => lineas.length && lineas.every(linea => linea.monto !== null)
      ? lineas.reduce((centavos, linea) => centavos + Math.round(linea.monto * 100), 0) / 100 : null;
    return { nit: nitEmisor, numero, total, subtotal: importe(valor(totales, 'LineExtensionAmount')),
      iva: sum(iva), retencion: sum(retenciones), detalleIVA: iva, detalleRetencion: retenciones };
  }

  async function leerArchivo(archivo) {
    if (/\.xml$/i.test(archivo.name) && archivo.size <= MAX_XML) {
      return [leerFactura(await archivo.text())];
    }
    if (!/\.zip$/i.test(archivo.name) || archivo.size > MAX_ZIP) throw new Error('Usa XML de hasta 2 MB o ZIP de hasta 10 MB.');
    let bytes = 0;
    let cantidad = 0;
    const archivos = window.fflate.unzipSync(new Uint8Array(await archivo.arrayBuffer()), {
      filter: ({name,originalSize}) => {
        if (!/\.xml$/i.test(name)) return false;
        bytes += originalSize;
        cantidad += 1;
        if (originalSize > MAX_XML || bytes > MAX_ZIP || cantidad > 30) throw new Error('El ZIP contiene demasiados XML o supera el tamaño permitido.');
        return true;
      },
    });
    const facturas = [];
    for (const contenido of Object.values(archivos)) {
      const texto = new TextDecoder().decode(contenido);
      const raiz = leerXML(texto).localName;
      if (raiz === 'Invoice' || raiz === 'AttachedDocument') facturas.push(leerFactura(texto));
    }
    if (!facturas.length) throw new Error('El ZIP no contiene XML de factura.');
    return facturas;
  }

  window.CreditekProveedoresImpuestos = { leerFactura, leerArchivo, numeroFactura, nit };
})();
