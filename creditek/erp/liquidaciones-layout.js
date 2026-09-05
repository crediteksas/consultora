/* Keeps semantic column labels when tab data reflows into a vertical layout. */
(() => {
  function labelTables() {
    document.querySelectorAll('#liquidationsContent .batches-table table,#detail > .table-wrap table').forEach((table) => {
      const headers = Array.from(table.querySelectorAll('thead th'), (cell) => cell.textContent.trim());
      table.classList.toggle('data-reflow-table', headers.length > 1);
      if (headers.length > 1) table.querySelectorAll('tbody > tr').forEach((row) => {
        Array.from(row.children).forEach((cell, index) => cell.dataset.label = headers[index] || '');
      });
      const region = table.closest('[role="region"]');
      if (region) region.setAttribute('aria-label', table.closest('.batches-table') ? 'Liquidaciones' : 'Detalle de la liquidación');
    });
  }
  function mount() {
    const root = document.getElementById('liquidationsContent');
    if (!root) return;
    labelTables();
    new MutationObserver(labelTables).observe(root, { childList:true, subtree:true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once:true});
  else mount();
})();
