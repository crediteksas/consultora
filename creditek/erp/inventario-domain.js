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

  function valorVisibleUnidad(unidad, esCentral = false) {
    return numero(esCentral ? unidad?.costo_remision : unidad?.precio_tienda);
  }

  function valorVisibleStock(registro, esCentral = false) {
    return numero(esCentral ? registro?.costo_promedio : registro?.precio_tienda);
  }

  function resumirInventario({ unidades, stock, tiendaCodigo = '', esCentral = false }) {
    if (!esCentral && !tiendaCodigo) { unidades = []; stock = []; }
    const celulares = unidadesDisponibles(unidades, tiendaCodigo);
    const accesorios = stockDisponible(stock, tiendaCodigo);

    const valorTiendaCelulares = celulares.reduce(
      (total, unidad) => total + (numero(unidad.precio_tienda) || 0),
      0
    );
    const valorTiendaAccesorios = accesorios.reduce(
      (total, registro) =>
        total + Number(registro.cantidad || 0) * (numero(registro.precio_tienda) || 0),
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
        celulares.filter(unidad => numero(unidad.precio_tienda) === null).length +
        accesorios.filter(registro => numero(registro.precio_tienda) === null).length,
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
    if (esCentral) visibles.push('costo_remision');
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
    if (esCentral) visibles.push('costo_promedio');
    visibles.push('productos(codigo,nombre,categoria)', 'tiendas:tienda_codigo(nombre)');
    return visibles.join(',');
  }

  async function cargarPaginas(crearConsulta) {
    const filas = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await crearConsulta().range(offset, offset + 499);
      if (error) return { data: null, error };
      filas.push(...(data || []));
      if ((data || []).length < 500) return { data: filas, error: null };
    }
  }

  function acotarTienda(filas, campo, tiendaCodigo, esCentral = false) {
    if (!esCentral && !tiendaCodigo) return [];
    return (filas || []).filter(r => !tiendaCodigo || r?.[campo] === tiendaCodigo);
  }

  function textoBusqueda(value) {
    return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es');
  }

  function ordenarPorNombre(filas) {
    const comparar = new Intl.Collator('es', { sensitivity: 'base', numeric: true }).compare;
    return [...(filas || [])].sort((a,b) =>
      comparar(a.productos?.nombre || a.nombre || '', b.productos?.nombre || b.nombre || '') ||
      comparar(a.productos?.codigo || a.codigo || '', b.productos?.codigo || b.codigo || '') ||
      comparar(a.tienda_codigo || '', b.tienda_codigo || '') || comparar(a.id || '', b.id || '')
    );
  }

  function filtrarAccesorios(filas, { tiendaCodigo, esCentral = false, categoria = '', busqueda = '', soloAgotados = false }) {
    const q = textoBusqueda(busqueda);
    return ordenarPorNombre(acotarTienda(filas, 'tienda_codigo', tiendaCodigo, esCentral).filter(r =>
      (!categoria || r.productos?.categoria === categoria) &&
      (!soloAgotados || Number(r.cantidad || 0) <= 0) &&
      (!q || textoBusqueda(`${r.productos?.nombre || ''} ${r.productos?.codigo || ''}`).includes(q))
    ));
  }

  global.CreditekInventarioDomain = Object.freeze({
    acotarTienda,
    textoBusqueda,
    ordenarPorNombre,
    filtrarAccesorios,
    cargarPaginas,
    unidadesDisponibles,
    stockDisponible,
    valorVisibleUnidad,
    valorVisibleStock,
    resumirInventario,
    columnasUnidades,
    columnasStock,
  });
})(typeof window !== 'undefined' ? window : globalThis);
