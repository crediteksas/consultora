(function () {
  const NAVIGATION = [
    {
      title: 'Principal',
      items: [
        { label: 'Dashboard', icon: '⊞', href: 'index.html' },
      ],
    },
    {
      title: 'Agentes IA',
      items: [
        { label: 'Diseño', icon: '🎨', href: 'creditek-agente-redes.html', id: 'agent-design' },
        { label: 'Respuestas', icon: '💬', href: 'sofia-aura-20260803b.html' },
        { label: 'Meta Ads', icon: '📊', href: 'agente3-meta-ads.html' },
        { label: 'Calendario', icon: '📅', href: 'creditek-agente-calendario.html' },
      ],
    },
    {
      title: 'Comercial',
      items: [
        { label: 'Portal B2B', icon: '🛒', href: '/creditek/portal/' },
        { label: 'Google Business', icon: '📍', href: 'creditek-gbp-fichas.html' },
        { label: 'Convenios de Aliados', icon: '✍️', href: '../convenios/index.html' },
      ],
    },
    {
      title: 'Sistema',
      items: [
        { label: 'Configuración', icon: '⚙', href: 'index.html#configuracion' },
      ],
    },
  ];

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[character]));
  }

  function renderNavigation(activeId) {
    return NAVIGATION.map(group => `
      <div class="aura-shell-nav-group">
        <div class="aura-shell-nav-title">${escapeHtml(group.title)}</div>
        ${group.items.map(item => `
          <a href="${escapeHtml(item.href)}"${item.id === activeId ? ' aria-current="page"' : ''}>
            <span class="aura-shell-nav-icon" aria-hidden="true">${item.icon}</span>
            <span>${escapeHtml(item.label)}</span>
          </a>
        `).join('')}
      </div>
    `).join('');
  }

  function mountAuraShell() {
    const page = document.querySelector('[data-aura-shell-page]');
    const content = document.querySelector('.shell');
    if (!page || !content || document.querySelector('.aura-shell-layout')) return;

    const activeId = page.dataset.auraShellPage;
    const title = page.dataset.auraShellTitle || 'AURA';
    const context = page.dataset.auraShellContext || 'Ecosistema AURA';
    const layout = document.createElement('div');
    layout.className = 'aura-shell-layout';
    layout.dataset.menuOpen = 'false';
    layout.innerHTML = `
      <div class="aura-shell-overlay" data-aura-shell-close></div>
      <aside class="aura-shell-sidebar" aria-label="Navegación principal de AURA">
        <div class="aura-shell-brand">
          <img src="/creditek/agentes/logos/creditek_logo_corregido_alta.png" alt="Creditek">
          <strong>AURA</strong>
          <span>Ecosistema de agentes</span>
        </div>
        <nav class="aura-shell-nav">${renderNavigation(activeId)}</nav>
        <div class="aura-shell-footer"><a href="index.html">Volver al inicio</a></div>
      </aside>
      <main class="aura-shell-main">
        <header class="aura-shell-topbar">
          <button class="aura-shell-menu" type="button" aria-label="Abrir navegación" aria-expanded="false">☰</button>
          <span class="aura-shell-topbar-title">${escapeHtml(title)}</span>
          <span class="aura-shell-topbar-context">${escapeHtml(context)}</span>
          <span class="aura-shell-status">Sistema activo</span>
        </header>
        <div class="aura-shell-content"></div>
      </main>
    `;

    content.parentNode.insertBefore(layout, content);
    layout.querySelector('.aura-shell-content').appendChild(content);
    document.body.classList.add('aura-shell-enabled');

    const menu = layout.querySelector('.aura-shell-menu');
    const closeMenu = () => {
      layout.dataset.menuOpen = 'false';
      menu.setAttribute('aria-expanded', 'false');
    };
    menu.addEventListener('click', () => {
      const open = layout.dataset.menuOpen !== 'true';
      layout.dataset.menuOpen = String(open);
      menu.setAttribute('aria-expanded', String(open));
    });
    layout.querySelector('[data-aura-shell-close]').addEventListener('click', closeMenu);
    layout.querySelectorAll('.aura-shell-nav a').forEach(link => {
      link.addEventListener('click', closeMenu);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountAuraShell);
  } else {
    mountAuraShell();
  }
})();
