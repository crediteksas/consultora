(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CreditekBodegaDomain = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  async function cargarTodasLasPaginas(consulta, tamano = 500) {
    const data = [];
    for (let desde = 0; ; desde += tamano) {
      const pagina = await consulta().range(desde, desde + tamano - 1);
      if (pagina.error) return { data: null, error: pagina.error };
      if (!Array.isArray(pagina.data)) return { data: null, error: { message: 'Respuesta de inventario incompleta' } };
      data.push(...pagina.data);
      if (pagina.data.length < tamano) return { data, error: null };
    }
  }

  function pendientesPorRemisionar(alertas, disponibles) {
    const cantidades = new Map();
    disponibles.forEach(u => cantidades.set(u.producto_id, (cantidades.get(u.producto_id) || 0) + 1));
    return alertas.map(a => {
      const cantidad = a.tipo === 'serializado' ? (cantidades.get(a.producto_id) || 0) : Number(a.stock_actual_central || 0);
      return { ...a, stock_actual_central: cantidad, descuadrado: cantidad !== 0 };
    });
  }

  function consolidarDisponibilidad({ productos, unidades, lotes, facturaId }) {
    const porProducto = new Map(
      (productos || []).map(producto => [
        producto.id,
        {
          ...producto,
          disponible: 0,
          precio_tienda: null,
          precios_varian: false,
          facturas: [],
        },
      ]),
    );

    function agregar(registro, cantidad) {
      if (facturaId && registro.factura_proveedor_id !== facturaId) return;
      const producto = porProducto.get(registro.producto_id);
      if (!producto) return;

      producto.disponible += Number(cantidad || 0);
      if (registro.factura_proveedor_id && !producto.facturas.includes(registro.factura_proveedor_id)) {
        producto.facturas.push(registro.factura_proveedor_id);
      }
      if (producto.precio_tienda == null) {
        producto.precio_tienda = registro.precio_tienda;
      } else if (Number(producto.precio_tienda) !== Number(registro.precio_tienda)) {
        producto.precios_varian = true;
      }
    }

    (unidades || []).forEach(unidad => agregar(unidad, 1));
    (lotes || []).forEach(lote => agregar(lote, lote.cantidad));

    return [...porProducto.values()]
      .filter(producto => producto.disponible > 0)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  function crearItemPayload(item, facturaId) {
    const payload = {
      producto_id: item.producto_id,
      cantidad: item.cantidad,
    };
    if (facturaId) payload.factura_proveedor_id = facturaId;
    if (item.precio_override_active) payload.precio_override = item.precio_remision;
    return payload;
  }

  return {
    cargarTodasLasPaginas,
    pendientesPorRemisionar,
    consolidarDisponibilidad,
    crearItemPayload,
  };
});
