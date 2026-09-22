(function (root) {
  'use strict';
  const number = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
  const round = value => Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * 100) / 100;
  const moneyFormat = '#,##0.00;[Red](#,##0.00);"—"';
  const names = { payjoy: 'PayJoy', alo: 'ALO Credit', krediya: 'Krediya' };
  const columns = [
    ['Fecha venta', 13, 'dd/mm/yyyy'], ['Comercio', 27], ['IMEI', 20, '@'], ['Referencia', 30], ['Cliente', 28],
    ['Incluida', 12], ['Importe archivo / crédito', 19], ['Inicial en tienda', 18], ['Neto esperado plataforma', 20],
    ['PVP liquidado', 18], ['PAGAMOS pactado', 19], ['Giro calculado', 18], ['Giro guardado KORA', 19],
    ['Bonos', 17], ['Tasa gasto financiero', 18, '0.00%'], ['Gasto financiero', 18],
    ['Utilidad antes de provisión', 20], ['Tasa provisión', 16, '0.00%'], ['Provisión', 18],
    ['Utilidad neta calculada', 20], ['Utilidad guardada KORA', 20], ['Diferencia giro', 18], ['Diferencia utilidad', 19],
    ['Validación', 27], ['Estado del cálculo', 32], ['ID operación', 39],
    ['Lote', 39, '@'], ['Corte', 13, 'dd/mm/yyyy'], ['Vendedor del comercio', 28], ['Código del crédito', 22, '@'],
    ['Ejecutivo Creditek / tipo', 28]
  ];
  function build(batch, operations) {
    if (!names[batch.plataforma]) throw new Error('Plataforma no soportada para el informe formulado.');
    const ids = new Set();
    const rows = operations.map((o, index) => {
      if (!o.id || ids.has(o.id)) throw new Error('Hay operaciones sin identificador o repetidas; no se generó un informe parcial.');
      ids.add(o.id);
      const calculations = Array.isArray(o.liquidation_calculations) ? o.liquidation_calculations : o.liquidation_calculations ? [o.liquidation_calculations] : [];
      if (calculations.length > 1) throw new Error('La operación tiene varios cálculos. Revisa el lote antes de exportar.');
      const c = calculations[0] || {}, p = c.policy_snapshot || {}, e = c.explanation || {};
      const k = batch.plataforma === 'krediya', pj = batch.plataforma === 'payjoy';
      const included = o.reconocida === true;
      const pending = !calculations.length || p.bono_ejecutivo_pendiente || (o.tipo_establecimiento === 'aliado' && !o.ejecutivo_id);
      const row = index + 6;
      const source = number(o.monto_credito ?? o.monto_base), initial = number(o.inicial);
      const price = number(o.valor_comercial ?? e.valor_comercial ?? e.base_liquidable);
      const paid = number(o.pagamos ?? c.pagamos), giro = number(o.pago_neto_beneficiario ?? o.pago_neto_tienda ?? c.pago_aliado);
      const bonus = pending ? null : number(o.bonos_aplicados ?? c.total_bonos);
      const expenseRate = k ? number(p.tasa_gasto_financiero) : 0;
      const provisionRate = k ? number(p.provision_porcentaje) : 0;
      const savedUtility = pending ? null : number(o.utilidad_creditek ?? c.utilidad_creditek);
      // Every derived amount references worksheet inputs. Missing is never treated as zero.
      const formula = (expression, refs, result) => ({
        formula: `IF(F${row}<>"Sí","",IF(COUNT(${refs.map(col => col + row).join(',')})<>${refs.length},"Faltan datos",${expression}))`,
        result: !included ? '' : result === null ? 'Faltan datos' : result
      });
      const calc = (values, fn) => values.every(v => v !== null) ? round(fn(...values)) : null;
      const expected = calc(pj ? [source, initial] : [source], (s, i = 0) => s - i);
      const net = calc([paid, initial], (a, b) => a - b);
      const expense = calc([source, expenseRate], (a, b) => a * b);
      const gross = k ? calc([price, paid, bonus, expense], (a,b,c,d) => a-b-c-d)
        : calc([expected, net, bonus], (a,b,c) => a-b-c);
      const provision = calc([gross, provisionRate], (a,b) => a*b);
      const utility = calc([gross, provision], (a,b) => a-b);
      const deltaGiro = calc([net, giro], (a,b) => a-b), deltaUtility = calc([utility, savedUtility], (a,b) => a-b);
      const status = !included ? 'No incluida' : pending ? 'Cálculo incompleto / bono pendiente' : 'Cálculo guardado';
      const validation = !included ? 'No incluida' : deltaGiro === null || deltaUtility === null ? 'Faltan datos' : Math.abs(deltaGiro) > .01 || Math.abs(deltaUtility) > .01 ? 'REVISAR DIFERENCIA' : 'Coincide';
      return [
        o.operation_at ? new Date(String(o.operation_at).slice(0,10) + 'T00:00:00Z') : null,
        o.establishment_name || '', String(o.imei || ''), o.referencia || o.modelo || '', o.cliente_nombre || '', included ? 'Sí' : 'No',
        source, initial,
        formula(pj ? `ROUND(G${row}-H${row},2)` : `G${row}`, pj ? ['G','H'] : ['G'], expected),
        price, paid,
        formula(`ROUND(K${row}-H${row},2)`, ['K','H'], net), giro, bonus, expenseRate,
        formula(`ROUND(G${row}*O${row},2)`, ['G','O'], expense),
        formula(k ? `ROUND(J${row}-K${row}-N${row}-P${row},2)` : `ROUND(I${row}-L${row}-N${row},2)`, k ? ['J','K','N','P'] : ['I','L','N'], gross),
        provisionRate,
        formula(`ROUND(Q${row}*R${row},2)`, ['Q','R'], provision),
        formula(`ROUND(Q${row}-S${row},2)`, ['Q','S'], utility), savedUtility,
        formula(`ROUND(L${row}-M${row},2)`, ['L','M'], deltaGiro),
        formula(`ROUND(T${row}-U${row},2)`, ['T','U'], deltaUtility),
        { formula: `IF(F${row}<>"Sí","No incluida",IF(COUNT(V${row}:W${row})<>2,"Faltan datos",IF(OR(ABS(V${row})>0.01,ABS(W${row})>0.01),"REVISAR DIFERENCIA","Coincide")))`, result: validation },
        status, String(o.id), String(o.liquidation_id || batch.id || ''),
        o.liquidation_cut ? new Date(String(o.liquidation_cut).slice(0,10) + 'T00:00:00Z') : batch.fecha_corte ? new Date(String(batch.fecha_corte).slice(0,10) + 'T00:00:00Z') : null,
        o.normalized_data?.vendedorNombre || '', String(o.external_id || o.normalized_data?.externalId || ''),
        o.tipo_establecimiento === 'propia' ? 'Tienda propia (Retail)' : o.ejecutivos?.nombre || 'Sin ejecutivo asignado'
      ];
    });
    const batchIds = [...new Set(operations.map(o => o.liquidation_id || batch.id).filter(Boolean))];
    const cuts = [...new Set(operations.map(o => o.liquidation_cut || batch.fecha_corte).filter(Boolean))].sort();
    return {
      heading: batch.multi ? names[batch.plataforma] : `${names[batch.plataforma]} ${batch.fecha_corte || ''}`, structured: true,
      headers: columns.map(c => c[0]), columns, rows,
      note: batch.multi
        ? `${batchIds.length} lote(s) liquidados${cuts.length ? ` · cortes ${cuts.join(', ')}` : ''}. COP. Cada fila conserva lote, vendedor y código del crédito. Neto esperado no acredita recepción bancaria. Azul: datos guardados; negro: fórmulas. No incluidas fuera de totales.`
        : `Lote completo ${batch.id}. Estado: ${batch.estado}. COP. Neto esperado no acredita recepción bancaria. Azul: datos guardados; negro: fórmulas. No incluidas fuera de totales.`,
      totals: ['G','H','I','J','K','L','M','N','P','Q','S','T','U','V','W'], moneyFormat
    };
  }
  async function readOperations(sb, batch) {
    const fields = 'id,liquidation_id,external_id,normalized_data,operation_at,establishment_name,imei,referencia,modelo,cliente_nombre,reconocida,tipo_establecimiento,ejecutivo_id,ejecutivos(nombre),monto_credito,monto_base,inicial,valor_comercial,pagamos,pago_neto_beneficiario,pago_neto_tienda,bonos_aplicados,utilidad_creditek,liquidation_calculations(pagamos,pago_aliado,total_bonos,utilidad_creditek,policy_snapshot,explanation)';
    const operations = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await sb.from('liquidation_operations').select(fields).eq('liquidation_id', batch.id).order('id').range(offset, offset + 499);
      if (error) throw error;
      operations.push(...(data || []));
      if (!data || data.length < 500) break;
    }
    if (!operations.length) throw new Error('El lote no tiene operaciones disponibles para exportar.');
    return operations.map(operation => ({ ...operation, liquidation_cut: batch.fecha_corte }));
  }
  async function load(sb, batch) {
    return build(batch, await readOperations(sb, batch));
  }
  async function loadMany(sb, batches) {
    const groups = new Map();
    for (const batch of batches || []) {
      if (!names[batch.plataforma]) continue;
      const operations = await readOperations(sb, batch);
      if (!groups.has(batch.plataforma)) groups.set(batch.plataforma, []);
      groups.get(batch.plataforma).push(...operations);
    }
    const order = ['krediya', 'payjoy', 'alo'];
    return order.filter(platform => groups.has(platform)).map(platform => build({
      id: 'varios-lotes', plataforma: platform, estado: 'liquidados', multi: true
    }, groups.get(platform)));
  }
  root.CreditekLiquidacionesExcel = { build, load, loadMany };
})(typeof window === 'undefined' ? globalThis : window);
