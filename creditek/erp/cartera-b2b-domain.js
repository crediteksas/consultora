(function (global) {
  'use strict';
  const fechaBogota = valor => new Intl.DateTimeFormat('en-CA', {
    timeZone:'America/Bogota', year:'numeric', month:'2-digit', day:'2-digit',
  }).format(new Date(valor));

  async function leerTodas(consulta) {
    const filas = [];
    for (let desde = 0; ; desde += 500) {
      const { data, error } = await consulta().range(desde, desde + 499);
      if (error) throw error;
      filas.push(...(data || []));
      if (!data || data.length < 500) return filas;
    }
  }

  function reunir(origenes, clientesB2B, corriente, libroB2B) {
    const cuentas = new Map(clientesB2B.map(c => [c.cuenta_id, c.cliente_codigo]));
    const tipos = new Map(origenes.map(o => [o.codigo, o.tipo]));
    const movimientos = [
      ...corriente.filter(m => tipos.get(m.tienda_codigo) === 'propia').map(m => ({
        ...m, id:`tienda:${m.id}`, fecha:fechaBogota(m.created_at), responsable:m.usuario,
      })),
      ...libroB2B.filter(m => cuentas.has(m.cuenta_id)).map(m => ({
        ...m, id:`cliente:${m.id}`, tienda_codigo:cuentas.get(m.cuenta_id),
        tipo:m.efecto === 'debito' ? 'cargo' : 'abono', fecha:m.fecha_efectiva,
        responsable:m.metadatos?.registrado_por || m.creado_por,
      })),
    ];
    const conMovimiento = new Set(movimientos.map(m => m.tienda_codigo));
    const clientes = origenes.filter(o =>
      o.tipo === 'propia' ? o.activo || conMovimiento.has(o.codigo) : clientesB2B.some(c => c.cliente_codigo === o.codigo)
    ).map(o => ({cliente_codigo:o.codigo, cliente:o.nombre, canal:o.tipo === 'propia' ? 'Tienda Retail' : 'Cliente B2B', activo:o.activo}));
    return { clientes, movimientos };
  }

  function resumir(clientes, movimientos, desde, hasta, codigo = '', busqueda = '') {
    const normalizar = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const saldo = global.CreditekCuentaCorrienteDomain.calcularResumenPorTienda;
    const anteriores = saldo(movimientos.filter(m => m.fecha < desde));
    const cierre = saldo(movimientos.filter(m => m.fecha <= hasta));
    const periodo = movimientos.filter(m => m.fecha >= desde && m.fecha <= hasta);
    return clientes.filter(c => (!codigo || c.cliente_codigo === codigo) && normalizar(c.cliente).includes(normalizar(busqueda)))
      .map(c => {
        const ms = periodo.filter(m => m.tienda_codigo === c.cliente_codigo);
        return {...c, inicial:anteriores[c.cliente_codigo]?.saldo || 0,
          cargos:ms.filter(m => m.tipo === 'cargo').reduce((s,m) => s + Number(m.monto),0),
          abonos:ms.filter(m => m.tipo === 'abono').reduce((s,m) => s + Number(m.monto),0),
          saldo:cierre[c.cliente_codigo]?.saldo || 0, movimientos:ms.length};
      }).sort((a,b) => a.cliente.localeCompare(b.cliente,'es'));
  }
  global.CreditekCarteraB2BDomain = Object.freeze({leerTodas, reunir, resumir});
})(typeof window !== 'undefined' ? window : globalThis);
