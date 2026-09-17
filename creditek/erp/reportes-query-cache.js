(function (global) {
  'use strict';

  // El límite del API no es el total del informe. Cada página conserva los
  // filtros/RLS y requiere un orden único definido por el consumidor.
  async function todas(factory) {
    const data = [];
    const pageSize = 500;
    for (let from = 0; ; from += pageSize) {
      const response = await factory().range(from, from + pageSize - 1);
      if (response.error) throw response.error;
      if (!Array.isArray(response.data)) throw new Error('Respuesta incompleta del informe');
      data.push(...response.data);
      if (response.data.length < pageSize) return { data, error: null };
    }
  }

  function crear(loaders) {
    const consultas = new Map();

    async function obtener(nombre) {
      const loader = loaders[nombre];
      if (typeof loader !== 'function') {
        throw new Error(`Consulta no registrada: ${nombre}`);
      }
      if (!consultas.has(nombre)) {
        consultas.set(nombre, Promise.resolve().then(loader));
      }
      return consultas.get(nombre);
    }

    return Object.freeze({ obtener });
  }

  global.CreditekReportesQueryCache = Object.freeze({ crear, todas });
})(typeof window !== 'undefined' ? window : globalThis);
