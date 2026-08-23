(function (global) {
  'use strict';

  const n = valor => Number.isFinite(Number(valor)) ? Number(valor) : 0;
  const fechaUtc = iso => new Date(`${iso}T12:00:00Z`);
  const iso = fecha => fecha.toISOString().slice(0, 10);
  const dias = (desde, hasta) => Math.round((fechaUtc(hasta) - fechaUtc(desde)) / 86400000) + 1;

  function claveFila(fila) {
    return fila.id || fila.margen_id || [
      fila.remision_id, fila.remision_item_id, fila.producto_id,
      fila.fecha, fila.cantidad, fila.facturado, fila.costo,
    ].join('|');
  }

  function filtrarFilas(filas, filtros) {
    const unicas = new Map();
    (filas || []).forEach(fila => unicas.set(claveFila(fila), fila));
    return [...unicas.values()].filter(fila =>
      fila.fecha >= filtros.desde &&
      fila.fecha <= filtros.hasta &&
      (!filtros.tienda || fila.tienda_codigo === filtros.tienda) &&
      (!filtros.plataforma || fila.plataforma === filtros.plataforma) &&
      (!filtros.referencia || fila.referencia === filtros.referencia)
    );
  }

  function resumir(filas) {
    const facturado = filas.reduce((s, fila) => s + n(fila.facturado), 0);
    const costo = filas.reduce((s, fila) => s + n(fila.costo), 0);
    const utilidad = facturado - costo;
    const despachos = new Set(filas.map(fila => fila.remision_id).filter(Boolean)).size;
    return {
      facturado,
      costo,
      utilidad,
      margen: facturado ? utilidad / facturado : null,
      unidades: filas.reduce((s, fila) => s + n(fila.cantidad), 0),
      despachos,
      tiendas: new Set(filas.map(fila => fila.tienda_codigo).filter(Boolean)).size,
      ticketPromedio: despachos ? facturado / despachos : null,
    };
  }

  function moverDias(valor, cantidad) {
    const fecha = fechaUtc(valor);
    fecha.setUTCDate(fecha.getUTCDate() + cantidad);
    return iso(fecha);
  }

  function moverMeses(valor, cantidad) {
    const fecha = fechaUtc(valor);
    const dia = fecha.getUTCDate();
    fecha.setUTCDate(1);
    fecha.setUTCMonth(fecha.getUTCMonth() + cantidad);
    const ultimo = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth() + 1, 0)).getUTCDate();
    fecha.setUTCDate(Math.min(dia, ultimo));
    return iso(fecha);
  }

  function rangoComparacion(tipo, desde, hasta) {
    if (!tipo || tipo === 'sin') return null;
    if (tipo === 'anterior') {
      const duracion = dias(desde, hasta);
      return { desde: moverDias(desde, -duracion), hasta: moverDias(desde, -1) };
    }
    if (tipo === 'mes_anterior') {
      return { desde: moverMeses(desde, -1), hasta: moverMeses(hasta, -1) };
    }
    if (tipo === 'anio_anterior') {
      return { desde: moverMeses(desde, -12), hasta: moverMeses(hasta, -12) };
    }
    return null;
  }

  function comparar(actual, previo) {
    if (previo == null || previo === 0) return { comparable: false };
    const diferencia = n(actual) - n(previo);
    return { comparable: true, diferencia, variacion: diferencia / Math.abs(previo) };
  }

  function inicioSemana(valor) {
    const fecha = fechaUtc(valor);
    const dia = fecha.getUTCDay() || 7;
    fecha.setUTCDate(fecha.getUTCDate() - dia + 1);
    return iso(fecha);
  }

  function claveTiempo(fecha, granularidad) {
    if (granularidad === 'mes') return `${fecha.slice(0, 7)}-01`;
    if (granularidad === 'semana') return inicioSemana(fecha);
    return fecha;
  }

  function agruparTiempo(filas, granularidad) {
    const mapa = new Map();
    filas.forEach(fila => {
      const periodo = claveTiempo(fila.fecha, granularidad);
      if (!mapa.has(periodo)) mapa.set(periodo, { periodo, facturado: 0, costo: 0, utilidad: 0, margen: null });
      const grupo = mapa.get(periodo);
      grupo.facturado += n(fila.facturado);
      grupo.costo += n(fila.costo);
      grupo.utilidad = grupo.facturado - grupo.costo;
      grupo.margen = grupo.facturado ? grupo.utilidad / grupo.facturado : null;
    });
    return [...mapa.values()].sort((a, b) => a.periodo.localeCompare(b.periodo));
  }

  function agruparDimension(filas, campo) {
    const total = resumir(filas).facturado;
    const mapa = new Map();
    filas.forEach(fila => {
      const nombre = fila[campo] || 'Sin asignar';
      if (!mapa.has(nombre)) mapa.set(nombre, { nombre, facturado: 0, costo: 0, utilidad: 0, margen: null, participacion: null, unidades: 0 });
      const grupo = mapa.get(nombre);
      grupo.facturado += n(fila.facturado);
      grupo.costo += n(fila.costo);
      grupo.utilidad = grupo.facturado - grupo.costo;
      grupo.margen = grupo.facturado ? grupo.utilidad / grupo.facturado : null;
      grupo.participacion = total ? grupo.facturado / total : null;
      grupo.unidades += n(fila.cantidad);
    });
    return [...mapa.values()].sort((a, b) => b.facturado - a.facturado);
  }

  function granularidadAutomatica(desde, hasta) {
    const cantidad = dias(desde, hasta);
    if (cantidad <= 45) return 'dia';
    if (cantidad <= 180) return 'semana';
    return 'mes';
  }

  global.CreditekUtilidadDomain = Object.freeze({
    filtrarFilas,
    resumir,
    rangoComparacion,
    comparar,
    agruparTiempo,
    agruparDimension,
    granularidadAutomatica,
    dias,
    moverDias,
    moverMeses,
  });
})(typeof window !== 'undefined' ? window : globalThis);
