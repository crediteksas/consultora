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
    const encabezados = [
      'Fecha de corte', 'Tienda', 'Código tienda', 'Código producto',
      'Categoría', 'Referencia', 'IMEI o serial',
    ];
    if (!conteoCiego) encabezados.push('Cantidad sistema');
    encabezados.push('Cantidad física');
    if (esCentral && !conteoCiego) encabezados.push('Costo interno autorizado');
    const filas = (unidades || []).map(unidad => {
      const fila = [
        corte, unidad.tiendas?.nombre || unidad.tienda_actual || '',
        unidad.tienda_actual || '', unidad.productos?.codigo || '',
        unidad.productos?.categoria || 'celular', unidad.productos?.nombre || '',
        unidad.imei || '',
      ];
      if (!conteoCiego) fila.push(1);
      fila.push('');
      if (esCentral && !conteoCiego) fila.push(unidad.costo_remision ?? '');
      return fila;
    });
    return csv(encabezados, filas);
  }

  function exportarAccesorios({ stock, esCentral, conteoCiego, corte }) {
    const encabezados = [
      'Fecha de corte', 'Tienda', 'Código tienda', 'Código producto',
      'Categoría', 'Referencia',
    ];
    if (!conteoCiego) encabezados.push('Cantidad sistema');
    encabezados.push('Cantidad física');
    if (esCentral && !conteoCiego) encabezados.push('Costo interno autorizado');
    const filas = (stock || []).map(registro => {
      const fila = [
        corte, registro.tiendas?.nombre || registro.tienda_codigo || '',
        registro.tienda_codigo || '', registro.productos?.codigo || '',
        registro.productos?.categoria || 'accesorio', registro.productos?.nombre || '',
      ];
      if (!conteoCiego) fila.push(Number(registro.cantidad || 0));
      fila.push('');
      if (esCentral && !conteoCiego) fila.push(registro.costo_promedio ?? '');
      return fila;
    });
    return csv(encabezados, filas);
  }

  function textoSeguro(valor) {
    const texto = valor === null || valor === undefined ? '' : String(valor);
    return /^[\t\r ]*[=+\-@]/.test(texto) ? `'${texto}` : texto;
  }

  function numero(valor) {
    const convertido = Number(valor);
    return Number.isFinite(convertido) ? convertido : 0;
  }

  function filasCelulares(unidades, esCentral) {
    return (unidades || []).map(unidad => {
      const valorUnitario = numero(unidad.costo_remision);
      const etiquetaUnitario = esCentral ? 'Costo interno unitario' : 'Costo unitario';
      const etiquetaTotal = esCentral ? 'Valor total al costo interno' : 'Valor total al costo';
      return {
        Tienda: textoSeguro(unidad.tiendas?.nombre || unidad.tienda_actual),
        'Código tienda': textoSeguro(unidad.tienda_actual),
        'Código producto': textoSeguro(unidad.productos?.codigo),
        Categoría: textoSeguro(unidad.productos?.categoria || 'Celulares'),
        Referencia: textoSeguro(unidad.productos?.nombre),
        Cantidad: 1,
        IMEI: textoSeguro(unidad.imei),
        [etiquetaUnitario]: valorUnitario,
        [etiquetaTotal]: valorUnitario,
      };
    });
  }

  function filasAccesorios(stock, esCentral) {
    return (stock || []).map(registro => {
      const cantidad = numero(registro.cantidad);
      const valorUnitario = numero(registro.costo_promedio);
      const etiquetaUnitario = esCentral ? 'Costo interno unitario' : 'Costo unitario';
      const etiquetaTotal = esCentral ? 'Valor total al costo interno' : 'Valor total al costo';
      return {
        Tienda: textoSeguro(registro.tiendas?.nombre || registro.tienda_codigo),
        'Código tienda': textoSeguro(registro.tienda_codigo),
        'Código producto': textoSeguro(registro.productos?.codigo),
        Categoría: textoSeguro(registro.productos?.categoria || 'Accesorios'),
        'Referencia o producto': textoSeguro(registro.productos?.nombre),
        Cantidad: cantidad,
        [etiquetaUnitario]: valorUnitario,
        [etiquetaTotal]: cantidad * valorUnitario,
      };
    });
  }

  function crearLibroInventario({ XLSX, tipo, registros, esCentral, corte }) {
    if (!XLSX?.utils?.json_to_sheet || !XLSX?.utils?.book_new) {
      throw new Error('La biblioteca de Excel no está disponible.');
    }
    const filas = tipo === 'celulares'
      ? filasCelulares(registros, esCentral)
      : filasAccesorios(registros, esCentral);
    const hoja = XLSX.utils.json_to_sheet(filas);
    hoja['!autofilter'] = { ref: hoja['!ref'] || 'A1:F1' };
    hoja['!cols'] = tipo === 'celulares'
      ? [
        { wch: 26 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 32 },
        { wch: 12 }, { wch: 20 }, { wch: 18 }, { wch: 18 },
      ]
      : [
        { wch: 26 }, { wch: 16 }, { wch: 18 }, { wch: 18 },
        { wch: 32 }, { wch: 12 }, { wch: 22 }, { wch: 18 },
      ];
    const columnasMoneda = tipo === 'celulares' ? ['H', 'I'] : ['G', 'H'];
    for (let fila = 2; fila <= filas.length + 1; fila += 1) {
      for (const columna of columnasMoneda) {
        const celda = hoja[`${columna}${fila}`];
        if (celda) celda.z = '$#,##0.00';
      }
    }

    const resumen = XLSX.utils.aoa_to_sheet([
      ['Inventario KORA'],
      ['Fecha y hora de corte', corte],
      ['Tipo', tipo === 'celulares' ? 'Celulares' : 'Accesorios'],
      ['Registros', filas.length],
    ]);
    resumen['!cols'] = [{ wch: 24 }, { wch: 24 }];

    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Inventario');
    XLSX.utils.book_append_sheet(libro, resumen, 'Resumen');
    return libro;
  }

  function crearPlantillaCargaInicial({ XLSX, tiendaCodigo = '', tiendaNombre = '' }) {
    if (!XLSX?.utils?.aoa_to_sheet || !XLSX?.utils?.book_new) {
      throw new Error('La biblioteca de Excel no está disponible.');
    }
    const encabezados = [
      'Código de producto', 'Tienda nombre', 'Tipo', 'Referencia o producto',
      'IMEI o serial', 'Cantidad', 'Costo unitario', 'Precio de tienda', 'Observación',
    ];
    const ejemploCelular = ['EJ-CEL-001', tiendaNombre, 'CELULAR', 'EJEMPLO — BORRAR', '000000000000000', 1, 0, 0, 'Borra esta fila antes de entregar'];
    const ejemploAccesorio = ['EJ-ACC-001', tiendaNombre, 'ACCESORIO', 'EJEMPLO — BORRAR', '', 1, 0, 0, 'Borra esta fila antes de entregar'];
    const hoja = XLSX.utils.aoa_to_sheet([encabezados, ejemploCelular, ejemploAccesorio]);
    hoja['!autofilter'] = { ref: 'A1:I3' };
    hoja['!freeze'] = { xSplit: 0, ySplit: 1 };
    hoja['!cols'] = [
      { wch: 18 }, { wch: 24 }, { wch: 14 }, { wch: 34 }, { wch: 22 },
      { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 38 },
    ];
    for (const columna of ['G', 'H']) {
      for (let fila = 2; fila <= 3; fila += 1) hoja[`${columna}${fila}`].z = '$#,##0.00';
    }

    const instrucciones = XLSX.utils.aoa_to_sheet([
      ['PLANTILLA DE INVENTARIO INICIAL — KORA'],
      ['1', 'No cambies los nombres de las columnas. El código de tienda se selecciona al importar y no debe escribirse como nombre principal.'],
      ['2', 'Usa una fila por cada celular; el IMEI o serial es obligatorio.'],
      ['3', 'Para accesorios, deja vacío IMEI o serial e indica la cantidad total.'],
      ['4', 'Completa costo unitario y precio de tienda en pesos, sin símbolos ni puntos.'],
      ['5', 'Borra las dos filas de ejemplo antes de entregar el archivo.'],
      ['6', 'Administración puede validar e importar este archivo desde Inventario Retail. La carga completa es atómica: si una fila falla, no se carga ninguna.'],
    ]);
    instrucciones['!cols'] = [{ wch: 8 }, { wch: 105 }];

    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, instrucciones, 'Instrucciones');
    XLSX.utils.book_append_sheet(libro, hoja, 'Inventario inicial');
    return libro;
  }

  global.CreditekInventarioExport = Object.freeze({
    protegerCelda,
    fechaCorte,
    exportarCelulares,
    exportarAccesorios,
    filasCelulares,
    filasAccesorios,
    crearLibroInventario,
    crearPlantillaCargaInicial,
  });
})(typeof window !== 'undefined' ? window : globalThis);
