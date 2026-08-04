(function () {
  const MODULES = [
    { titulo: 'AURA', lucide: 'layout-dashboard', items: [
      { label: 'Inicio', href: 'index.html', lucide: 'house' },
    ] },
    { titulo: 'AGENTES', lucide: 'sparkles', items: [
      { label: 'Sofía', href: 'sofia-aura-20260803b.html', lucide: 'messages-square' },
      { label: 'Agente 1 · Piezas comerciales', href: 'creditek-agente-redes.html', lucide: 'palette' },
      { label: 'Agente 3 · Publicación y métricas', href: 'agente3-meta-ads.html', lucide: 'chart-spline' },
      { label: 'Agente 4 · Reels orgánicos', href: 'creditek-agente-calendario.html', lucide: 'clapperboard' },
    ] },
    { titulo: 'NEGOCIO', lucide: 'briefcase-business', items: [
      { label: 'Portal B2B', href: '../portal/index.html', lucide: 'shopping-bag' },
      { label: 'Reportes', href: '../erp/reportes.html', lucide: 'file-chart-column-increasing' },
      { label: 'Configuración', href: 'index.html#configuracion', lucide: 'settings' },
    ] },
  ];

  const TITLES = {
    'agent-1': 'Agente 1 · Piezas comerciales',
    'agent-3': 'Agente 3 · Publicación y métricas',
    'agent-4': 'Agente 4 · Reels orgánicos',
    sofia: 'Sofía',
  };

  function mount() {
    const root = document.querySelector('[data-kora-shell-root]');
    const agentId = document.body.dataset.koraAgentId;
    if (!root || !agentId || !window.KoraNavigation) return;
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
