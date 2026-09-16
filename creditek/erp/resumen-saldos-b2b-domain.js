(function (global) {
  'use strict';
  const numero = valor => {
    if (valor == null || valor === '' || !Number.isFinite(Number(valor))) throw new Error('Hay un saldo sin valor válido. Revisa la fuente de cartera.');
    return Number(valor);
  };
  const sumar = filas => filas.reduce((s, f) => s + numero(f.saldo), 0);
  const ordenar = filas => filas.sort((a, b) => b.saldo - a.saldo || a.nombre.localeCompare(b.nombre, 'es'));
  const unicos = (filas, campo) => {
    const ids = new Set();
    for (const f of filas) {
      if (f[campo] == null || ids.has(f[campo])) throw new Error('La consulta contiene identificadores ausentes o repetidos. Actualiza para reintentar.');
      ids.add(f[campo]);
    }
    return filas;
  };

  function preparar({ origenes, corriente, clientes, proveedores, facturas }, hoy) {
    unicos(origenes, 'codigo'); unicos(corriente, 'id'); unicos(clientes, 'cliente_codigo');
    unicos(proveedores, 'id'); unicos(facturas, 'id');
    corriente.forEach(m => {
      numero(m.monto);
      if (!['cargo', 'abono'].includes(m.tipo)) throw new Error('Movimiento de cartera no reconocido.');
    });
    const cuentas = global.CreditekCuentaCorrienteDomain.calcularResumenPorTienda(corriente);
    const tiendas = origenes.filter(o => o.tipo === 'propia' && (o.activo || cuentas[o.codigo])).map(o => ({
      nombre:o.nombre, codigo:o.codigo, canal:'Tienda Retail', activo:o.activo,
      saldo:cuentas[o.codigo]?.saldo || 0,
    }));
    const cartera = ordenar([...tiendas, ...clientes.map(c => ({nombre:c.cliente, codigo:c.cliente_codigo, canal:'Cliente B2B', activo:true, saldo:numero(c.saldo)}))]);
    const ids = new Set(proveedores.map(p => p.id));
    facturas.forEach(f => {
      if (!ids.has(f.proveedor_id)) throw new Error('Hay facturas sin proveedor visible. No se puede presentar un total completo.');
      if (numero(f.saldo) < 0) throw new Error('Hay facturas con saldo negativo que requieren revisión.');
    });
    const deuda = ordenar(proveedores.map(p => {
      const pendientes = facturas.filter(f => f.proveedor_id === p.id && numero(f.saldo) > 0);
      return {nombre:p.nombre, id:p.id, activo:p.activo, saldo:sumar(pendientes), facturas:pendientes.length,
        vencido:sumar(pendientes.filter(f => f.fecha_vencimiento && f.fecha_vencimiento < hoy)),
        proximo:pendientes.map(f => f.fecha_vencimiento).filter(Boolean).sort()[0] || null};
    }).filter(p => p.activo || p.saldo !== 0));
    const porCobrar = sumar(cartera), porPagar = sumar(deuda);
    return {cartera, proveedores:deuda, porCobrar, porPagar, diferencia:porCobrar - porPagar,
      aFavorClientes:-sumar(cartera.filter(c => c.saldo < 0))};
  }

  async function cargar(sb, hoy) {
    const leer = global.CreditekProveedoresDomain.leerTodas;
    const [origenes, clientes, proveedores, facturas] = await Promise.all([
      leer(() => sb.from('origenes').select('codigo,nombre,tipo,activo').eq('tipo','propia').order('codigo')),
      leer(() => sb.from('v_cartera_clientes_b2b').select('cliente_codigo,cliente,saldo').order('cliente_codigo')),
      leer(() => sb.from('proveedores').select('id,nombre,activo').order('id')),
      leer(() => sb.from('facturas_proveedor').select('id,proveedor_id,saldo,fecha_vencimiento').order('id')),
    ]);
    const codigos = origenes.map(o => o.codigo);
    const corriente = codigos.length ? await leer(() => sb.from('cuenta_corriente')
      .select('id,tienda_codigo,tipo,monto').in('tienda_codigo',codigos).order('id')) : [];
    return preparar({origenes,corriente,clientes,proveedores,facturas},hoy);
  }
  const filtrar = (filas, texto) => {
    const normalizar = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    return filas.filter(f => normalizar(f.nombre).includes(normalizar(texto)));
  };
  global.CreditekResumenSaldosB2B = Object.freeze({preparar,cargar,filtrar,sumar});
})(typeof window !== 'undefined' ? window : globalThis);
