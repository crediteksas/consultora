(function () {
  const CARD_COLUMN_LIMIT = 8;

  function cleanLabel(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function tableHeaders(table) {
    return Array.from(table.querySelectorAll('thead tr:last-child th')).map(cell => cleanLabel(cell.textContent));
  }

  function isComplexTable(table, headers) {
    return headers.length > CARD_COLUMN_LIMIT
      || Boolean(table.querySelector('tbody input, tbody select, tbody textarea, [contenteditable="true"]'))
      || Boolean(table.querySelector('thead [rowspan], thead [colspan]'))
      || table.dataset.koraResponsive === 'scroll';
  }

  // Presentation only. Keep each column's label and values on the same axis.
  // Never infer financial values or change the contents of a cell.
  function columnAlignment(label) {
    const name = cleanLabel(label).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (/^(estado|situacion|accion|acciones|autorizacion|foto|cantidad|cant\.?|unidades|operaciones|creditos|aliadas activas|payjoy|alo credit|krediya|caja)(\b|$)/.test(name)) return 'center';
    if (/^(saldo|costo|precio|pvp|pagamos|pago a|total a pagar|valor|monto|importe|facturado|utilidad|comision|bonificacion|bonos|abonos|cargos|contado|margen|participacion|sub\.)(\b|\s|$)/.test(name)) return 'right';
    return 'left';
  }

  function alignColumns(table, headers) {
    // Grouped headers and merged body rows have their own presentation.
    if (table.querySelector('thead [rowspan], thead [colspan]')) return;
    const alignments = headers.map(columnAlignment);
    table.querySelectorAll('thead tr:last-child th').forEach((cell, index) => {
      cell.dataset.koraAlign = alignments[index];
    });
    table.querySelectorAll('tbody tr, tfoot tr').forEach(row => {
      if (row.cells.length !== headers.length || Array.from(row.cells).some(cell => cell.colSpan > 1 || cell.rowSpan > 1)) return;
      Array.from(row.cells).forEach((cell, index) => { cell.dataset.koraAlign = alignments[index]; });
    });
  }

  function enhanceTable(table) {
    if (!(table instanceof HTMLTableElement)) return;
    const headers = tableHeaders(table);
    if (headers.length < 2) return;
    alignColumns(table, headers);

    const layout = isComplexTable(table, headers) ? 'scroll' : 'cards';
    table.classList.toggle('kora-responsive-cards', layout === 'cards');
    table.classList.toggle('kora-responsive-scroll', layout === 'scroll');
    table.dataset.koraResponsiveLayout = layout;

    if (layout !== 'cards') return;
    table.querySelectorAll('tbody tr, tfoot tr').forEach(row => {
      Array.from(row.cells).forEach((cell, index) => {
        if (!cell.hasAttribute('data-kora-label')) {
          cell.dataset.koraLabel = headers[index] || '';
        }
      });
    });
  }

  function enhanceTables(scope = document) {
    if (scope instanceof HTMLTableElement) enhanceTable(scope);
    scope.querySelectorAll?.('table').forEach(enhanceTable);
  }

  function observeTables() {
    const pendingTables = new Set();
    let scheduled = false;

    function schedule(table) {
      if (!(table instanceof HTMLTableElement)) return;
      pendingTables.add(table);
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        pendingTables.forEach(enhanceTable);
        pendingTables.clear();
        scheduled = false;
      });
    }

    const observer = new MutationObserver(records => {
      records.forEach(record => {
        schedule(record.target.closest?.('table'));
        record.addedNodes.forEach(node => {
          if (!(node instanceof Element)) return;
          if (node instanceof HTMLTableElement) schedule(node);
          node.querySelectorAll?.('table').forEach(schedule);
          schedule(node.closest('table'));
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function initialize() {
    document.body.classList.add('kora-responsive-ready');
    enhanceTables();
    observeTables();
  }

  window.KoraResponsive = Object.freeze({
    enhance: enhanceTables,
    version: '1.0.1',
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
