(function (global) {
  'use strict';

  function numero(valor) {
    if (valor === null || valor === undefined || valor === '') return null;
    const convertido = Number(valor);
    return Number.isFinite(convertido) ? convertido : null;
  }

  function coincideTienda(registro, campo, tiendaCodigo) {
    return !tiendaCodigo || registro?.[campo] === tiendaCodigo;
  }

  function unidadesDisponibles(unidades, tiendaCodigo) {
    return (unidades || []).filter(unidad =>
      unidad?.estado === 'disponible' &&
      coincideTienda(unidad, 'tienda_actual', tiendaCodigo)
    );
  }

  function stockDisponible(stock, tiendaCodigo) {
    return (stock || []).filter(registro =>
      coincideTienda(registro, 'tienda_codigo', tiendaCodigo) &&
      Number(registro?.cantidad || 0) > 0
    );
  }

  function valorVisibleUnidad(unidad) {
    return numero(unidad?.costo_remision);
  }

  function valorVisibleStock(registro) {
    return numero(registro?.costo_promedio);
  }

  function resumirInventario({ unidades, stock, tiendaCodigo = '', esCentral = false }) {
    const celulares = unidadesDisponibles(unidades, tiendaCodigo);
    const accesorios = stockDisponible(stock, tiendaCodigo);

    const valorTiendaCelulares = celulares.reduce(
      (total, unidad) => total + (numero(esCentral ? unidad.precio_tienda : unidad.costo_remision) || 0),
      0
    );
    const valorTiendaAccesorios = accesorios.reduce(
      (total, registro) =>
        total + Number(registro.cantidad || 0) * (numero(esCentral ? registro.precio_tienda : registro.costo_promedio) || 0),
      0
    );

    const resumen = {
      celularesDisponibles: celulares.length,
      accesoriosDisponibles: accesorios.reduce(
        (total, registro) => total + Number(registro.cantidad || 0),
        0
      ),
      valorTienda: valorTiendaCelulares + valorTiendaAccesorios,
      preciosPendientes:
        celulares.filter(unidad => numero(esCentral ? unidad.precio_tienda : unidad.costo_remision) === null).length +
        accesorios.filter(registro => numero(esCentral ? registro.precio_tienda : registro.costo_promedio) === null).length,
    };

    if (esCentral) {
      const valorInternoCelulares = celulares.reduce(
        (total, unidad) => total + (numero(unidad.costo_remision) || 0),
        0
      );
      const valorInternoAccesorios = accesorios.reduce(
        (total, registro) =>
          total + Number(registro.cantidad || 0) * (numero(registro.costo_promedio) || 0),
        0
      );
      resumen.valorInterno = valorInternoCelulares + valorInternoAccesorios;
    }

    return resumen;
  }

  function columnasUnidades(esCentral) {
    const visibles = [
      'id',
      'producto_id',
      'imei',
      'estado',
      'tienda_actual',
      'precio_tienda',
      'created_at',
    ];
    visibles.push('costo_remision');
    visibles.push('productos(codigo,nombre,categoria)', 'tiendas:tienda_actual(nombre)');
    return visibles.join(',');
  }

  function columnasStock(esCentral) {
    const visibles = [
      'producto_id',
      'tienda_codigo',
      'cantidad',
      'precio_tienda',
      'updated_at',
    ];
    visibles.push('costo_promedio');
    visibles.push('productos(codigo,nombre,categoria)', 'tiendas:tienda_codigo(nombre)');
    return visibles.join(',');
  }

  global.CreditekInventarioDomain = Object.freeze({
    unidadesDisponibles,
    stockDisponible,
    valorVisibleUnidad,
    valorVisibleStock,
    resumirInventario,
    columnasUnidades,
    columnasStock,
  });
})(typeof window !== 'undefined' ? window : globalThis);
