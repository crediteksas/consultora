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

  const esCargaInicial = m => m.tipo === 'cargo' && m.referencia_tipo === 'saldo_inicial';
  const esAjusteAuditoria = m => m.referencia_tipo === 'ajuste_auditoria_b2b';

  function reunir(origenes, clientesB2B, corriente, libroB2B, saldosIniciales = []) {
    // Metadata only: the initial amount is already posted in cuenta_corriente.
    const cortes = new Map(saldosIniciales.map(s => [`${s.tienda_codigo}:${s.id}`, s.fecha_corte]));
    const cuentas = new Map(clientesB2B.map(c => [c.cuenta_id, c.cliente_codigo]));
    const tipos = new Map(origenes.map(o => [o.codigo, o.tipo]));
    const movimientos = [
      ...corriente.filter(m => tipos.get(m.tienda_codigo) === 'propia').map(m => ({
        ...m, id:`tienda:${m.id}`, fecha:fechaBogota(m.created_at), responsable:m.usuario,
        fecha_corte:esCargaInicial(m) ? cortes.get(`${m.tienda_codigo}:${m.referencia_id}`) || null : null,
      })),
      ...libroB2B.filter(m => cuentas.has(m.cuenta_id)).map(m => ({
        ...m, id:`cliente:${m.id}`, tienda_codigo:cuentas.get(m.cuenta_id),
        tipo:m.efecto === 'debito' ? 'cargo' : 'abono', fecha:m.fecha_efectiva,
        fecha_corte:m.efecto === 'debito' && m.referencia_tipo === 'saldo_inicial' ? m.metadatos?.fecha_corte || m.fecha_efectiva : null,
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
        const cargasIniciales = ms.filter(esCargaInicial);
        const inicialArrastrado = anteriores[c.cliente_codigo]?.saldo || 0;
        const inicialCargado = cargasIniciales.reduce((s,m) => s + Number(m.monto),0);
        return {...c, inicial:inicialArrastrado + inicialCargado, inicialArrastrado, inicialCargado, cargasIniciales,
          cargos:ms.filter(m => m.tipo === 'cargo' && !esCargaInicial(m) && !esAjusteAuditoria(m)).reduce((s,m) => s + Number(m.monto),0),
          abonos:ms.filter(m => m.tipo === 'abono' && !esAjusteAuditoria(m)).reduce((s,m) => s + Number(m.monto),0),
          ajustes:ms.filter(esAjusteAuditoria).reduce((s,m) => s + (m.tipo === 'cargo' ? 1 : -1)*Number(m.monto),0),
          saldo:cierre[c.cliente_codigo]?.saldo || 0, movimientos:ms.length};
      }).sort((a,b) => a.cliente.localeCompare(b.cliente,'es'));
  }
  global.CreditekCarteraB2BDomain = Object.freeze({leerTodas, reunir, resumir, esCargaInicial, esAjusteAuditoria});
})(typeof window !== 'undefined' ? window : globalThis);
