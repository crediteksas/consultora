(function (global) {
  'use strict';

  function protegerCelda(valor) {
    const texto = valor === null || valor === undefined ? '' : String(valor);
    const protegido = /^[\t\r ]*[=+\-@]/.test(texto) ? `'${texto}` : texto;
    return `"${protegido.replace(/"/g, '""')}"`;
  }

  function csv(encabezados, filas) {
    return [
      encabezados.map(protegerCelda).join(','),
      ...filas.map(fila => fila.map(protegerCelda).join(',')),
    ].join('\r\n');
  }

  function fechaCorte(fecha = new Date()) {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'America/Bogota',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).format(fecha);
  }

  function exportarCelulares({ unidades, esCentral, conteoCiego, corte }) {
    const encabezados = ['Fecha de corte', 'Tienda', 'Categoría', 'Referencia', 'IMEI o serial'];
    if (!conteoCiego) encabezados.push('Cantidad sistema');
    encabezados.push('Cantidad física');
    if (esCentral && !conteoCiego) encabezados.push('Costo interno autorizado');
    const filas = (unidades || []).map(unidad => {
      const fila = [
        corte, unidad.tienda_actual || '', unidad.productos?.categoria || 'celular',
        unidad.productos?.nombre || '', unidad.imei || '',
      ];
      if (!conteoCiego) fila.push(1);
      fila.push('');
      if (esCentral && !conteoCiego) fila.push(unidad.costo_remision ?? '');
      return fila;
    });
    return csv(encabezados, filas);
  }

  function exportarAccesorios({ stock, esCentral, conteoCiego, corte }) {
    const encabezados = ['Fecha de corte', 'Tienda', 'Categoría', 'Referencia'];
    if (!conteoCiego) encabezados.push('Cantidad sistema');
    encabezados.push('Cantidad física');
    if (esCentral && !conteoCiego) encabezados.push('Costo interno autorizado');
    const filas = (stock || []).map(registro => {
      const fila = [
        corte, registro.tienda_codigo || '', registro.productos?.categoria || 'accesorio',
        registro.productos?.nombre || '',
      ];
      if (!conteoCiego) fila.push(Number(registro.cantidad || 0));
      fila.push('');
      if (esCentral && !conteoCiego) fila.push(registro.costo_promedio ?? '');
      return fila;
    });
    return csv(encabezados, filas);
  }

  global.CreditekInventarioExport = Object.freeze({
    protegerCelda,
    fechaCorte,
    exportarCelulares,
    exportarAccesorios,
  });
})(typeof window !== 'undefined' ? window : globalThis);
