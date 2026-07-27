(function () {
  'use strict';
  const D = window.CreditekUtilidadDomain;
  const env = window.CREDITEK_ENV || {
    SUPABASE_URL: 'https://jfkmiyvcdfbsbwchyvol.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impma21peXZjZGZic2J3Y2h5dm9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxMzA5NjgsImV4cCI6MjA5OTcwNjk2OH0.kpAjGLbDnycU-B1kc-AqOvj6X2xH-KHBiKB94V7prcQ',
  };
  const SB = window.SB || window.supabase.createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  const moneyFmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
  const intFmt = new Intl.NumberFormat('es-CO');
  const money = valor => valor == null ? '—' : moneyFmt.format(valor);
  const porcentaje = valor => valor == null ? '—' : `${(valor * 100).toFixed(1)}%`;
  const fechaHoy = () => {
    const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const mapa = Object.fromEntries(partes.map(p => [p.type, p.value]));
    return `${mapa.year}-${mapa.month}-${mapa.day}`;
  };
  const estado = { filas: [], filtradas: [], comparacion: [], granularidad: 'dia', chart: null };

  function toast(mensaje, error = false) {
    const el = document.getElementById('toast');
    el.textContent = mensaje;
    el.className = `fixed top-4 right-4 px-4 py-2 rounded shadow-lg text-white text-sm z-50 ${error ? 'bg-red-600' : 'bg-green-600'}`;
    setTimeout(() => el.classList.add('hidden'), 3500);
  }

  async function verificarAuth() {
    const { data: { session } } = await SB.auth.getSession();
    if (!session) { location.href = 'app.html'; return false; }
    const { data: rol, error } = await SB.rpc('rol_actual');
    if (error) throw error;
    document.getElementById('usuario-info').textContent = `${session.user.email || ''} · ${rol || 'sin rol'}`;
    if (!['gerencia', 'auditoria'].includes(rol)) {
      document.getElementById('auth-guard').classList.remove('hidden');
      return false;
    }
    document.getElementById('app').classList.remove('hidden');
    return true;
  }

  function rangoRapido(tipo) {
    const hoy = fechaHoy();
    const fecha = new Date(`${hoy}T12:00:00Z`);
    let desde = hoy;
    let hasta = hoy;
    if (tipo === 'semana') desde = D.moverDias(hoy, -((fecha.getUTCDay() || 7) - 1));
    if (tipo === 'mes') desde = `${hoy.slice(0, 7)}-01`;
    if (tipo === 'mes_anterior') {
      const anterior = D.moverMeses(`${hoy.slice(0, 7)}-01`, -1);
      desde = anterior;
      hasta = D.moverDias(`${hoy.slice(0, 7)}-01`, -1);
    }
    if (tipo === '30_dias') desde = D.moverDias(hoy, -29);
    document.getElementById('fecha-desde').value = desde;
    document.getElementById('fecha-hasta').value = hasta;
  }

  function filtros(rango) {
    return {
      desde: rango?.desde || document.getElementById('fecha-desde').value,
      hasta: rango?.hasta || document.getElementById('fecha-hasta').value,
      tienda: document.getElementById('filtro-tienda').value,
      plataforma: document.getElementById('filtro-plataforma').value,
      referencia: document.getElementById('filtro-referencia').value,
    };
  }

  function llenarSelect(id, valores) {
    const select = document.getElementById(id);
    const actual = select.value;
    const etiqueta = select.options[0].textContent;
    select.innerHTML = `<option value="">${etiqueta}</option>` +
      [...new Set(valores.filter(Boolean))].sort().map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
    if ([...select.options].some(o => o.value === actual)) select.value = actual;
  }

  function escapeHtml(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  async function cargar() {
    const desde = document.getElementById('fecha-desde').value;
    const hasta = document.getElementById('fecha-hasta').value;
    const rangoCmp = D.rangoComparacion(document.getElementById('comparativo').value, desde, hasta);
    const consultaDesde = rangoCmp && rangoCmp.desde < desde ? rangoCmp.desde : desde;
    const consultaHasta = rangoCmp && rangoCmp.hasta > hasta ? rangoCmp.hasta : hasta;
    const { data, error } = await SB.from('utilidad_creditek_rango').select('*')
      .gte('fecha', consultaDesde).lte('fecha', consultaHasta).order('fecha');
    if (error) throw error;
    estado.filas = (data || []).map(fila => ({
      ...fila,
      cantidad: Number(fila.cantidad), facturado: Number(fila.facturado),
      costo: Number(fila.costo), utilidad: Number(fila.facturado) - Number(fila.costo),
    }));
    llenarSelect('filtro-tienda', estado.filas.map(f => f.tienda_codigo));
    llenarSelect('filtro-plataforma', estado.filas.map(f => f.plataforma));
    llenarSelect('filtro-referencia', estado.filas.map(f => f.referencia));
    aplicar();
    document.getElementById('ultima-actualizacion').textContent = `Actualizado ${new Date().toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit' })}`;
  }

  function aplicar() {
    const base = filtros();
    if (!base.desde || !base.hasta || base.desde > base.hasta) throw new Error('El rango de fechas no es válido');
    estado.filtradas = D.filtrarFilas(estado.filas, base);
    const rangoCmp = D.rangoComparacion(document.getElementById('comparativo').value, base.desde, base.hasta);
    estado.comparacion = rangoCmp ? D.filtrarFilas(estado.filas, filtros(rangoCmp)) : [];
    estado.granularidad = D.granularidadAutomatica(base.desde, base.hasta);
    renderTodo(base, rangoCmp);
  }

  function delta(id, actual, previo, tipo = 'dinero', habilitado = true) {
    const el = document.getElementById(id);
    if (!habilitado) { el.textContent = 'Sin comparación'; return; }
    const resultado = D.comparar(actual, previo);
    if (!resultado.comparable) { el.textContent = 'Sin datos comparables'; return; }
    const formato = tipo === 'porcentaje' ? `${(resultado.diferencia * 100).toFixed(1)} pp` : money(resultado.diferencia);
    el.textContent = `${formato} · ${resultado.variacion >= 0 ? '+' : ''}${(resultado.variacion * 100).toFixed(1)}%`;
    el.className = `text-xs mt-2 ${resultado.diferencia >= 0 ? 'text-green-700' : 'text-red-700'}`;
  }

  function renderKpis(rangoCmp) {
    const actual = D.resumir(estado.filtradas);
    const previo = rangoCmp ? D.resumir(estado.comparacion) : null;
    document.getElementById('kpi-facturado').textContent = money(actual.facturado);
    document.getElementById('kpi-costo').textContent = money(actual.costo);
    document.getElementById('kpi-utilidad').textContent = money(actual.utilidad);
    document.getElementById('kpi-margen').textContent = porcentaje(actual.margen);
    delta('delta-facturado', actual.facturado, previo?.facturado, 'dinero', !!rangoCmp);
    delta('delta-costo', actual.costo, previo?.costo, 'dinero', !!rangoCmp);
    delta('delta-utilidad', actual.utilidad, previo?.utilidad, 'dinero', !!rangoCmp);
    delta('delta-margen', actual.margen, previo?.margen, 'porcentaje', !!rangoCmp);
    return actual;
  }

  function granularidadValida(tipo, desde, hasta) {
    const total = D.dias(desde, hasta);
    return tipo === 'dia' ? total <= 93 : tipo === 'semana' ? total >= 7 : total >= 28;
  }

  function renderChart(base) {
    document.querySelectorAll('[data-granularidad]').forEach(btn => {
      const tipo = btn.dataset.granularidad;
      btn.disabled = !granularidadValida(tipo, base.desde, base.hasta);
      btn.classList.toggle('opacity-40', btn.disabled);
      btn.classList.toggle('active', tipo === estado.granularidad);
    });
    const grupos = D.agruparTiempo(estado.filtradas, estado.granularidad);
    document.getElementById('chart-sub').textContent = `Agrupado por ${estado.granularidad} · ${base.desde} a ${base.hasta}`;
    if (estado.chart) estado.chart.destroy();
    estado.chart = new Chart(document.getElementById('chart-utilidad'), {
      data: {
        labels: grupos.map(g => g.periodo),
        datasets: [
          { type:'bar', label:'Facturado', data:grupos.map(g => g.facturado), backgroundColor:'#3b82f6' },
          { type:'bar', label:'Costo real', data:grupos.map(g => g.costo), backgroundColor:'#f97316' },
          { type:'bar', label:'Utilidad', data:grupos.map(g => g.utilidad), backgroundColor:'#10b981' },
          { type:'line', label:'Margen %', data:grupos.map(g => g.margen == null ? null : g.margen * 100), borderColor:'#a855f7', yAxisID:'y1' },
        ],
      },
      options: { responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false}, plugins:{legend:{position:'bottom'}}, scales:{ y:{beginAtZero:true}, y1:{beginAtZero:true,position:'right',grid:{drawOnChartArea:false},ticks:{callback:v=>`${v}%`}} } },
    });
  }

  const cabecera = titulo => `<tr class="bg-gray-100 text-left"><th class="px-4 py-2">${titulo}</th><th class="px-4 py-2 text-right">Facturado</th><th class="px-4 py-2 text-right">Costo real</th><th class="px-4 py-2 text-right">Utilidad</th><th class="px-4 py-2 text-right">Margen %</th><th class="px-4 py-2 text-right">Participación</th></tr>`;
  function renderTabla(prefijo, titulo, filas) {
    document.getElementById(`thead-${prefijo}`).innerHTML = cabecera(titulo);
    document.getElementById(`tbody-${prefijo}`).innerHTML = filas.length ? filas.map(f => `<tr><td class="px-4 py-2">${escapeHtml(f.nombre)}</td><td class="px-4 py-2 text-right font-mono">${money(f.facturado)}</td><td class="px-4 py-2 text-right font-mono">${money(f.costo)}</td><td class="px-4 py-2 text-right font-mono">${money(f.utilidad)}</td><td class="px-4 py-2 text-right">${porcentaje(f.margen)}</td><td class="px-4 py-2 text-right">${porcentaje(f.participacion)}</td></tr>`).join('') : '<tr><td colspan="6" class="text-center text-gray-400 py-6">Sin datos</td></tr>';
  }

  function renderTodo(base, rangoCmp) {
    const resumen = renderKpis(rangoCmp);
    renderChart(base);
    renderTabla('tienda', 'Tienda', D.agruparDimension(estado.filtradas, 'tienda_codigo'));
    renderTabla('plataforma', 'Plataforma', D.agruparDimension(estado.filtradas, 'plataforma'));
    renderTabla('referencia', 'Referencia', D.agruparDimension(estado.filtradas, 'referencia'));
    document.getElementById('resumen-rango').textContent = `${base.desde} a ${base.hasta}`;
    document.getElementById('res-dias').textContent = intFmt.format(D.dias(base.desde, base.hasta));
    document.getElementById('res-tiendas').textContent = intFmt.format(resumen.tiendas);
    document.getElementById('res-unidades').textContent = intFmt.format(resumen.unidades);
    document.getElementById('res-despachos').textContent = intFmt.format(resumen.despachos);
    document.getElementById('res-ticket').textContent = money(resumen.ticketPromedio);
  }

  function hojaResumen(base) {
    const r = D.resumir(estado.filtradas);
    return [
      ['Utilidad Creditek'], ['Rango', `${base.desde} a ${base.hasta}`],
      ['Tienda', base.tienda || 'Todas'], ['Plataforma', base.plataforma || 'Todas'], ['Referencia', base.referencia || 'Todas'],
      [], ['Indicador', 'Valor'], ['Facturado', r.facturado], ['Costo real', r.costo], ['Utilidad', r.utilidad],
      ['Margen %', r.margen], ['Días', D.dias(base.desde, base.hasta)], ['Tiendas', r.tiendas], ['Unidades', r.unidades],
      ['Despachos', r.despachos], ['Ticket promedio', r.ticketPromedio],
    ];
  }

  function filasExportacion(filas) {
    return filas.map(f => ({
      Fecha:f.fecha, Despacho:f.consecutivo, Tienda:f.tienda_codigo, Plataforma:f.plataforma || 'Sin asignar',
      Referencia:f.referencia, Producto:f.producto_nombre, Cantidad:f.cantidad,
      Facturado:f.facturado, 'Costo real':f.costo, Utilidad:f.facturado - f.costo,
      'Margen %':f.facturado ? (f.facturado - f.costo) / f.facturado : null,
    }));
  }

  function hojaDimension(filas) {
    return filas.map(f => ({ Nombre:f.nombre, Facturado:f.facturado, 'Costo real':f.costo, Utilidad:f.utilidad, 'Margen %':f.margen, Participación:f.participacion }));
  }

  function exportar() {
    const base = filtros();
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(hojaResumen(base)), 'Resumen');
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filasExportacion(estado.filtradas)), 'Detalle');
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(hojaDimension(D.agruparDimension(estado.filtradas, 'tienda_codigo'))), 'Por tienda');
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(hojaDimension(D.agruparDimension(estado.filtradas, 'plataforma'))), 'Por plataforma');
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(hojaDimension(D.agruparDimension(estado.filtradas, 'referencia'))), 'Por referencia');
    XLSX.writeFile(libro, `utilidad-creditek_${base.desde}_${base.hasta}.xlsx`);
  }

  function enlazar() {
    document.querySelectorAll('[data-rapido]').forEach(btn => btn.addEventListener('click', () => {
      document.querySelectorAll('[data-rapido]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (btn.dataset.rapido !== 'personalizado') rangoRapido(btn.dataset.rapido);
    }));
    ['fecha-desde','fecha-hasta'].forEach(id => document.getElementById(id).addEventListener('change', () => {
      document.querySelectorAll('[data-rapido]').forEach(b => b.classList.toggle('active', b.dataset.rapido === 'personalizado'));
    }));
    document.getElementById('btn-aplicar').addEventListener('click', () => cargar().catch(e => toast(e.message, true)));
    document.getElementById('btn-refresh').addEventListener('click', () => cargar().catch(e => toast(e.message, true)));
    ['filtro-tienda','filtro-plataforma','filtro-referencia'].forEach(id => document.getElementById(id).addEventListener('change', aplicar));
    document.querySelectorAll('[data-granularidad]').forEach(btn => btn.addEventListener('click', () => {
      if (btn.disabled) return;
      estado.granularidad = btn.dataset.granularidad;
      renderChart(filtros());
    }));
    document.getElementById('btn-exportar').addEventListener('click', exportar);
  }

  (async () => {
    try {
      if (!await verificarAuth()) return;
      rangoRapido('mes');
      enlazar();
      await cargar();
    } catch (error) {
      toast(`No se pudo cargar Utilidad Creditek: ${error.message}`, true);
    }
  })();
})();
