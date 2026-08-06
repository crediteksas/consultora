(function () {
  const MODULES = [
    { titulo: 'AURA', lucide: 'layout-dashboard', items: [
      { label: 'Panel general', href: 'index.html', lucide: 'layout-dashboard' },
    ] },
    { titulo: 'AGENTES', lucide: 'sparkles', items: [
      { label: 'Redes Sociales', href: 'creditek-agente-redes.html', lucide: 'image-plus' },
      { label: 'Sofía', href: 'creditek-agente-respuestas.html', lucide: 'messages-square' },
      { label: 'Meta Ads Intelligence', href: 'agente3-meta-ads.html', lucide: 'megaphone' },
      { label: 'Calendario de contenido', href: 'creditek-agente-calendario.html', lucide: 'calendar-days' },
    ] },
    { titulo: 'NEGOCIO', lucide: 'briefcase-business', items: [
      { label: 'Portal B2B', href: '../portal/index.html', lucide: 'shopping-bag' },
      { label: 'Configuración', href: 'index.html#configuracion', lucide: 'settings' },
    ] },
  ];

  const TITLES = {
    home: 'Panel general',
    'agent-1': 'Redes Sociales',
    'agent-3': 'Meta Ads Intelligence',
    'agent-4': 'Calendario de contenido',
    sofia: 'Sofía',
  };

  function mount() {
    const root = document.querySelector('[data-kora-shell-root]');
    const agentId = document.body.dataset.koraAgentId;
    if (!root || !agentId) return;
    if (window.self !== window.top) {
      root.classList.add('show');
      return;
    }
    if (agentId === 'home' || !window.KoraNavigation) return;
    const title = TITLES[agentId];
    const activeItem = MODULES.flatMap(module => module.items.map(item => ({
      ...item,
      group: module.titulo,
    }))).find(item => item.label === title);

    window.KoraNavigation.mount({
      root,
      modules: MODULES,
      activeItem,
      profile: { id: 'aura-session', nombre: 'AURA', rol: 'gerencia' },
      productName: 'AURA',
      stores: [],
      onLogout: () => { location.href = 'index.html'; },
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
