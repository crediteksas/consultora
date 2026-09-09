(function (global) {
  'use strict';

  function relacionUnica(valor) {
    return Array.isArray(valor) ? (valor[0] || null) : (valor || null);
  }

  function numero(valor) {
    const convertido = Number(valor);
    return Number.isFinite(convertido) ? convertido : 0;
  }

  async function accesoriosDeTienda(sb, tienda) {
    if (!tienda) throw new Error('Selecciona una tienda para consultar su inventario.');
    const filas = [];
    const tamano = 500;
    for (let desde = 0; ; desde += tamano) {
      const { data, error } = await sb.from('stock_cantidad')
        .select('producto_id,cantidad,precio_tienda,costo_promedio,productos!inner(id,codigo,nombre,tipo,activo)')
        .eq('tienda_codigo', tienda).eq('productos.activo', true)
        .eq('productos.tipo', 'cantidad').gt('cantidad', 0)
        .order('producto_id').range(desde, desde + tamano - 1);
      if (error) throw error;
      filas.push(...(data || []));
      if (!data || data.length < tamano) break;
    }
    return filas.map(fila => ({ ...relacionUnica(fila.productos),
      cantidad: numero(fila.cantidad), precio_tienda: fila.precio_tienda,
      costo_promedio: fila.costo_promedio,
    })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  function columnasListaVentas() {
    return [
      'id',
      'consecutivo',
      'tienda_codigo',
      'vendedor',
      'tipo',
      'cliente_id',
      'total',
      'fecha',
      'anulada',
      'created_at',
      'clientes(nombre_completo,cedula)',
      'vendedor_perfil:vendedor(nombre)',
      'venta_items(cantidad,productos(nombre))',
    ].join(',');
  }

  function columnasDetalleItems() {
    return [
      'id',
      'venta_id',
      'producto_id',
      'unidad_id',
      'cantidad',
      'precio_venta',
      'productos(codigo,nombre)',
      'unidades(imei)',
    ].join(',');
  }

  function columnasUnidadVenta() {
    return [
      'id',
      'producto_id',
      'imei',
      'estado',
      'tienda_actual',
      'costo_remision',
      'precio_tienda',
      'productos(nombre)',
    ].join(',');
  }

  function prepararDetalle({ venta, items, credito }) {
    const itemsSeguros = (items || []).map(item => {
      const producto = relacionUnica(item.productos);
      const unidad = relacionUnica(item.unidades);
      const cantidad = Math.max(0, numero(item.cantidad));
      const precioUnitario = Math.max(0, numero(item.precio_venta));
      return {
        id: item.id || null,
        unidadId: item.unidad_id || null,
        productoId: item.producto_id || null,
        codigo: producto?.codigo || '',
        nombre: producto?.nombre || 'Producto',
        cantidad,
        precioUnitario,
        subtotal: cantidad * precioUnitario,
        imei: unidad?.imei || null,
      };
    });

    return {
      venta: {
        id: venta?.id || null,
        consecutivo: venta?.consecutivo || null,
        tipo: venta?.tipo || '',
        total: numero(venta?.total),
      },
      items: itemsSeguros,
      totalCalculado: itemsSeguros.reduce((total, item) => total + item.subtotal, 0),
      credito: credito
        ? {
            financiera: credito.financiera || '',
            cuotaInicial: numero(credito.cuota_inicial),
            valorEsperado: numero(credito.valor_esperado_financiera),
            plazoMeses: numero(credito.plazo_meses),
            estadoConciliacion: credito.estado_conciliacion || '',
          }
        : null,
    };
  }

  global.CreditekVentasDomain = Object.freeze({
    accesoriosDeTienda,
    columnasListaVentas,
    columnasDetalleItems,
    columnasUnidadVenta,
    prepararDetalle,
  });
})(typeof window !== 'undefined' ? window : globalThis);
