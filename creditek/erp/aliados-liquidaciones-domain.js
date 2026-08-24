(function (global, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  global.CreditekAliadosLiquidaciones = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ESTADOS = ['importada','validada','con_novedades','calculada','revisada','aprobada','programada','pagada','conciliada','cerrada','anulada'];
  const TRANSICIONES = {
    importada: ['validada','con_novedades','anulada'],
    validada: ['calculada','con_novedades','anulada'],
    con_novedades: ['validada','anulada'],
    calculada: ['revisada','con_novedades','anulada'],
    revisada: ['aprobada','con_novedades','anulada'],
    aprobada: ['programada','anulada'],
    programada: ['pagada','anulada'],
    pagada: ['conciliada'],
    conciliada: ['cerrada'],
    cerrada: [], anulada: [],
  };

  function texto(value) { return String(value ?? '').trim(); }
  function clave(value) {
    return texto(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function dinero(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const clean = texto(value).replace(/\((.*)\)/, '-$1').replace(/[^0-9,.-]/g, '');
    if (!clean) return 0;
    const normalized = clean.includes('.') && clean.includes(',')
      ? clean.replace(/,/g, '')
      : clean.replace(/,/g, '');
    const result = Number(normalized);
    return Number.isFinite(result) ? result : 0;
  }
  function filaObjeto(headers, row) {
    const out = {}, original = {};
    headers.forEach((header, index) => { out[clave(header)] = row[index] ?? null; original[texto(header)] = row[index] ?? null; });
    out.__original = original;
    return out;
  }
  function filasObjetos(rows) {
    if (!Array.isArray(rows) || rows.length < 2) return [];
    if (!Array.isArray(rows[0])) return rows;
    return rows.slice(1).filter(row => row.some(value => texto(value) !== '')).map(row => filaObjeto(rows[0], row));
  }
  function valor(row, ...names) {
    for (const name of names) {
      const found = row[clave(name)];
      if (found !== undefined && found !== null && texto(found) !== '') return found;
    }
    return null;
  }
  function fecha(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
    const raw = texto(value);
    const dmy = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
    if (dmy) {
      const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
      return new Date(`${year}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}T12:00:00-05:00`).toISOString();
    }
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  function clasificarEstablecimiento(nombre, establecimientos) {
    const buscado = clave(nombre);
    let matches = (establecimientos || []).filter(item => {
      const candidates = [item.nombre, item.codigo, ...(item.aliases || [])].map(clave);
      return candidates.includes(buscado);
    });
    if (matches.length === 0 && buscado) {
      matches = (establecimientos || []).filter(item => {
        const candidates = [item.nombre, item.codigo, ...(item.aliases || [])].map(clave).filter(Boolean);
        return candidates.some(candidate => candidate.length >= 4 && (buscado.includes(candidate) || candidate.includes(buscado)));
      });
    }
    if (matches.length !== 1) return { tipo: 'no_reconocido', establecimiento: null, incidencia: matches.length ? 'comercio_ambiguo' : 'comercio_no_reconocido' };
    const establecimiento = matches[0];
    return { tipo: establecimiento.tipo === 'aliado' ? 'aliado' : 'propia', establecimiento, incidencia: null };
  }
  function importarPayjoy(rows, establecimientos) {
    const originales = filasObjetos(rows);
    const grupos = new Map();
    originales.forEach((row, index) => {
      const key = [valor(row,'device'),valor(row,'imei'),valor(row,'national id'),valor(row,'merchant name'),valor(row,'transaction time')].map(clave).join('|');
      if (!grupos.has(key)) grupos.set(key, []);
      grupos.get(key).push({ row, index: index + 2 });
    });
    const operaciones = [];
    const incidencias = [];
    for (const [sourceKey, movimientos] of grupos) {
      const amounts = movimientos.filter(item => clave(valor(item.row,'transaction type')) === 'purchaseamount');
      const pockets = movimientos.filter(item => clave(valor(item.row,'transaction type')) === 'purchaseoutofpocket');
      const base = (amounts[0] || pockets[0])?.row || {};
      const clasificacion = clasificarEstablecimiento(valor(base,'merchant name'), establecimientos);
      const problemas = [];
      if (amounts.length !== 1 || pockets.length !== 1) problemas.push('movimiento_payjoy_incompleto');
      if (amounts.length > 1 || pockets.length > 1) problemas.push('operacion_duplicada');
      if (!texto(valor(base,'imei'))) problemas.push('imei_vacio');
      if (!texto(valor(base,'national id'))) problemas.push('documento_vacio');
      if (clasificacion.incidencia) problemas.push(clasificacion.incidencia);
      const operacion = {
        plataforma: 'payjoy', sourceKey: `payjoy|${texto(valor(base,'device'))}`, sourceMatchKey: sourceKey, externalId: texto(valor(base,'device')),
        fecha: fecha(valor(base,'transaction time')), establecimientoNombre: texto(valor(base,'merchant name')),
        establecimiento: clasificacion.establecimiento, tipoEstablecimiento: clasificacion.tipo,
        ejecutivo: clasificacion.establecimiento?.ejecutivo || null,
        imei: texto(valor(base,'imei')), clienteDocumento: texto(valor(base,'national id')),
        clienteNombre: null, referencia: texto(valor(base,'device family')), modelo: texto(valor(base,'device model')),
        vendedorExternoId: texto(valor(base,'sales clerk id')), vendedorNombre: texto(valor(base,'sales clerk name')),
        plazo: Number(valor(base,'months') || 0), productoFinanciero: texto(valor(base,'finance product')),
        montoBase: dinero(valor(amounts[0]?.row || {},'owed by PayJoy')),
        inicial: dinero(valor(pockets[0]?.row || {},'owed by CREDITEK S.A.S.')),
        reconocida: amounts.length === 1 && pockets.length === 1,
        movimientos: movimientos.map(item => ({ fila: item.index, tipo: texto(valor(item.row,'transaction type')), original: item.row })),
        incidencias: [...new Set(problemas)],
      };
      operacion.montoCredito = operacion.montoBase;
      operacion.valorCredito = operacion.montoCredito;
      operacion.inicialPlataforma = operacion.inicial;
      operacion.valorComercial = operacion.valorCredito + operacion.inicialPlataforma;
      operaciones.push(operacion);
      operacion.incidencias.forEach(tipo => incidencias.push({ tipo, sourceKey }));
    }
    return { plataforma: 'payjoy', filasOriginales: originales, operaciones, incidencias };
  }
  function importarAlo(rows, establecimientos) {
    const originales = filasObjetos(rows);
    const vistos = new Set();
    const incidencias = [];
    const operaciones = originales.map((row, index) => {
      const externalId = texto(valor(row,'Contrato'));
      const clasificacion = clasificarEstablecimiento(valor(row,'Tienda'), establecimientos);
      const problemas = [];
      if (!externalId || vistos.has(externalId)) problemas.push('operacion_duplicada');
      vistos.add(externalId);
      if (!texto(valor(row,'Imei'))) problemas.push('imei_vacio');
      if (!texto(valor(row,'CC'))) problemas.push('documento_vacio');
      if (clasificacion.incidencia) problemas.push(clasificacion.incidencia);
      if (clave(valor(row,'Estado del Contrato')) !== 'activo') problemas.push('operacion_no_reconocida');
      const montoBase = dinero(valor(row,'Monto Total'));
      if (montoBase < 0) problemas.push('valor_negativo_imposible');
      const sourceKey = `alo|${externalId}`;
      const operacion = {
        plataforma: 'alo', sourceKey, externalId, fecha: fecha(valor(row,'Fecha Firma')),
        establecimientoNombre: texto(valor(row,'Tienda')), establecimiento: clasificacion.establecimiento,
        tipoEstablecimiento: clasificacion.tipo, ejecutivo: clasificacion.establecimiento?.ejecutivo || null,
        imei: texto(valor(row,'Imei')), clienteDocumento: texto(valor(row,'CC')),
        clienteNombre: texto(valor(row,'Nombre Completo')), clienteCelular: texto(valor(row,'Numero Celular')),
        clienteEmail: texto(valor(row,'Email')), referencia: texto(valor(row,'Referencia')),
        vendedorNombre: texto(valor(row,'Vendedor')), plazo: texto(valor(row,'Plazo del Prestamo')),
        montoCredito: dinero(valor(row,'Monto Credito')), montoTotal: montoBase, montoBase,
        inicial: dinero(valor(row,'Valor Cuota Inicial')),
        accesoriosCantidad: Number(valor(row,'Cantidad de Accesorios') || 0),
        accesorios: dinero(valor(row,'Suma Precios Accesorios')),
        reconocida: clave(valor(row,'Estado del Contrato')) === 'activo',
        movimientos: [{ fila: index + 2, tipo: 'contrato', original: row }], incidencias: [...new Set(problemas)],
      };
      operacion.valorCredito = operacion.montoCredito;
      operacion.inicialPlataforma = operacion.inicial;
      operacion.valorComercial = operacion.valorCredito + operacion.inicialPlataforma;
      operacion.incidencias.forEach(tipo => incidencias.push({ tipo, sourceKey }));
      return operacion;
    });
    return { plataforma: 'alo', filasOriginales: originales, operaciones, incidencias };
  }
  function resolverPolitica(policies, operationDate, plataforma, tipoEstablecimiento) {
    const day = String(operationDate || '').slice(0, 10);
    const matches = (policies || []).filter(policy => policy.estado === 'aprobada' && policy.plataforma === plataforma && policy.tipoEstablecimiento === tipoEstablecimiento && policy.vigenteDesde <= day && (!policy.vigenteHasta || policy.vigenteHasta >= day));
    if (matches.length !== 1) throw new Error(matches.length ? 'politica_ambigua' : 'politica_ausente');
    return matches[0];
  }
  function normalizarOperacion(operation) {
    const valorCredito = dinero(operation.valorCredito ?? operation.montoCredito ?? operation.montoBase);
    const inicialPlataforma = dinero(operation.inicialPlataforma ?? operation.inicial);
    return {
      ...operation,
      valorCredito,
      inicialPlataforma,
      valorComercial: valorCredito + inicialPlataforma,
      accesoriosCantidad: Number(operation.accesoriosCantidad || 0),
      accesorios: dinero(operation.accesorios),
    };
  }
  function calcularOperaciones(operaciones, policies, bonos = []) {
    return (operaciones || []).map(rawOperation => {
      const operation = normalizarOperacion(rawOperation);
      if (!['propia','aliado'].includes(operation.tipoEstablecimiento) || !operation.reconocida || operation.incidencias?.length) {
        return { operacion:operation, bloqueada:true, incidencias:operation.incidencias || ['operacion_no_reconocida'] };
      }
      let policy;
      try { policy = resolverPolitica(policies, operation.fecha, operation.plataforma, operation.tipoEstablecimiento); }
      catch (error) { return { operacion:operation, bloqueada:true, incidencias:[error.message] }; }
      const porcentaje = Number(policy.porcentaje);
      const pagamos = Math.round(operation.valorComercial * porcentaje * 100) / 100;
      const pagoNeto = Math.round((pagamos - operation.inicialPlataforma) * 100) / 100;
      const bonuses = bonos.filter(bonus => bonus.operationKey === operation.sourceKey && bonus.estado !== 'anulado');
      const totalBonos = bonuses.reduce((sum, bonus) => sum + dinero(bonus.valor), 0);
      const utilidadCreditek = Math.round((operation.valorComercial - pagoNeto - totalBonos) * 100) / 100;
      const incidencias = [];
      if (pagoNeto < 0 || utilidadCreditek < 0) incidencias.push('valor_negativo_imposible');
      if (operation.tipoEstablecimiento === 'aliado' && !operation.ejecutivo) incidencias.push('aliado_sin_ejecutivo');
      return {
        operacion:operation, policySnapshot:JSON.parse(JSON.stringify(policy)), porcentaje,
        valorCredito:operation.valorCredito, inicialPlataforma:operation.inicialPlataforma,
        valorComercial:operation.valorComercial, pagamos, pagoNeto, bonuses, totalBonos,
        utilidadCreditek, bloqueada:incidencias.length > 0, incidencias,
      };
    });
  }
  function resumirUnificado(calculos) {
    const empty = tipo => ({ tipo,operaciones:0,valorComercial:0,pagamos:0,pagoNeto:0,bonos:0,utilidadCreditek:0,totalPagar:0,novedades:0 });
    const retail = empty('retail');
    const aliados = empty('aliados');
    for (const item of calculos || []) {
      const target = item.operacion?.tipoEstablecimiento === 'propia' ? retail : aliados;
      if (item.bloqueada) { target.novedades += 1; continue; }
      target.operaciones += 1;
      target.valorComercial += item.valorComercial;
      target.pagamos += item.pagamos;
      target.pagoNeto += item.pagoNeto;
      target.bonos += item.totalBonos;
      target.utilidadCreditek += item.utilidadCreditek;
      target.totalPagar += item.pagoNeto + item.totalBonos;
    }
    const general = empty('general');
    for (const key of ['operaciones','valorComercial','pagamos','pagoNeto','bonos','utilidadCreditek','totalPagar','novedades']) general[key] = retail[key] + aliados[key];
    return { general, retail, aliados };
  }
  function calcularAliados(operaciones, policies, bonos = []) {
    return operaciones.map(operation => {
      if (operation.tipoEstablecimiento !== 'aliado') return { operacion: operation, omitida: true };
      if (!operation.reconocida || operation.incidencias.length) return { operacion: operation, bloqueada: true, incidencias: operation.incidencias };
      let policy;
      try { policy = resolverPolitica(policies, operation.fecha, operation.plataforma, 'aliado'); }
      catch (error) { return { operacion: operation, bloqueada: true, incidencias: [error.message] }; }
      const porcentaje = Number(policy.porcentaje);
      const baseCampo = policy.baseCampo || policy.base_field || 'monto_base';
      const bases = { monto_base: operation.montoBase, monto_credito: operation.montoCredito };
      const baseLiquidable = Number(bases[baseCampo]);
      if (!Number.isFinite(baseLiquidable) || baseLiquidable < 0) return { operacion: operation, bloqueada: true, incidencias: ['base_liquidable_invalida'] };
      const pagamos = Math.round(baseLiquidable * porcentaje * 100) / 100;
      const pagoAliado = Math.round((pagamos - operation.inicial) * 100) / 100;
      const bonosOperacion = bonos.filter(bonus => bonus.operationKey === operation.sourceKey && bonus.estado !== 'anulado');
      const totalBonos = bonosOperacion.reduce((sum, bonus) => sum + dinero(bonus.valor), 0);
      const utilidadCreditek = Math.round((baseLiquidable - pagoAliado - totalBonos) * 100) / 100;
      const incidencias = [];
      if (pagoAliado < 0 || utilidadCreditek < 0) incidencias.push('valor_negativo_imposible');
      if (!operation.ejecutivo) incidencias.push('aliado_sin_ejecutivo');
      return { operacion: operation, policySnapshot: JSON.parse(JSON.stringify(policy)), baseCampo, baseLiquidable, pagamos, pagoAliado, bonos: bonosOperacion, totalBonos, utilidadCreditek, bloqueada: incidencias.length > 0, incidencias };
    });
  }
  function resumir(calculos) {
    return calculos.filter(item => !item.omitida && !item.bloqueada).reduce((out, item) => {
      out.operaciones += 1; out.montoBase += item.baseLiquidable; out.inicial += item.operacion.inicial;
      out.pagamos += item.pagamos; out.pagoAliados += item.pagoAliado; out.bonos += item.totalBonos;
      out.utilidadCreditek += item.utilidadCreditek; out.totalPagar += item.pagoAliado + item.totalBonos;
      return out;
    }, { operaciones:0,montoBase:0,inicial:0,pagamos:0,pagoAliados:0,bonos:0,utilidadCreditek:0,totalPagar:0 });
  }
  function generarPagos(calculos) {
    const pagos = new Map();
    function agregar(key, data, valor) {
      if (!key || valor <= 0) return;
      const current = pagos.get(key) || { ...data, valor: 0, items: [] };
      current.valor += valor; current.items.push(data.operationKey); pagos.set(key, current);
    }
    calculos.filter(item => !item.bloqueada && !item.omitida).forEach(item => {
      const ally = item.operacion.establecimiento;
      agregar(`aliado:${ally?.beneficiarioId || ally?.id}`, { tipoBeneficiario:'aliado', beneficiarioId:ally?.beneficiarioId || null, aliadoId:ally?.id || null, operationKey:item.operacion.sourceKey }, item.pagoAliado);
      item.bonos.forEach(bonus => agregar(`${bonus.tipoBeneficiario}:${bonus.beneficiarioId}`, { tipoBeneficiario:bonus.tipoBeneficiario, beneficiarioId:bonus.beneficiarioId, operationKey:item.operacion.sourceKey }, dinero(bonus.valor)));
    });
    return [...pagos.values()];
  }
  const ORDEN_PAGO = ['pendiente','programado','pagado','conciliado','rechazado','anulado'];
  function estadoPagoActual(actual, siguiente) {
    return ORDEN_PAGO.indexOf(siguiente) > ORDEN_PAGO.indexOf(actual) ? siguiente : actual;
  }
  function agruparPorAliado(detalles) {
    const grupos = new Map();
    (detalles || []).forEach(item => {
      const key = [item.aliadoId,item.sede,item.plataforma].join('|');
      const grupo = grupos.get(key) || { aliadoId:item.aliadoId,aliado:item.aliado,sede:item.sede,plataforma:item.plataforma,operaciones:0,montoLiquidado:0,inicial:0,pagoAliado:0,bonos:0,novedades:0,estadoPago:'pendiente',_operaciones:new Set() };
      grupo._operaciones.add(item.operacionId);
      grupo.montoLiquidado += dinero(item.montoLiquidado);
      grupo.inicial += dinero(item.inicial);
      grupo.pagoAliado += dinero(item.pagoAliado);
      grupo.bonos += dinero(item.bonosAliado);
      grupo.novedades += Number(item.novedades || 0);
      grupo.estadoPago = estadoPagoActual(grupo.estadoPago,item.estadoPago || 'pendiente');
      grupos.set(key,grupo);
    });
    return [...grupos.values()].map(({ _operaciones, ...grupo }) => ({ ...grupo, operaciones:_operaciones.size }));
  }
  function agruparPorEjecutivo(detalles) {
    const grupos = new Map();
    (detalles || []).forEach(item => {
      const key = item.ejecutivoId;
      const grupo = grupos.get(key) || { ejecutivoId:key,ejecutivo:item.ejecutivo,aliados:0,operaciones:0,ventas:0,bonos:0,totalRecibir:0,estadoPago:'pendiente',novedades:0,_aliados:new Set(),_operaciones:new Set() };
      grupo._aliados.add(item.aliadoId);
      grupo._operaciones.add(item.operacionId);
      grupo.ventas += dinero(item.venta);
      grupo.bonos += dinero(item.bonosEjecutivo);
      grupo.totalRecibir += dinero(item.bonosEjecutivo);
      grupo.novedades += Number(item.novedades || 0);
      grupo.estadoPago = estadoPagoActual(grupo.estadoPago,item.estadoPago || 'pendiente');
      grupos.set(key,grupo);
    });
    return [...grupos.values()].map(({ _aliados, _operaciones, ...grupo }) => ({ ...grupo, aliados:_aliados.size, operaciones:_operaciones.size }));
  }
  function puedeTransicionar(actual, siguiente) { return !!TRANSICIONES[actual]?.includes(siguiente); }
  function resolverAccesoKora({ session, permitido, operador }) {
    if (!session) return 'redirect';
    return permitido === true && operador ? 'allowed' : 'denied';
  }
  function evento(tipo, liquidacionId, extras = {}) {
    if (!/^(liquidation|payment)\./.test(tipo)) throw new Error('evento_invalido');
    return { type: tipo, aggregate_type: tipo.startsWith('payment.') ? 'payment' : 'liquidation', aggregate_id: liquidacionId, occurred_at: new Date().toISOString(), data: { liquidation_id: liquidacionId, ...extras } };
  }
  return { ESTADOS, TRANSICIONES, clave, dinero, fecha, importarPayjoy, importarAlo, clasificarEstablecimiento, resolverPolitica, normalizarOperacion, calcularOperaciones, resumirUnificado, calcularAliados, resumir, generarPagos, agruparPorAliado, agruparPorEjecutivo, puedeTransicionar, resolverAccesoKora, evento };
});
