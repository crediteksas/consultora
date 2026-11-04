(function (root) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  function montar({ button, monthInput, panel, sb, perfil, tiendas }) {
    if (!button || !panel || !monthInput || !perfil?.activo || !['gerencia', 'auditoria'].includes(perfil.rol)) return;
    const api = root.KoraPresupuestoCierre;
    let request = 0, reports = new Map(), batchBusy = false;
    panel.innerHTML = '<h2>Informe por punto de venta</h2><p data-cierre-mes></p><p class="sub">Presupuesto registrado, resultado y crecimiento frente al mismo mes del año anterior para las cuatro categorías. Usa «Mes a ver» para elegir el período.</p><div class="form-inline"><div class="campo"><label for="cierreTienda">Punto de venta</label><select id="cierreTienda"></select></div><button type="button" class="btn-primary" data-cierre-preparar>Preparar informes</button><button type="button" class="btn-secundario" data-cierre-zip>Descargar todos los PDF (ZIP)</button></div><p data-cierre-status role="status" aria-live="polite"></p><div data-cierre-resultados></div>';
    const selector = panel.querySelector('select'), prepare = panel.querySelector('[data-cierre-preparar]'), status = panel.querySelector('[data-cierre-status]'), grid = panel.querySelector('[data-cierre-resultados]');
    const zipButton = panel.querySelector('[data-cierre-zip]');
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
      prepare.disabled = true; zipButton.disabled = true; status.textContent = 'Consultando el presupuesto y los resultados del mes…';
      try {
        const cierres = await api.cargar({ sb, perfil, tiendas: tiendas(), mes, codigo });
        if (token !== request || monthInput.value !== mes || selector.value !== codigo) return;
        reports = new Map(cierres.map(c => [c.tienda.codigo, api.informe(c)]));
        const value = (n, metric, ratio = false) => n == null ? '—' : new Intl.NumberFormat('es-CO', ratio ? { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 } : metric.dinero ? { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 } : { maximumFractionDigits: 2 }).format(n);
        grid.innerHTML = cierres.map(c => `<article class="cierre-pdv" data-cierre-tienda="${esc(c.tienda.codigo)}"><h3>${esc(c.tienda.nombre)}</h3><p>${c.periodo.cerrado ? 'Cierre mensual' : 'Avance del mes · cifras parciales'} · ${esc(mes)} · Corte ${esc(c.periodo.corte)}</p>
          <div class="cierre-pdv-tabla kora-table-region" tabindex="0" role="region" aria-label="Presupuesto y crecimiento de ${esc(c.tienda.nombre)}"><table role="table" data-kora-responsive="scroll">
            <caption>Base anterior: ${esc(c.comparativo?.mesAnterior || 'Sin histórico')} · mes completo${c.periodo.cerrado ? '' : ' · solo referencia, sin comparación al corte parcial'}</caption>
            <thead role="rowgroup"><tr role="row"><th role="columnheader" scope="col">Categoría</th><th role="columnheader" scope="col">Año anterior<small>${esc(c.comparativo?.mesAnterior || 'Sin histórico')}</small></th><th role="columnheader" scope="col">Presupuesto</th><th role="columnheader" scope="col" class="cierre-pdv-actual">Realizado</th><th role="columnheader" scope="col">Diferencia vs. meta</th><th role="columnheader" scope="col">Cumplimiento</th><th role="columnheader" scope="col">Variación interanual</th><th role="columnheader" scope="col">Crecimiento</th></tr></thead>
            <tbody role="rowgroup">${c.categorias.map(m => { const tonos = api.tonosCategoria(m); return `<tr role="row" data-cierre-categoria="${esc(m.id)}"><th role="rowheader" scope="row">${esc(m.nombre)}<small>${m.dinero ? 'COP' : 'Unidades'}</small></th><td role="cell" data-cierre-label="Año anterior · ${esc(c.comparativo?.mesAnterior || 'Sin histórico')}">${value(m.valorAnterior, m)}</td><td role="cell" data-cierre-label="Presupuesto">${value(m.presupuesto, m)}</td><td role="cell" data-cierre-label="Realizado" class="cierre-pdv-actual"><strong>${value(m.realizado, m)}</strong></td><td role="cell" data-cierre-label="Diferencia vs. meta">${value(m.diferencia, m)}</td><td role="cell" data-cierre-label="Cumplimiento" data-cierre-tono="${tonos.cumplimiento}"><strong>${value(m.cumplimiento, m, true)}</strong><small>${esc(m.estado)}</small></td><td role="cell" data-cierre-label="Variación interanual">${value(m.variacionAnual, m)}</td><td role="cell" data-cierre-label="Crecimiento" data-cierre-tono="${tonos.crecimiento}"><strong>${value(m.crecimientoAnual, m, true)}</strong><small>${esc(m.estadoCrecimiento || 'Sin histórico comparable')}</small></td></tr>`; }).join('')}</tbody>
          </table></div><p class="cierre-pdv-leyenda">${esc(api.LEYENDA_COLORES)}</p>${c.notes.length ? `<p class="cierre-pdv-aviso">${c.notes.map(esc).join(' ')}</p>` : ''}<div class="cierre-pdv-descargas"><button type="button" class="btn-primary" data-cierre-formato="pdf">PDF · ${esc(c.tienda.nombre)}</button><button type="button" class="btn-secundario" data-cierre-formato="xlsx">Excel · ${esc(c.tienda.nombre)}</button></div></article>`).join('');
        status.textContent = `${cierres.length} informe(s) preparados. Descarga el PDF o Excel de cada punto de venta.`;
      } catch (error) {
        if (token !== request) return;
        reports.clear(); grid.innerHTML = ''; status.textContent = 'No se pudo preparar el cierre: ' + (error.message || 'Actualiza e intenta de nuevo.');
      } finally { prepare.disabled = false; zipButton.disabled = batchBusy; }
    });
    zipButton.addEventListener('click', async () => {
      if (batchBusy || prepare.disabled) return;
      batchBusy = true; const token = request, mes = monthInput.value;
      const current = () => token === request && monthInput.value === mes;
      const controls = [prepare, selector, ...grid.querySelectorAll('button')], previous = controls.map(c => c.disabled);
      controls.forEach(c => c.disabled = true); zipButton.disabled = true;
      status.textContent = 'Consultando todos los puntos de venta del mes para el ZIP…';
      try {
        const cierres = await api.cargar({ sb, perfil, tiendas: tiendas(), mes, codigo: '__todas__' });
        if (!current()) return;
        if (!root.cargarLibreriaCartas || !root.KoraReportExport?.exportDataPdfZip) throw new Error('Actualiza la pantalla para cargar la descarga PDF/ZIP.');
        await Promise.all([root.cargarLibreriaCartas('vendor/jspdf-4.2.1.umd.min.js'), root.cargarLibreriaCartas('vendor/fflate-0.8.3.js')]);
        if (!current()) return;
        const result = await root.KoraReportExport.exportDataPdfZip(cierres.map(c => api.informe(c)), {
          sb, profile: perfil, isCurrent: current,
          onProgress: (n, total) => { if (current()) status.textContent = `Preparando PDF ${n} de ${total}…`; },
        });
        if (current()) status.textContent = `ZIP preparado con ${result.count} PDF, uno por punto de venta de ${mes}. Revisa Descargas en tu navegador.`;
      } catch (error) { if (current()) status.textContent = 'No se pudo descargar el ZIP: ' + (error.message || 'Intenta de nuevo.'); }
      finally { batchBusy = false; controls.forEach((c, i) => { if (c.isConnected) c.disabled = previous[i]; }); zipButton.disabled = false; }
    });
    grid.addEventListener('click', async event => {
      const download = event.target.closest('[data-cierre-formato]');
      if (!download || download.disabled || batchBusy) return;
      const report = reports.get(download.closest('[data-cierre-tienda]').dataset.cierreTienda);
      if (!report) return;
      const buttons = [zipButton, ...grid.querySelectorAll('button')]; buttons.forEach(b => b.disabled = true);
      const format = download.dataset.cierreFormato, popup = format === 'pdf' ? root.open('', '_blank') : null;
      if (popup) popup.opener = null;
      try {
        if (!root.KoraReportExport?.exportData) throw new Error('El generador de informes aún no está disponible. Actualiza la pantalla.');
        const id = await root.KoraReportExport.exportData(report, { format, sb, profile: perfil, popup });
        status.textContent = `Informe ${format === 'xlsx' ? 'Excel descargado' : 'PDF preparado para guardar'} · ${id}`;
      } catch (error) { popup?.close(); status.textContent = error.message || 'No se pudo generar el archivo.'; }
      finally { buttons.forEach(b => b.disabled = false); zipButton.disabled = prepare.disabled || batchBusy; }
    });
  }
  root.KoraPresupuestoCierreUI = Object.freeze({ montar });
})(typeof globalThis !== 'undefined' ? globalThis : this);
