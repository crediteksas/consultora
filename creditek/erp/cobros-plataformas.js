(function (global, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  global.CreditekCobrosPlataformas = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const PLATFORMS = { alo: 'ALO Credit', payjoy: 'PayJoy', krediya: 'Krediya', addi: 'Addi' };
  const VOID_STATES = new Set(['anulado', 'anulada', 'cancelado', 'cancelada']);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const active = row => !VOID_STATES.has(String(row.estado || '').toLowerCase());
  const platformName = value => PLATFORMS[value] || value;
  const sourceName = value => ({ neto_confirmado: 'Neto confirmado', manual: 'Manual documentada' })[value] || value || 'Manual documentada';

  function cents(value) {
    if (typeof value !== 'number' && typeof value !== 'string') throw new Error('Importe inválido.');
    if (typeof value === 'string' && !/^\d+(?:\.\d{1,2})?$/.test(value.trim())) throw new Error('Usa un importe positivo con máximo dos decimales, sin separadores de miles.');
    const number = Number(value);
    const result = Math.round(number * 100);
    if (!Number.isFinite(number) || number < 0 || !Number.isSafeInteger(result) || Math.abs(number * 100 - result) > 0.00001) throw new Error('Importe inválido.');
    return result;
  }

  function sum(values) {
    const result = values.reduce((total, value) => total + value, 0);
    if (!Number.isSafeInteger(result)) throw new Error('El total supera el importe admitido.');
    return result;
  }

  function dateOnly(value) {
    const text = String(value || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error('Fecha inválida.');
    const parsed = new Date(`${text}T12:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) throw new Error('Fecha inválida.');
    return text;
  }

  function todayBogota(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const get = type => parts.find(part => part.type === type).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  // Applied amounts come only from active links, never from both links and row totals.
  function summarize(raw, today = todayBogota()) {
    dateOnly(today);
    if (!raw || !['expected', 'deposits', 'allocations'].every(key => Array.isArray(raw[key]))) throw new Error('La respuesta de cobros está incompleta. Actualiza para volver a consultar.');
    const normalize = (rows, kind) => {
      const ids = new Set();
      return rows.map(row => {
        if (!row || !row.id || ids.has(String(row.id))) throw new Error('Hay registros de cobros sin identificación o duplicados.');
        ids.add(String(row.id));
        const amount = cents(row.importe);
        if (!amount || !row.plataforma) throw new Error('Hay un registro de cobros sin importe o plataforma válidos.');
        return { ...row, id: String(row.id), plataforma: String(row.plataforma).toLowerCase(), amount, applied: 0, remaining: amount, day: dateOnly(kind === 'expected' ? row.fecha_esperada : row.fecha) };
      });
    };
    const expected = normalize(raw.expected, 'expected');
    const deposits = normalize(raw.deposits, 'deposit');
    const expectedById = new Map(expected.map(row => [row.id, row]));
    const depositById = new Map(deposits.map(row => [row.id, row]));
    const allocationIds = new Set();
    const allocations = raw.allocations.map(row => {
      if (!row || !row.id || allocationIds.has(String(row.id))) throw new Error('Hay aplicaciones sin identificación o duplicadas.');
      allocationIds.add(String(row.id));
      const amount = cents(row.importe);
      if (!amount) throw new Error('Hay una aplicación sin importe válido.');
      const expectedRow = expectedById.get(String(row.expected_id));
      const deposit = depositById.get(String(row.deposit_id));
      if (active(row)) {
        if (!expectedRow || !deposit || !active(expectedRow) || !active(deposit) || expectedRow.plataforma !== deposit.plataforma) throw new Error('Hay una aplicación inconsistente. Revisa el historial antes de continuar.');
        expectedRow.applied = sum([expectedRow.applied, amount]);
        deposit.applied = sum([deposit.applied, amount]);
      }
      return { ...row, id: String(row.id), expected_id: String(row.expected_id), deposit_id: String(row.deposit_id), amount, plataforma: deposit?.plataforma || expectedRow?.plataforma || '' };
    });
    [...expected, ...deposits].forEach(row => {
      row.remaining = row.amount - row.applied;
      if (row.remaining < 0) throw new Error('Hay aplicaciones que superan el importe del registro. Actualiza y revisa el historial.');
    });
    expected.forEach(row => { row.overdue = active(row) && row.remaining > 0 && row.day < today; });
    const names = [...new Set([...Object.keys(PLATFORMS), ...expected.map(row => row.plataforma), ...deposits.map(row => row.plataforma)])];
    const platforms = names.map(plataforma => {
      const receivables = expected.filter(row => row.plataforma === plataforma && active(row));
      const payments = deposits.filter(row => row.plataforma === plataforma && active(row));
      return {
        plataforma,
        expected: sum(receivables.map(row => row.amount)), received: sum(payments.map(row => row.amount)),
        applied: sum(receivables.map(row => row.applied)), pending: sum(receivables.map(row => row.remaining)),
        overdue: sum(receivables.filter(row => row.overdue).map(row => row.remaining)),
        unapplied: sum(payments.map(row => row.remaining)),
      };
    });
    const totals = {};
    ['expected', 'received', 'applied', 'pending', 'overdue', 'unapplied'].forEach(key => { totals[key] = sum(platforms.map(row => row[key])); });
    const candidates = (Array.isArray(raw.candidates) ? raw.candidates : []).map(row => {
      if (!row || !row.liquidation_id || !row.plataforma) throw new Error('Hay una liquidación por confirmar sin identificación o plataforma.');
      return { ...row, plataforma: String(row.plataforma).toLowerCase(), baseAmount: row.base_estimada == null ? null : cents(row.base_estimada) };
    });
    return { expected, deposits, allocations, candidates, events: Array.isArray(raw.events) ? raw.events : [], platforms, totals, today };
  }

  function validateAllocation(summary, depositId, expectedId, value) {
    const deposit = summary.deposits.find(row => row.id === String(depositId) && active(row));
    const expected = summary.expected.find(row => row.id === String(expectedId) && active(row));
    const amount = cents(value);
    if (!deposit || !expected) throw new Error('Selecciona un abono y un cobro esperado activos.');
    if (deposit.plataforma !== expected.plataforma) throw new Error('El abono y el corte deben pertenecer a la misma plataforma.');
    if (!amount) throw new Error('El importe a aplicar debe ser mayor que cero.');
    if (amount > deposit.remaining) throw new Error('El importe supera el saldo sin aplicar del abono.');
    if (amount > expected.remaining) throw new Error('El importe supera el saldo pendiente del corte.');
    return amount / 100;
  }

  function csvCell(value) {
    // Quoting alone does not stop Excel formulas; also guard leading whitespace/control chars.
    let text = String(value ?? '');
    if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }

  function exportCsv(summary, platform = '') {
    const rows = [['Tipo', 'Plataforma', 'ID', 'Corte', 'Fecha esperada / abono', 'Concepto', 'Importe COP', 'Aplicado COP', 'Pendiente / sin aplicar COP', 'Vencido COP', 'Banco', 'Cuenta últimos 4', 'Referencia', 'Soporte', 'Estado', 'Cobro esperado ID', 'Abono ID', 'Fuente']];
    const matches = row => !platform || row.plataforma === platform;
    const decimal = value => (value / 100).toFixed(2);
    summary.expected.filter(matches).forEach(row => rows.push(['Cobro esperado', platformName(row.plataforma), row.id, row.corte, row.day, row.concepto, decimal(row.amount), decimal(row.applied), active(row) ? decimal(row.remaining) : '0.00', row.overdue ? decimal(row.remaining) : '0.00', '', '', '', row.soporte, active(row) ? (row.remaining ? 'Pendiente' : 'Cobrado') : 'Anulado', '', '', row.fuente_tipo || 'manual']));
    summary.deposits.filter(matches).forEach(row => rows.push(['Abono recibido', platformName(row.plataforma), row.id, '', row.day, '', decimal(row.amount), decimal(row.applied), active(row) ? decimal(row.remaining) : '0.00', '', row.banco, row.cuenta_ultimos4 ? `•••• ${row.cuenta_ultimos4}` : '', row.referencia, row.soporte, active(row) ? 'Activo' : 'Anulado', '', '', 'abono']));
    summary.allocations.filter(matches).forEach(row => rows.push(['Aplicación (no sumar a recibido)', platformName(row.plataforma), row.id, summary.expected.find(item => item.id === row.expected_id)?.corte || '', '', '', decimal(row.amount), '', '', '', '', '', '', '', active(row) ? 'Activa' : 'Anulada', row.expected_id, row.deposit_id, 'aplicacion']));
    (summary.candidates || []).filter(matches).forEach(row => rows.push(['Base estimada (no sumar a esperado)', platformName(row.plataforma), row.liquidation_id, row.corte, '', row.concepto, row.baseAmount == null ? '' : decimal(row.baseAmount), '', '', '', '', '', '', '', 'Por confirmar neto', '', '', 'archivo_liquidacion']));
    return `\uFEFF${rows.map(row => row.map(csvCell).join(';')).join('\r\n')}\r\n`;
  }

  function create({ sb, money, canEdit = false, canVoid = false } = {}) {
    if (!sb || typeof sb.rpc !== 'function') throw new Error('Se necesita la sesión actual de Tesorería para consultar cobros.');
    const formatMoney = money || (value => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 }).format(value));
    const state = { container: null, data: null, platform: '', busy: false, stale: false, notice: '', error: false, generation: 0 };
    const cash = value => esc(formatMoney(value / 100));
    const options = selected => (state.data?.platforms || Object.keys(PLATFORMS).map(plataforma => ({ plataforma }))).map(row => `<option value="${esc(row.plataforma)}"${row.plataforma === selected ? ' selected' : ''}>${esc(platformName(row.plataforma))}</option>`).join('');
    const shortDate = value => value ? esc(String(value).slice(0, 10)) : 'Sin fecha';
    const positiveValue = value => { const amount = cents(value); if (!amount) throw new Error('El importe debe ser mayor que cero.'); return amount / 100; };
    const field = (label, name, type = 'text', extra = '', value = '') => `<label class="cobros-field">${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
    const platformField = () => `<label class="cobros-field">Plataforma<select name="plataforma" required>${options(state.platform)}</select></label>`;
    const moneyField = (label = 'Importe recibido (COP)', extra = '') => field(label, 'importe', 'number', `required min="0.01" step="0.01" inputmode="decimal" placeholder="Ej. 1250000" ${extra}`);
    const supportField = () => field('Soporte (enlace o referencia; no adjunta archivos)', 'soporte', 'text', 'required minlength="3" maxlength="1500" placeholder="Enlace al soporte o número de documento"');

    function support(value) {
      if (!value) return '<span class="cobros-muted">Sin soporte</span>';
      try {
        const url = new URL(String(value));
        if (url.protocol === 'https:' || url.protocol === 'http:') return `<a href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">Abrir soporte</a>`;
      } catch (_) { /* A document reference is also accepted. */ }
      return esc(value);
    }

    function metrics(values) {
      return `<dl class="cobros-metrics">${[['expected', 'Esperado'], ['received', 'Recibido'], ['pending', 'Pendiente por cobrar'], ['overdue', 'Vencido'], ['unapplied', 'Recibido sin aplicar']].map(([key, label]) => `<div class="cobros-metric${key === 'overdue' && values[key] ? ' cobros-metric--alert' : ''}"><dt>${label}</dt><dd>${cash(values[key])}</dd></div>`).join('')}</dl>`;
    }

    function voidForm(kind, id) {
      if (!canVoid) return '';
      return `<details class="cobros-void"><summary>Anular ${kind === 'expected' ? 'cobro esperado' : kind === 'deposit' ? 'abono' : 'aplicación'}</summary><form data-cobros-form="void" data-kind="${kind}" data-id="${esc(id)}" class="cobros-form"><p class="cobros-form-wide cobros-muted">La anulación conserva el registro y el motivo en el historial. Si tiene aplicaciones activas, anúlalas primero.</p>${field('Motivo de anulación', 'motivo', 'text', 'required minlength="5" maxlength="1000"')}<div class="cobros-form-actions"><button type="submit" class="btn danger">Confirmar anulación</button></div></form></details>`;
    }

    function expectedCard(row) {
      const status = !active(row) ? 'Anulado' : row.remaining === 0 ? 'Cobrado' : row.overdue ? 'Vencido' : row.applied > 0 ? 'Parcial' : 'Pendiente';
      return `<article class="cobros-record${!active(row) ? ' cobros-record--void' : ''}"><div class="cobros-record-head"><h4>Corte ${esc(row.corte || 'sin corte')}</h4><span class="cobros-status${row.overdue ? ' cobros-status--alert' : ''}">${status}</span></div><p>${esc(row.concepto || 'Cobro de plataforma')}</p><dl class="cobros-record-fields"><div><dt>Fecha esperada</dt><dd>${shortDate(row.day)}</dd></div><div><dt>Esperado</dt><dd>${cash(row.amount)}</dd></div><div><dt>Aplicado</dt><dd>${cash(row.applied)}</dd></div><div><dt>Pendiente</dt><dd>${active(row) ? cash(row.remaining) : 'No aplica'}</dd></div><div><dt>Fuente</dt><dd>${esc(sourceName(row.fuente_tipo))}${row.liquidation_id ? ` · ${esc(row.liquidation_id)}` : ''}</dd></div><div><dt>Soporte</dt><dd>${support(row.soporte)}</dd></div></dl>${active(row) ? voidForm('expected', row.id) : `<p class="cobros-muted">${esc(row.motivo_anulacion || 'Anulado; consulta el historial de cambios.')}</p>`}</article>`;
    }

    function allocationForm(deposit) {
      if (!canEdit || !active(deposit) || deposit.remaining <= 0) return '';
      const available = state.data.expected.filter(row => active(row) && row.plataforma === deposit.plataforma && row.remaining > 0);
      if (!available.length) return '<p class="cobros-muted">El saldo queda sin aplicar hasta registrar un cobro esperado pendiente de esta plataforma.</p>';
      return `<details class="cobros-entry"><summary>Aplicar a un corte</summary><form data-cobros-form="allocate" data-deposit="${esc(deposit.id)}" class="cobros-form"><p class="cobros-form-wide cobros-muted">Disponible: ${cash(deposit.remaining)}. Puedes aplicar una parte y repetir en otros cortes de ${esc(platformName(deposit.plataforma))}.</p><label class="cobros-field cobros-form-wide">Cobro esperado<select name="expected_id" required><option value="">Selecciona un corte</option>${available.map(row => `<option value="${esc(row.id)}">${esc(row.corte)} · ${esc(row.concepto || 'Cobro esperado')} · pendiente ${cash(row.remaining)}</option>`).join('')}</select></label>${moneyField('Importe a aplicar (COP)', `max="${deposit.remaining / 100}"`)}<div class="cobros-form-actions"><button type="submit" class="btn primary">Aplicar abono</button></div></form></details>`;
    }

    function depositCard(row) {
      const applications = state.data.allocations.filter(item => item.deposit_id === row.id);
      const allocationList = applications.length ? `<details class="cobros-history"><summary>Aplicaciones de este abono (${applications.length})</summary><ul>${applications.map(item => {
        const expected = state.data.expected.find(expectedRow => expectedRow.id === item.expected_id);
        return `<li><p>Corte ${esc(expected?.corte || item.expected_id)} · ${cash(item.amount)} · ${active(item) ? 'Aplicada' : 'Anulada'}</p>${active(item) ? voidForm('allocation', item.id) : ''}</li>`;
      }).join('')}</ul></details>` : '';
      return `<article class="cobros-record${!active(row) ? ' cobros-record--void' : ''}"><div class="cobros-record-head"><h4>Abono del ${shortDate(row.day)}</h4><span class="cobros-status">${!active(row) ? 'Anulado' : row.remaining === 0 ? 'Aplicado' : row.applied ? 'Parcialmente aplicado' : 'Sin aplicar'}</span></div><dl class="cobros-record-fields"><div><dt>Recibido</dt><dd>${cash(row.amount)}</dd></div><div><dt>Sin aplicar</dt><dd>${active(row) ? cash(row.remaining) : 'No aplica'}</dd></div><div><dt>Banco / cuenta</dt><dd>${esc(row.banco || 'Sin banco')} · •••• ${esc(row.cuenta_ultimos4 || '—')}</dd></div><div><dt>Referencia</dt><dd>${esc(row.referencia || 'Sin referencia')}</dd></div><div><dt>Soporte</dt><dd>${support(row.soporte)}</dd></div></dl>${allocationForm(row)}${allocationList}${active(row) ? voidForm('deposit', row.id) : `<p class="cobros-muted">${esc(row.motivo_anulacion || 'Anulado; consulta el historial de cambios.')}</p>`}</article>`;
    }

    function platformCard(item) {
      const expected = state.data.expected.filter(row => row.plataforma === item.plataforma);
      const deposits = state.data.deposits.filter(row => row.plataforma === item.plataforma);
      const renderGroup = (rows, renderer, empty) => rows.length ? rows.map(renderer).join('') : `<p class="cobros-empty">${empty}</p>`;
      return `<section class="cobros-platform"><h3>${esc(platformName(item.plataforma))}</h3>${metrics(item)}<div class="cobros-columns"><div><h4 class="cobros-group-title">Cobros esperados por corte</h4>${renderGroup(expected.filter(active).sort((a, b) => a.day.localeCompare(b.day)), expectedCard, 'No hay cobros esperados registrados.')}</div><div><h4 class="cobros-group-title">Abonos recibidos</h4>${renderGroup(deposits.filter(active).sort((a, b) => b.day.localeCompare(a.day)), depositCard, 'No hay abonos registrados.')}</div></div>${expected.some(row => !active(row)) || deposits.some(row => !active(row)) ? `<details class="cobros-history"><summary>Registros anulados</summary><div class="cobros-columns"><div>${expected.filter(row => !active(row)).map(expectedCard).join('')}</div><div>${deposits.filter(row => !active(row)).map(depositCard).join('')}</div></div></details>` : ''}</section>`;
    }

    function entryForms() {
      if (!canEdit) return '<p class="cobros-muted">Consulta de cobros. Tu perfil no permite registrar cambios.</p>';
      return `<div class="cobros-entry-grid">
        <details class="cobros-entry"><summary>Agregar cobro esperado</summary>
          <form data-cobros-form="expected" class="cobros-form">
            <p class="cobros-form-wide cobros-muted">Registra el importe que la plataforma debe consignar, con su corte y soporte. Fuente de esta entrada: manual documentada.</p>
            ${platformField()}${field('Corte', 'corte', 'date', 'required')}
            ${field('Fecha esperada de pago', 'fecha_esperada', 'date', 'required')}${moneyField('Importe esperado (COP)')}
            ${field('Concepto', 'concepto', 'text', 'required minlength="3" maxlength="300"')}${supportField()}
            <div class="cobros-form-actions"><button type="submit" class="btn primary">Guardar cobro esperado</button></div>
          </form>
        </details>
        <details class="cobros-entry"><summary>Registrar abono</summary>
          <form data-cobros-form="deposit" class="cobros-form">
            <p class="cobros-form-wide cobros-muted">Registra la consignación recibida. Después podrás distribuirla entre uno o varios cortes de la misma plataforma.</p>
            ${platformField()}${field('Fecha del abono', 'fecha', 'date', 'required', todayBogota())}
            ${field('Banco receptor', 'banco', 'text', 'required minlength="2" maxlength="100"')}
            ${field('Últimos 4 dígitos de la cuenta', 'cuenta_ultimos4', 'text', 'required inputmode="numeric" pattern="[0-9]{4}" minlength="4" maxlength="4" placeholder="Ej. 1234"')}
            ${field('Referencia del abono', 'referencia', 'text', 'required maxlength="120"')}${moneyField()}${supportField()}
            <div class="cobros-form-actions"><button type="submit" class="btn primary">Guardar abono</button></div>
          </form>
        </details>
      </div>`;
    }

    function candidates() {
      const rows = state.data.candidates.filter(row => !state.platform || row.plataforma === state.platform);
      if (!rows.length) return '';
      return `<section class="cobros-candidates"><h3>Liquidaciones por confirmar</h3><p class="cobros-muted">La base del archivo no equivale al abono bancario. Confirma el neto que la plataforma debe consignar con su soporte; hasta entonces estas liquidaciones no suman al esperado ni al pendiente.</p><div class="cobros-candidate-grid">${rows.map(row => `<article class="cobros-record"><h4>${esc(platformName(row.plataforma))} · Corte ${esc(row.corte)}</h4><p>${esc(row.concepto || 'Liquidación pendiente de confirmar')}</p><dl class="cobros-record-fields"><div><dt>Base estimada del archivo</dt><dd>${row.baseAmount == null ? 'Sin base disponible' : cash(row.baseAmount)}</dd></div><div><dt>Operaciones</dt><dd>${esc(row.operaciones ?? 'Sin información')}</dd></div><div><dt>Estado de liquidación</dt><dd>${esc(row.estado_liquidacion || 'Sin información')}</dd></div></dl>${canEdit ? `<details class="cobros-entry"><summary>Confirmar neto esperado</summary><form data-cobros-form="candidate" data-liquidation="${esc(row.liquidation_id)}" class="cobros-form"><p class="cobros-form-wide cobros-muted">El neto inicia vacío y debe confirmarse según el soporte de ${esc(platformName(row.plataforma))}.</p>${field('Fecha esperada de pago', 'fecha_esperada', 'date', 'required')}${moneyField('Neto esperado confirmado (COP)')}${field('Concepto', 'concepto', 'text', 'required minlength="3" maxlength="300"', row.concepto || `Liquidación ${row.corte}`)}${supportField()}<div class="cobros-form-actions"><button type="submit" class="btn primary">Confirmar cobro esperado</button></div></form></details>` : '<p class="cobros-muted">Pendiente de confirmación por Gerencia.</p>'}</article>`).join('')}</div></section>`;
    }

    function history() {
      const records = [...state.data.expected, ...state.data.deposits, ...state.data.allocations];
      const events = state.data.events.filter(event => {
        const platform = event.plataforma || event.detalle?.plataforma || records.find(row => row.id === event.registro_id)?.plataforma;
        return !state.platform || platform === state.platform;
      });
      const names = { expected_creado: 'Cobro esperado registrado', deposit_creado: 'Abono registrado', allocation_creada: 'Abono aplicado a un corte', expected_anulado: 'Cobro esperado anulado', deposit_anulado: 'Abono anulado', allocation_anulado: 'Aplicación anulada' };
      return `<details class="cobros-history"><summary>Historial de cambios (${events.length})</summary>${events.length ? `<ol>${events.map(event => {
        const kind = event.accion || event.tipo || event.event_type || 'Cambio registrado';
        const detail = event.detalle && typeof event.detalle === 'object' ? event.detalle : {};
        const description = event.motivo || detail.motivo || detail.concepto || detail.referencia || event.reason || (typeof event.detalle === 'string' ? event.detalle : '');
        return `<li><strong>${esc(names[kind] || kind)}</strong><p>${esc(event.fecha || event.created_at || '')}${event.actor_nombre || event.actor_id ? ` · ${esc(event.actor_nombre || event.actor_id)}` : ''}</p><p>${esc(description)}</p>${event.registro_id ? `<p class="cobros-muted">Registro: ${esc(event.registro_id)}</p>` : ''}</li>`;
      }).join('')}</ol>` : '<p class="cobros-muted">No hay eventos de cambio para mostrar.</p>'}</details>`;
    }

    function showNotice(message, error = false) {
      state.notice = message;
      state.error = error;
      const node = state.container?.querySelector('[data-cobros-notice]');
      if (node) {
        node.textContent = message;
        node.hidden = !message;
        node.className = `cobros-notice${error ? ' cobros-notice--error' : ''}`;
        node.setAttribute('role', error ? 'alert' : 'status');
      }
    }

    function setBusy(busy) {
      state.busy = busy;
      if (!state.container) return;
      state.container.setAttribute('aria-busy', String(busy));
      state.container.querySelectorAll('button, input, select').forEach(node => { node.disabled = busy || (state.stale && node.closest('form') !== null); });
      if (state.stale) state.container.querySelectorAll('[data-cobros-action="export"]').forEach(node => { node.disabled = true; });
    }

    function render() {
      if (!state.container) return;
      const total = state.platform ? state.data?.platforms.find(row => row.plataforma === state.platform) : state.data?.totals;
      state.container.innerHTML = `<section class="cobros-plataformas" aria-label="Cobros de plataformas"><div class="cobros-heading"><div><h2>Cobros de plataformas</h2><p class="cobros-muted">Control de consignaciones y saldos pendientes por corte. Importes en COP.</p></div><div class="cobros-actions"><button type="button" class="btn secondary" data-cobros-action="refresh">Actualizar</button>${state.data ? '<button type="button" class="btn secondary" data-cobros-action="export">Exportar para Excel (CSV)</button>' : ''}</div></div><div data-cobros-notice class="cobros-notice" role="status" aria-live="polite" hidden></div>${state.data ? `<label class="cobros-filter">Plataforma<select data-cobros-filter><option value="">Todas las plataformas</option>${options(state.platform)}</select></label>${total ? metrics(total) : ''}<p class="cobros-muted cobros-definition">Pendiente = esperado menos aplicaciones activas. Vencido = pendiente con fecha esperada anterior al ${shortDate(state.data.today)}. Recibido incluye los abonos sin aplicar; las aplicaciones no suman nuevos ingresos. Este control no modifica saldos de Tesorería ni pagos.</p>${entryForms()}${candidates()}<div class="cobros-platforms">${state.data.platforms.filter(row => !state.platform || row.plataforma === state.platform).map(platformCard).join('')}</div>${history()}` : `<p class="cobros-empty">${state.notice ? 'Los saldos no están disponibles. Actualiza para volver a consultar.' : 'Consultando cobros de plataformas…'}</p>`}</section>`;
      showNotice(state.notice, state.error);
      setBusy(state.busy);
    }

    async function request(name, args) {
      const result = await sb.rpc(name, args);
      if (!result || result.error) throw new Error(result?.error?.message || 'No se pudo completar la solicitud.');
      return result.data;
    }

    async function refresh() {
      if (state.busy || !state.container) return;
      const generation = state.generation;
      setBusy(true);
      try {
        const raw = await request('cobros_plataformas_resumen', {});
        if (generation !== state.generation) return;
        state.data = summarize(raw);
        state.stale = false;
        state.notice = '';
        state.error = false;
      } catch (error) {
        if (generation !== state.generation) return;
        state.stale = true;
        state.notice = `${state.data ? 'No se pudo actualizar. Se muestran los últimos datos consultados; guarda cambios cuando la consulta se recupere. ' : 'No se pudieron consultar los cobros. '}${error.message}`;
        state.error = true;
      } finally {
        if (generation === state.generation) { state.busy = false; render(); }
      }
    }

    function idempotencyKey(form) {
      if (!form.dataset.requestKey) {
        if (!globalThis.crypto?.randomUUID) throw new Error('El navegador necesita una conexión segura para registrar el movimiento.');
        form.dataset.requestKey = globalThis.crypto.randomUUID();
      }
      return form.dataset.requestKey;
    }

    async function onSubmit(event) {
      const form = event.target.closest('[data-cobros-form]');
      if (!form || !state.container?.contains(form)) return;
      event.preventDefault();
      if (state.busy || state.stale || !state.data) return;
      const type = form.dataset.cobrosForm;
      if ((type === 'void' && !canVoid) || (type !== 'void' && !canEdit)) return;
      if (!form.reportValidity()) return;
      let name, args;
      try {
        const fields = new FormData(form);
        const value = key => String(fields.get(key) || '').trim();
        const textValue = (key, label, min, max) => {
          const text = value(key);
          if (text.length < min || text.length > max) throw new Error(`${label} debe tener entre ${min} y ${max} caracteres.`);
          return text;
        };
        if (type === 'candidate') {
          const candidate = state.data.candidates.find(row => String(row.liquidation_id) === form.dataset.liquidation);
          if (!candidate) throw new Error('La liquidación ya no está disponible para confirmar. Actualiza la consulta.');
          name = 'cobros_crear_esperado';
          args = { p_plataforma: candidate.plataforma, p_corte: candidate.corte, p_fecha_esperada: dateOnly(value('fecha_esperada')), p_concepto: textValue('concepto', 'El concepto', 3, 300), p_importe: positiveValue(value('importe')), p_soporte: textValue('soporte', 'El soporte', 3, 1500), p_liquidation_id: candidate.liquidation_id, p_idempotency_key: idempotencyKey(form) };
        } else if (type === 'expected') {
          name = 'cobros_crear_esperado';
          args = { p_plataforma: value('plataforma'), p_corte: dateOnly(value('corte')), p_fecha_esperada: dateOnly(value('fecha_esperada')), p_concepto: textValue('concepto', 'El concepto', 3, 300), p_importe: positiveValue(value('importe')), p_soporte: textValue('soporte', 'El soporte', 3, 1500), p_liquidation_id: null, p_idempotency_key: idempotencyKey(form) };
        } else if (type === 'deposit') {
          if (!/^\d{4}$/.test(value('cuenta_ultimos4'))) throw new Error('Ingresa exactamente los últimos cuatro dígitos de la cuenta.');
          name = 'cobros_registrar_abono';
          args = { p_plataforma: value('plataforma'), p_fecha: dateOnly(value('fecha')), p_banco: textValue('banco', 'El banco', 2, 100), p_cuenta_ultimos4: value('cuenta_ultimos4'), p_referencia: textValue('referencia', 'La referencia', 1, 120), p_importe: positiveValue(value('importe')), p_soporte: textValue('soporte', 'El soporte', 3, 1500), p_idempotency_key: idempotencyKey(form) };
        } else if (type === 'allocate') {
          name = 'cobros_aplicar_abono';
          args = { p_deposit_id: form.dataset.deposit, p_expected_id: value('expected_id'), p_importe: validateAllocation(state.data, form.dataset.deposit, value('expected_id'), value('importe')), p_idempotency_key: idempotencyKey(form) };
        } else if (type === 'void') {
          if (value('motivo').length < 5) throw new Error('Describe el motivo de la anulación.');
          name = 'cobros_anular_registro';
          args = { p_tipo: form.dataset.kind, p_id: form.dataset.id, p_motivo: value('motivo') };
        } else return;
        // A retry must repeat the same operation; editing its payload needs a new form.
        const signature = JSON.stringify({ name, args });
        if (form.dataset.requestSignature && form.dataset.requestSignature !== signature) throw new Error('Ya se intentó guardar este formulario. Reintenta con los mismos datos o actualiza para consultar el resultado antes de registrar otro movimiento.');
        form.dataset.requestSignature = signature;
      } catch (error) { showNotice(error.message, true); return; }
      const generation = state.generation;
      setBusy(true);
      showNotice('Guardando…');
      let saved = false;
      try {
        await request(name, args);
        saved = true;
        if (generation !== state.generation) return;
        const raw = await request('cobros_plataformas_resumen', {});
        if (generation !== state.generation) return;
        state.data = summarize(raw);
        state.stale = false;
        state.notice = type === 'void' ? 'Registro anulado. El historial conserva la trazabilidad.' : 'Registro guardado. Los saldos están actualizados.';
        state.error = false;
        state.busy = false;
        render();
      } catch (error) {
        if (generation !== state.generation) return;
        if (saved) state.stale = true;
        showNotice(saved ? `El registro se guardó, pero no fue posible actualizar los saldos. Pulsa Actualizar antes de continuar. ${error.message}` : `No se pudo confirmar el registro. ${error.message} Puedes reintentar con los mismos datos o actualizar para verificar el resultado.`, true);
      } finally { if (generation === state.generation) setBusy(false); }
    }

    function onClick(event) {
      const button = event.target.closest('[data-cobros-action]');
      if (!button || !state.container?.contains(button) || state.busy) return;
      if (button.dataset.cobrosAction === 'refresh') { void refresh(); return; }
      if (button.dataset.cobrosAction === 'export' && state.data && !state.stale) {
        const blob = new Blob([exportCsv(state.data, state.platform)], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = state.container.ownerDocument.createElement('a');
        link.href = url;
        link.download = `cobros-plataformas-${state.data.today}${state.platform ? `-${state.platform.replace(/[^a-z0-9_-]/gi, '')}` : ''}.csv`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    }

    function onChange(event) {
      if (!event.target.matches('[data-cobros-filter]') || state.busy) return;
      state.platform = event.target.value;
      render();
    }

    function destroy() {
      state.generation += 1;
      if (state.container) {
        state.container.removeEventListener('click', onClick);
        state.container.removeEventListener('submit', onSubmit);
        state.container.removeEventListener('change', onChange);
      }
      state.container = null;
      state.busy = false;
    }

    async function mount(container) {
      if (!container || typeof container.addEventListener !== 'function') throw new Error('No se encontró el contenedor de cobros.');
      destroy();
      state.container = container;
      container.addEventListener('click', onClick);
      container.addEventListener('submit', onSubmit);
      container.addEventListener('change', onChange);
      render();
      await refresh();
    }

    return { mount, refresh, destroy };
  }

  return { create, summarize, validateAllocation, exportCsv, csvCell, cents, todayBogota };
});
