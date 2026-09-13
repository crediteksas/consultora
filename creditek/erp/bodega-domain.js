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
          tramos: [],
        },
      ]),
    );

    function agregar(registro, cantidad) {
      if (facturaId && registro.factura_proveedor_id !== facturaId) return;
      const producto = porProducto.get(registro.producto_id);
      if (!producto) return;

      producto.disponible += Number(cantidad || 0);
      producto.tramos.push({ cantidad: Number(cantidad || 0), precio: Number(registro.precio_tienda || 0), costo: Number(registro.costo_unitario ?? registro.costo_remision ?? 0) });
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
    if (Object.hasOwn(item, 'factura_id') && item.factura_id !== (facturaId || null)) throw new Error('La factura cambió. Vuelve a cargar los productos.');
    if (!Number.isInteger(Number(item.cantidad)) || Number(item.cantidad) <= 0 || Number(item.cantidad) > Number(item.stock_disponible ?? Infinity)) throw new Error('Cantidad inválida o superior al disponible');
    const payload = {
      producto_id: item.producto_id,
      cantidad: item.cantidad,
    };
    if (facturaId) payload.factura_proveedor_id = facturaId;
    if (item.precio_override_active) payload.precio_override = item.precio_remision;
    return payload;
  }

  function prepararItem(producto, facturaId, cantidad = producto.disponible) {
    return { producto_id: producto.id, producto_nombre: producto.nombre, tipo: producto.tipo,
      factura_id: facturaId || null, stock_disponible: producto.disponible, cantidad,
      precio_remision: producto.precio_tienda ?? 0, precio_override_active: false,
      precios_varian: producto.precios_varian, tramos: producto.tramos };
  }

  function valorarItem(item) {
    let pendiente = Number(item.cantidad), costo = 0, total = 0;
    for (const tramo of item.tramos || []) {
      const cantidad = Math.min(pendiente, tramo.cantidad);
      costo += cantidad * tramo.costo;
      total += cantidad * (item.precio_override_active ? Number(item.precio_remision) : tramo.precio);
      pendiente -= cantidad;
      if (pendiente <= 0) break;
    }
    return { costo, total, utilidad: total - costo };
  }

  return {
    cargarTodasLasPaginas,
    pendientesPorRemisionar,
    consolidarDisponibilidad,
    crearItemPayload,
    prepararItem,
    valorarItem,
  };
});
