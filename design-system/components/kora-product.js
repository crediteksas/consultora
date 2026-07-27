(function () {
  document.documentElement.dataset.koraProduct = '1.0.0';

  function accessibleName(table, index) {
    const caption = table.querySelector('caption')?.textContent?.trim();
    const heading = table.closest('section, article, .panel, .card')
      ?.querySelector('h1, h2, h3, h4')?.textContent?.trim();
    return caption || heading || `Tabla de datos ${index + 1}`;
  }

  function enhanceTables() {
    document.querySelectorAll('table').forEach((table, index) => {
      if (table.closest('.kora-table-region, .ctk-table-wrap')) return;
      const wrapper = document.createElement('div');
      wrapper.classList.add('kora-table-region');
      wrapper.tabIndex = 0;
      wrapper.setAttribute('role', 'region');
      wrapper.setAttribute('aria-label', `${accessibleName(table, index)}; desplaza horizontalmente para ver todas las columnas`);
      table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    });
  }

  function enhanceControls() {
    document.querySelectorAll('button, [role="button"]').forEach(control => {
      if (control.getAttribute('aria-label') || control.textContent.trim()) return;
      const title = control.getAttribute('title');
      if (title) control.setAttribute('aria-label', title);
    });

    document.querySelectorAll('input, select, textarea').forEach((control, index) => {
      if (control.id && document.querySelector(`label[for="${CSS.escape(control.id)}"]`)) return;
      if (control.getAttribute('aria-label') || control.getAttribute('aria-labelledby')) return;
      const placeholder = control.getAttribute('placeholder');
      const name = control.getAttribute('name');
      control.setAttribute('aria-label', placeholder || name || `Campo ${index + 1}`);
    });
  }

  function enhanceOverlays() {
    document.querySelectorAll('.modal, .modal-content, .drawer, .panel-lateral').forEach(overlay => {
      if (!overlay.getAttribute('role')) overlay.setAttribute('role', 'dialog');
      if (!overlay.hasAttribute('aria-modal')) overlay.setAttribute('aria-modal', 'true');
    });
  }

  function initialize() {
    document.body.classList.add('kora-product-page');
    enhanceTables();
    enhanceControls();
    enhanceOverlays();
    window.lucide?.createIcons?.();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
