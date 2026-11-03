(function (root) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  function montar({ button, monthInput, panel, sb, perfil, tiendas }) {
    if (!button || !panel || !monthInput || !perfil?.activo || !['gerencia', 'auditoria'].includes(perfil.rol)) return;
    const api = root.KoraPresupuestoCierre;
    let request = 0, reports = new Map();
    panel.innerHTML = '<h2>Informe por punto de venta</h2><p data-cierre-mes></p><p class="sub">Presupuesto registrado, resultado y crecimiento frente al mismo mes del año anterior para las cuatro categorías. Usa «Mes a ver» para elegir el período.</p><div class="form-inline"><div class="campo"><label for="cierreTienda">Punto de venta</label><select id="cierreTienda"></select></div><button type="button" class="btn-primary" data-cierre-preparar>Preparar informes</button></div><p data-cierre-status role="status" aria-live="polite"></p><div data-cierre-resultados></div>';
    const selector = panel.querySelector('select'), prepare = panel.querySelector('[data-cierre-preparar]'), status = panel.querySelector('[data-cierre-status]'), grid = panel.querySelector('[data-cierre-resultados]');
    const invalidate = () => { request++; reports.clear(); grid.innerHTML = ''; status.textContent = ''; panel.querySelector('[data-cierre-mes]').textContent = 'Mes seleccionado: ' + (monthInput.value || 'Selecciona un mes'); };
    monthInput.addEventListener('change', invalidate); selector.addEventListener('change', invalidate);
    button.addEventListener('click', () => {
      panel.hidden = !panel.hidden; button.setAttribute('aria-expanded', String(!panel.hidden));
      if (!panel.hidden) {
        const selected = selector.value;
        selector.innerHTML = '<option value="__todas__">Todos los puntos de venta</option>' + tiendas().map(t => `<option value="${esc(t.codigo)}">${esc(t.nombre)}</option>`).join('');
        selector.value = [...selector.options].some(o => o.value === selected) ? selected : '__todas__';
        invalidate(); panel.scrollIntoView({ block: 'nearest' });
      }
    });
    prepare.addEventListener('click', async () => {
      invalidate(); const token = request, mes = monthInput.value, codigo = selector.value;
      prepare.disabled = true; status.textContent = 'Consultando el presupuesto y los resultados del mes…';
      try {
        const cierres = await api.cargar({ sb, perfil, tiendas: tiendas(), mes, codigo });
        if (token !== request || monthInput.value !== mes || selector.value !== codigo) return;
        reports = new Map(cierres.map(c => [c.tienda.codigo, api.informe(c)]));
        const value = (n, metric, ratio = false) => n == null ? '—' : new Intl.NumberFormat('es-CO', ratio ? { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 } : metric.dinero ? { style: 'currency', currency: 'COP', minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 2 }).format(n);
        grid.innerHTML = cierres.map(c => `<article class="cierre-pdv" data-cierre-tienda="${esc(c.tienda.codigo)}"><h3>${esc(c.tienda.nombre)}</h3><p>${c.periodo.cerrado ? 'Cierre mensual' : 'Avance del mes · cifras parciales'} · ${esc(mes)} · Corte ${esc(c.periodo.corte)}</p><div class="cierre-pdv-tabla"><table><thead><tr><th>Categoría</th><th>Presupuesto</th><th>Realizado</th><th>Diferencia</th><th>Cumplimiento</th><th>Estado</th></tr></thead><tbody>${c.categorias.map(m => `<tr><th scope="row">${esc(m.nombre)}${m.dinero ? ' (COP)' : ' (unidades)'}</th><td>${value(m.presupuesto, m)}</td><td>${value(m.realizado, m)}</td><td>${value(m.diferencia, m)}</td><td>${value(m.cumplimiento, m, true)}</td><td>${esc(m.estado)}</td></tr>`).join('')}</tbody></table></div><h4>Crecimiento frente al mismo mes del año anterior</h4><p>Base: ${esc(c.comparativo?.mesAnterior||'Sin histórico')} · mes completo${c.periodo.cerrado?'':' · referencia, sin comparación al corte parcial'}</p><div class="cierre-pdv-tabla"><table><thead><tr><th>Categoría</th><th>Año anterior</th><th>Realizado actual</th><th>Variación interanual</th><th>Crecimiento interanual</th><th>Comparativo</th></tr></thead><tbody>${c.categorias.map(m => `<tr><th scope="row">${esc(m.nombre)}${m.dinero?' (COP)':' (unidades)'}</th><td>${value(m.valorAnterior,m)}</td><td>${value(m.realizado,m)}</td><td>${value(m.variacionAnual,m)}</td><td>${value(m.crecimientoAnual,m,true)}</td><td>${esc(m.estadoCrecimiento||'Sin histórico comparable')}</td></tr>`).join('')}</tbody></table></div>${c.notes.length ? `<p class="cierre-pdv-aviso">${c.notes.map(esc).join(' ')}</p>` : ''}<div class="cierre-pdv-descargas"><button type="button" class="btn-primary" data-cierre-formato="pdf">PDF · ${esc(c.tienda.nombre)}</button><button type="button" class="btn-secundario" data-cierre-formato="xlsx">Excel · ${esc(c.tienda.nombre)}</button></div></article>`).join('');
        status.textContent = `${cierres.length} informe(s) preparados. Descarga el PDF o Excel de cada punto de venta.`;
      } catch (error) {
        if (token !== request) return;
        reports.clear(); grid.innerHTML = ''; status.textContent = 'No se pudo preparar el cierre: ' + (error.message || 'Actualiza e intenta de nuevo.');
      } finally { prepare.disabled = false; }
    });
    grid.addEventListener('click', async event => {
      const download = event.target.closest('[data-cierre-formato]');
      if (!download || download.disabled) return;
      const report = reports.get(download.closest('[data-cierre-tienda]').dataset.cierreTienda);
      if (!report) return;
      const buttons = [...grid.querySelectorAll('button')]; buttons.forEach(b => b.disabled = true);
      const format = download.dataset.cierreFormato, popup = format === 'pdf' ? root.open('', '_blank') : null;
      if (popup) popup.opener = null;
      try {
        if (!root.KoraReportExport?.exportData) throw new Error('El generador de informes aún no está disponible. Actualiza la pantalla.');
        const id = await root.KoraReportExport.exportData(report, { format, sb, profile: perfil, popup });
        status.textContent = `Informe ${format === 'xlsx' ? 'Excel descargado' : 'PDF preparado para guardar'} · ${id}`;
      } catch (error) { popup?.close(); status.textContent = error.message || 'No se pudo generar el archivo.'; }
      finally { buttons.forEach(b => b.disabled = false); }
    });
  }
  root.KoraPresupuestoCierreUI = Object.freeze({ montar });
})(typeof globalThis !== 'undefined' ? globalThis : this);
