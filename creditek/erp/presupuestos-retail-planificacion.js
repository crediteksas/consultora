(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.KoraPresupuestoPlanificacion = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const metricas = [
    ['meta_venta_total', 'Ventas', true], ['meta_creditos', 'Créditos', false],
    ['meta_uds_cel', 'Celulares de contado', false], ['meta_uds_acc', 'Accesorios', false],
  ];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // Sumar las filas ya redondeadas por el RPC; no recalcular metas ni repartir días en el navegador.
  function resumir(filas, mes) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new Error('Selecciona un mes válido.');
    const [anio, numeroMes] = mes.split('-').map(Number);
    const dias = new Date(Date.UTC(anio, numeroMes, 0)).getUTCDate();
    if (!Array.isArray(filas) || filas.length !== dias) throw new Error('Propuesta incompleta: faltan días del mes.');
    const fechas = new Set(), fuentes = new Set();
    let base = 0, propuesta = 0;
    for (const fila of filas) {
      if (typeof fila.fecha !== 'string' || !fila.fecha.startsWith(mes + '-') || !/^\d{4}-\d{2}-\d{2}$/.test(fila.fecha) || Number(fila.fecha.slice(-2)) < 1 || Number(fila.fecha.slice(-2)) > dias || fechas.has(fila.fecha)) throw new Error('Las fechas de la propuesta no son válidas.');
      fechas.add(fila.fecha);
      for (const campo of ['base_anterior', 'meta_propuesta']) {
        if ((typeof fila[campo] !== 'number' && typeof fila[campo] !== 'string') || String(fila[campo]).trim() === '' || !Number.isSafeInteger(Number(fila[campo])) || Number(fila[campo]) < 0) throw new Error('La propuesta contiene valores no válidos.');
      }
      if (typeof fila.fuente !== 'string' || !fila.fuente.trim()) throw new Error('Falta identificar la fuente de la propuesta.');
      fuentes.add(fila.fuente); base += Number(fila.base_anterior); propuesta += Number(fila.meta_propuesta);
      if (!Number.isSafeInteger(base) || !Number.isSafeInteger(propuesta)) throw new Error('La propuesta excede el rango verificable.');
    }
    return { base, propuesta, fuente: [...fuentes].join(' · '), estimada: [...fuentes].some(f => /estima/i.test(f)) };
  }
  function montar({ panel, button, tiendaInput, monthInput, inputs, sb, perfil, tiendas }) {
    if (!panel || !button || !tiendaInput || !monthInput || !perfil?.activo || !['gerencia', 'auditoria'].includes(perfil.rol)) return;
    panel.innerHTML = '<p data-plan-status role="status" aria-live="polite">Selecciona tienda y mes, ajusta los porcentajes y pulsa «Calcular propuesta» para comparar los cuatro indicadores.</p><div data-plan-resultados></div>';
    const status = panel.querySelector('[data-plan-status]'), grid = panel.querySelector('[data-plan-resultados]');
    let request = 0;
    const invalidate = () => {
      request++; grid.innerHTML = ''; panel.removeAttribute('aria-busy');
      status.textContent = 'Pulsa «Calcular propuesta» para actualizar el cuadro con la tienda, el mes y los porcentajes elegidos. Nada se guarda automáticamente.';
    };
    tiendaInput.addEventListener('change', invalidate); monthInput.addEventListener('change', invalidate);
    inputs.forEach(input => input.addEventListener('input', invalidate));
    const porcentajes = () => metricas.map(([id]) => {
      const input = inputs.find(i => i.dataset.metrica === id);
      if (!input || input.value.trim() === '') throw new Error('Completa los cuatro porcentajes entre 0% y 1000%.');
      const pct = Number(input.value);
      if (!Number.isFinite(pct) || pct < 0 || pct > 1000) throw new Error('Todos los porcentajes deben estar entre 0% y 1000%.');
      return pct;
    });
    const snapshot = () => JSON.stringify([tiendaInput.value, monthInput.value, inputs.map(i => i.value)]);
    button.addEventListener('click', async () => {
      invalidate(); const token = request, fingerprint = snapshot();
      try {
        const mes = monthInput.value, pct = porcentajes();
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new Error('Selecciona un mes válido.');
        const elegidas = root.KoraPresupuestosRetailCartas.tiendasElegidas(tiendas(), tiendaInput.value);
        const anterior = String(Number(mes.slice(0, 4)) - 1) + mes.slice(4);
        panel.setAttribute('aria-busy', 'true'); status.textContent = 'Consultando la base anterior y las cuatro propuestas, sin guardar…';
        const resultado = [];
        // Como máximo cuatro lecturas simultáneas; las tiendas se procesan en orden.
        for (const tienda of elegidas) {
          if (token !== request || fingerprint !== snapshot()) return;
          const filas = await Promise.all(metricas.map(async ([id, nombre, dinero], i) => {
            try {
              const { data, error } = await sb.rpc('proponer_presupuesto_operativo', { p_tienda: tienda.codigo, p_mes: mes + '-01', p_metrica: id, p_pct_crecimiento: pct[i] });
              if (error) throw new Error(error.message || 'No fue posible consultar la base.');
              return { id, nombre, dinero, pct: pct[i], ...resumir(data, mes) };
            } catch (error) { return { id, nombre, dinero, pct: pct[i], error: error.message || 'No fue posible preparar el indicador.' }; }
          }));
          resultado.push({ tienda, filas });
        }
        if (token !== request || fingerprint !== snapshot()) return;
        const numero = (n, dinero) => new Intl.NumberFormat('es-CO', dinero ? { style: 'currency', currency: 'COP', maximumFractionDigits: 0 } : { maximumFractionDigits: 0 }).format(n);
        const pendientes = resultado.reduce((n, t) => n + t.filas.filter(f => f.error).length, 0);
        grid.innerHTML = resultado.map(({ tienda, filas }) => `<article class="plan-tienda" data-plan-tienda="${esc(tienda.codigo)}"><h3>${esc(tienda.nombre)}</h3><div class="plan-tabla" tabindex="0" role="region" aria-label="Planificación de ${esc(tienda.nombre)}"><table><caption>Mes a preparar: ${esc(mes)} · Base del mismo mes de ${esc(anterior.slice(0, 4))}</caption><thead><tr><th scope="col">Categoría</th><th scope="col">Base año anterior<small>${esc(anterior)}</small></th><th scope="col">Crecimiento propuesto</th><th scope="col">Presupuesto propuesto<small>${esc(mes)} · sin guardar</small></th><th scope="col">Fuente y observaciones</th></tr></thead><tbody>${filas.map(f => `<tr data-plan-metrica="${esc(f.id)}"><th scope="row">${esc(f.nombre)}<small>${f.dinero ? 'COP' : 'Unidades'}</small></th><td>${f.error ? '—' : numero(f.base, f.dinero)}</td><td>${esc(new Intl.NumberFormat('es-CO', { maximumFractionDigits: 20 }).format(f.pct))}%</td><td class="plan-propuesta">${f.error ? 'Pendiente' : numero(f.propuesta, f.dinero)}</td><td class="${f.error || f.estimada || f.base === 0 ? 'plan-aviso' : ''}">${f.error ? esc(f.error) : `${f.estimada ? '<strong>Base estimada</strong><small>' : ''}${esc(f.fuente.replace(/ uniforme por tienda_codigo/g, '').replace(/estimación por valor de accesorios y precio promedio propio de /g, 'Unidades estimadas con la venta y el precio promedio propio de '))}${f.estimada ? '</small>' : ''}${f.base === 0 ? '<small>Base cero: revisa el histórico antes de aprobar.</small>' : ''}`}</td></tr>`).join('')}</tbody></table></div></article>`).join('') + '<p>La base y la propuesta son las sumas de los días devueltos por el cálculo actual de KORA, con su redondeo habitual. Una base cero no confirma que exista histórico. Los porcentajes de arriba se aplican a todas las tiendas seleccionadas.</p><p>Este cuadro es una consulta de los cuatro indicadores, sin guardar. «Aprobar indicador actual» conserva la categoría elegida en las pestañas; «Aprobar los 4 indicadores» conserva el proceso actual de aprobación.</p>';
        status.textContent = pendientes ? `Comparativo preparado con ${pendientes} indicador(es) pendientes. Revisa los avisos antes de aprobar.` : `Comparativo preparado para ${resultado.length} tienda(s). Propuestas sin guardar.`;
      } catch (error) {
        if (token === request && fingerprint === snapshot()) status.textContent = error.message || 'No fue posible preparar el comparativo.';
      } finally { if (token === request) panel.removeAttribute('aria-busy'); }
    });
  }
  return Object.freeze({ resumir, montar });
});
