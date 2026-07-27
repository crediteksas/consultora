(function () {
  document.documentElement.dataset.koraProduct = '1.0.0';
  document.documentElement.dataset.koraBrandVersion = '1.0.1';

  const KORA_BRAND_ASSETS = Object.freeze({
    appIcon: null,
    corporateFavicon: '/creditek/agentes/logos/creditek_logo_corregido_alta.png',
    creditekLogo: '/creditek/agentes/logos/creditek_logo_corregido_alta.png',
    startupImage: null,
  });

  function ensureBrandMetadata() {
    if (document.head.querySelector('link[rel~="icon"]')) return;
    const favicon = document.createElement('link');
    favicon.rel = 'icon';
    favicon.type = 'image/png';
    favicon.href = KORA_BRAND_ASSETS.corporateFavicon;
    document.head.appendChild(favicon);
  }

  function brandTemplate(variant) {
    const compact = variant === 'sidebar-collapsed';
    const signature = variant === 'public' ? 'Una solución de' : 'by';
    return `
      <span class="kora-brand__product" aria-hidden="true">KORA</span>
      <span class="kora-brand__signature" aria-hidden="true">${signature}</span>
      <span class="kora-brand__logo-frame${compact ? ' kora-brand__logo-frame--compact' : ''}" aria-hidden="true">
        <img class="kora-brand__logo" src="${KORA_BRAND_ASSETS.creditekLogo}" alt="" width="1906" height="825">
      </span>`;
  }

  function renderBrand(root) {
    if (!(root instanceof Element) || root.dataset.koraBrandReady === 'true') return;
    const variant = root.dataset.variant || 'public';
    root.classList.add('kora-brand', `kora-brand--${variant}`);
    root.setAttribute('role', 'img');
    root.setAttribute('aria-label', 'KORA — Creditek');
    root.innerHTML = brandTemplate(variant);
    root.dataset.koraBrandReady = 'true';
  }

  function renderBrands(scope = document) {
    scope.querySelectorAll('[data-kora-brand]').forEach(renderBrand);
  }

  window.KoraBrand = Object.freeze({
    assets: KORA_BRAND_ASSETS,
    render: renderBrand,
    renderAll: renderBrands,
    version: '1.0.1',
  });

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
    ensureBrandMetadata();
    renderBrands();
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
  document.dispatchEvent(new CustomEvent('kora-brand-ready'));
})();
