(function (global) {
  'use strict';
  const signos = { abono:1, otro_ingreso:1, ajuste_auditoria_entrada:1,
    transferencia_central:-1, pago_directo_central:-1, retiro:-1, consignacion:-1,
    devolucion_efectivo:-1, ajuste_auditoria_salida:-1 };
  const etiquetas = { abono:'Abono en efectivo', otro_ingreso:'Otro ingreso',
    ajuste_auditoria_entrada:'Ajuste de Gerencia · aumento', ajuste_auditoria_salida:'Ajuste de Gerencia · disminución',
    transferencia_central:'Transferencia a central', pago_directo_central:'Pago directo a central',
    retiro:'Retiro', consignacion:'Consignación', devolucion_efectivo:'Devolución en efectivo' };
  function centavos(valor) {
    if (valor === null || valor === undefined || valor === '' || !Number.isFinite(Number(valor))) throw new Error('Importe no disponible en el libro de caja.');
    return Math.round(Number(valor) * 100);
  }
  function monto(valor) {
    const n = centavos(valor);
    if (n < 0) throw new Error('Movimiento con importe negativo no esperado. Requiere revisión.');
    return n / 100;
  }
  function construir({ cuadre, ventas = [], gastos = [], movimientos = [] }) {
    if (!cuadre?.ok) throw new Error('No se pudo comprobar el saldo oficial de caja.');
    const filas = [];
    function agregar(origen, id, fecha, registro, tipo, concepto, usuario, autorizado, valor, soporte, estado) {
      const importe = centavos(valor);
      if (!importe) return;
      filas.push({ clave:`${origen}:${id}`, origen, id, fecha, registro, tipo, concepto:concepto || '',
        usuario, autorizado, importe:importe / 100, soporte:soporte || null, estado });
    }
    for (const v of ventas) {
      if (v.anulada) continue;
      if (v.tipo === 'contado') {
        agregar('Venta',v.id,v.fecha,v.created_at,'Venta de contado',`Venta #${v.consecutivo}`,v.vendedor,null,v.total,null,'Registrada');
      } else if (v.tipo === 'credito') {
        for (const c of (Array.isArray(v.creditos) ? v.creditos : v.creditos ? [v.creditos] : [])) {
          const addi = String(c.financiera || '').toLowerCase() === 'addi';
          if (addi && c.medio_pago_complementario && c.medio_pago_complementario !== 'efectivo') continue;
          agregar('Crédito',c.id || v.id,v.fecha,v.created_at,addi ? 'Otro pago en efectivo · Addi' : 'Inicial recibida en efectivo',
            `Venta #${v.consecutivo} · ${c.financiera || 'Crédito'}`,v.vendedor,null,c.cuota_inicial ?? 0,null,'Registrada');
        }
      }
    }
    for (const g of gastos) {
      const concepto = Array.isArray(g.conceptos_gasto) ? g.conceptos_gasto[0] : g.conceptos_gasto;
      if (g.estado !== 'aprobado' && !(g.estado === 'registrado' && concepto?.preautorizado)) continue;
      agregar('Gasto',g.id,g.fecha,g.created_at,concepto?.nombre || 'Gasto',g.descripcion,g.registrado_por,g.aprobado_por,
        -monto(g.monto),null,g.estado === 'aprobado' ? 'Aprobado' : 'Preautorizado');
    }
    for (const m of movimientos) {
      if (!Object.hasOwn(signos,m.tipo)) throw new Error(`Tipo de movimiento no contemplado: ${m.tipo}. Requiere revisión.`);
      agregar('Movimiento de caja',m.id,m.fecha,m.created_at,etiquetas[m.tipo],m.observacion,m.creado_por,m.autorizado_por,
        signos[m.tipo] * monto(m.monto),m.soporte_path,'Aplicado');
    }
    filas.sort((a,b) => String(a.registro || '').localeCompare(String(b.registro || '')) || a.clave.localeCompare(b.clave));
    let saldo = centavos(cuadre.apertura), entradas = 0, salidas = 0;
    const claves = new Set();
    for (const f of filas) {
      if (claves.has(f.clave)) throw new Error('Hay registros duplicados en la consulta. Actualiza el libro.');
      claves.add(f.clave);
      const importe = centavos(f.importe);
      if (importe > 0) entradas += importe; else salidas -= importe;
      f.saldoAnterior = saldo / 100;
      saldo += importe;
      f.saldo = saldo / 100;
    }
    const esperado = centavos(cuadre.esperado);
    return { fecha:cuadre.fecha, apertura:centavos(cuadre.apertura) / 100,
      aperturaAnterior:centavos(cuadre.apertura_cierre_anterior) / 100,
      arrastre:centavos(cuadre.ajuste_arrastre_movimientos) / 100,
      entradas:entradas / 100, salidas:salidas / 100, saldo:saldo / 100,
      esperado:esperado / 100, diferencia:(saldo - esperado) / 100, cuadra:saldo === esperado,
      cierre:cuadre.caja, filas,
      pendientes:gastos.filter(g => g.estado === 'registrado' && !(Array.isArray(g.conceptos_gasto) ? g.conceptos_gasto[0] : g.conceptos_gasto)?.preautorizado).length };
  }
  global.CreditekCajaLibro = Object.freeze({ construir });
})(typeof window !== 'undefined' ? window : globalThis);
