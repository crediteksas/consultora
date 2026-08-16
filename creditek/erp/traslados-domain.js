(function (global) {
  'use strict';

  function numero(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function esSerializado(item) {
    return item?.tipoProducto === 'serializado' || Boolean(item?.unidad_id);
  }

  function resumir(items = []) {
    const resumen = { unidades: 0, celulares: 0, accesorios: 0, valorTotal: 0, novedades: [], duplicados: [] };
    const seriales = new Set();

    for (const item of items) {
      const serializado = esSerializado(item);
      const cantidad = serializado ? (item?.unidad_id ? 1 : 0) : Math.max(0, numero(item?.cantidad));
      if (cantidad <= 0) continue;

      if (serializado) {
        const serial = String(item.imei || item.unidad_id || '').trim();
        if (seriales.has(serial)) {
          resumen.duplicados.push(item.imei || serial);
          continue;
        }
        seriales.add(serial);
      }

      resumen.unidades += cantidad;
      if (serializado) resumen.celulares += 1;
      else resumen.accesorios += cantidad;

      const costo = numero(item?.costo);
      if (costo <= 0) {
        resumen.novedades.push(`Producto sin valor definido: ${item?.nombreProducto || item?.productos?.nombre || item?.imei || 'ítem del traslado'}`);
        continue;
      }

      resumen.valorTotal += costo * cantidad;
    }

    return resumen;
  }

  function formatearCOP(value) {
    return `$ ${Math.round(numero(value)).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
  }

  function puedeRecibir(perfil, traslado) {
    return perfil?.rol === 'admin_tienda' &&
      traslado?.estado === 'despachado' &&
      perfil?.tienda_codigo === traslado?.tienda_destino;
  }

  global.KoraTrasladosDomain = Object.freeze({ resumir, formatearCOP });
  global.CreditekTrasladosDomain = Object.freeze({ puedeRecibir });
})(window);
