(function (global) {
  'use strict';

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

  global.CreditekReportesQueryCache = Object.freeze({ crear });
})(typeof window !== 'undefined' ? window : globalThis);
