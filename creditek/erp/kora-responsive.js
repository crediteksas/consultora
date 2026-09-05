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

  function enhanceTable(table) {
    if (!(table instanceof HTMLTableElement)) return;
    const headers = tableHeaders(table);
    if (headers.length < 2) return;

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
    version: '1.0.0',
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
