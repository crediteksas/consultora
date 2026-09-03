(function installAuraShell(root) {
  'use strict';

  const AURA_VERSION = '4.1.0';
  const TOOLTIP_DELAY_MS = 2_500;
  const LUCIDE_URL = 'https://unpkg.com/lucide@1.27.0/dist/umd/lucide.min.js';
  const MODULES = [
    { title: 'PRINCIPAL', icon: 'layout-dashboard', items: [
      { label: 'Dashboard', action: 'dashboard', icon: 'layout-dashboard' },
    ] },
    { title: 'AGENTES IA', icon: 'sparkles', items: [
      { label: 'Diseño', action: 'module', href: 'creditek-agente-redes.html', icon: 'palette' },
      { label: 'Respuestas', action: 'module', href: 'creditek-agente-respuestas.html', icon: 'messages-square' },
      { label: 'Meta Ads', action: 'module', href: 'agente3-meta-ads.html', icon: 'chart-spline' },
      { label: 'Calendario', action: 'module', href: 'creditek-agente-calendario.html', icon: 'calendar-days' },
    ] },
    { title: 'COMERCIAL', icon: 'briefcase-business', items: [
      { label: 'Google Business', action: 'module', href: 'creditek-gbp-fichas.html', icon: 'map-pin' },
      { label: 'Convenios de Aliados', action: 'external', target: 'convenios', icon: 'handshake' },
    ] },
    { title: 'SISTEMA', icon: 'settings', items: [
      { label: 'Configuración', action: 'configuration', icon: 'settings' },
    ] },
  ];

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[character]));
  }

  function staticIcon(name) {
    const paths = {
      menu: '<path d="M4 12h16"></path><path d="M4 6h16"></path><path d="M4 18h16"></path>',
      'panel-left-close': '<rect width="18" height="18" x="3" y="3" rx="2"></rect><path d="M9 3v18"></path><path d="m16 15-3-3 3-3"></path>',
      'panel-left-open': '<rect width="18" height="18" x="3" y="3" rx="2"></rect><path d="M9 3v18"></path><path d="m14 9 3 3-3 3"></path>',
      sliders: '<line x1="21" x2="14" y1="4" y2="4"></line><line x1="10" x2="3" y1="4" y2="4"></line><line x1="21" x2="12" y1="12" y2="12"></line><line x1="8" x2="3" y1="12" y2="12"></line><line x1="21" x2="16" y1="20" y2="20"></line><line x1="12" x2="3" y1="20" y2="20"></line>',
      bell: '<path d="M10.268 21a2 2 0 0 0 3.464 0"></path><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"></path>',
      x: '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>',
    };
    return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
  }

  function installAssets() {
    if (!document.getElementById('auraShellStyles')) {
      const link = document.createElement('link');
      link.id = 'auraShellStyles';
      link.rel = 'stylesheet';
      link.href = '/design-system/components/kora-shell.css';
      document.head.appendChild(link);
    }
    if (!document.getElementById('auraLucide')) {
      const script = document.createElement('script');
      script.id = 'auraLucide';
      script.src = LUCIDE_URL;
      script.defer = true;
      script.addEventListener('load', () => root.lucide?.createIcons());
      document.head.appendChild(script);
    }
  }

  function navigationHtml(activeItem) {
    return MODULES.map(module => {
      const open = module.items.includes(activeItem);
      return `<section class="kora-nav-group" data-open="${open}">
        <button class="kora-nav-group__label ghost" type="button" aria-expanded="${open}" data-kora-tooltip="${escapeHtml(module.title)}">
          <i data-lucide="${module.icon}"></i><span>${escapeHtml(module.title)}</span><i data-lucide="chevron-down"></i>
        </button>
        <div class="kora-nav-group__items">${module.items.map(item => `<a class="kora-nav-link" href="#" ${item === activeItem ? 'aria-current="page"' : ''}
          data-kora-action="${item.action}" data-kora-href="${escapeHtml(item.href || '')}" data-kora-target="${escapeHtml(item.target || '')}"
          data-kora-title="${escapeHtml(item.label)}" data-kora-tooltip="${escapeHtml(item.label)}" data-kora-sound="interaction">
          <i data-lucide="${item.icon}"></i><span class="kora-nav-text">${escapeHtml(item.label)}</span></a>`).join('')}</div>
      </section>`;
    }).join('');
  }

  function setContext(title, breadcrumbs = ['AURA', title]) {
    const shell = document.querySelector('.kora-shell-root');
    const titleNode = shell?.querySelector('.kora-topbar__title');
    const breadcrumb = shell?.querySelector('.kora-breadcrumb');
    if (titleNode) titleNode.textContent = title;
    if (breadcrumb) breadcrumb.innerHTML = breadcrumbs.filter(Boolean).map((item, index, list) =>
      `<li ${index === list.length - 1 ? 'aria-current="page"' : ''}>${escapeHtml(item)}</li>`).join('');
  }

  function installDelayedTooltips(shell) {
    const tooltip = document.createElement('div');
    tooltip.className = 'kora-delayed-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.hidden = true;
    document.body.appendChild(tooltip);
    let timer;
    const hide = () => { clearTimeout(timer); tooltip.hidden = true; };
    const show = element => {
      hide();
      timer = setTimeout(() => {
        if (!element.isConnected) return;
        tooltip.textContent = element.dataset.koraTooltip;
        tooltip.hidden = false;
        const anchor = element.getBoundingClientRect();
        tooltip.style.left = `${Math.min(innerWidth - tooltip.offsetWidth - 12, anchor.right + 10)}px`;
        tooltip.style.top = `${Math.max(12, anchor.top)}px`;
      }, TOOLTIP_DELAY_MS);
    };
    shell.querySelectorAll('[data-kora-tooltip]').forEach(element => {
      element.addEventListener('mouseenter', () => show(element));
      element.addEventListener('focus', () => show(element));
      element.addEventListener('mouseleave', hide);
      element.addEventListener('blur', hide);
      element.addEventListener('click', hide);
    });
  }

  function mountKoraShell({ root: app, profile, modules = MODULES, activeItem = modules[0].items[0], onLogout, productName = 'AURA' }) {
    if (!app || app.dataset.koraMounted === 'true') return;
    installAssets();
    app.querySelector(':scope > .sidebar')?.remove();
    app.querySelector(':scope > .main-area > .topbar')?.remove();
    const children = Array.from(app.children);
    const main = document.createElement('div');
    main.className = 'kora-shell-main';
    main.innerHTML = `<header class="kora-topbar">
      <button class="kora-icon-button kora-navigation-toggle ghost" type="button" aria-label="Colapsar navegación" data-kora-tooltip="Colapsar navegación">${staticIcon('panel-left-close')}</button>
      <div class="kora-topbar__context"><h1 class="kora-topbar__title">${escapeHtml(activeItem.label)}</h1>
        <ol class="kora-breadcrumb" aria-label="Breadcrumb"><li>${productName}</li><li>PRINCIPAL</li><li aria-current="page">${escapeHtml(activeItem.label)}</li></ol></div>
      <label class="kora-command"><span class="ctk-sr-only">Buscar módulo</span><i data-lucide="search"></i><input type="search" data-kora-command placeholder="Buscar módulo" autocomplete="off"></label>
      <div class="kora-topbar__actions">
        <span class="kora-extension" data-kora-connectivity data-state="online"><span class="kora-extension__dot"></span><span>En línea</span></span>
        <button class="kora-icon-button ghost" type="button" data-kora-audio-settings aria-label="Configuración de experiencia">${staticIcon('sliders')}</button>
        <button class="kora-icon-button ghost" type="button" data-aura-notifications aria-label="Notificaciones">${staticIcon('bell')}</button>
        <div class="kora-profile"><span class="ctk-avatar">${escapeHtml(profile.nombre.slice(0, 1))}</span><span class="kora-profile__copy"><span class="kora-profile__name">${escapeHtml(profile.nombre)}</span><span class="kora-profile__role">${escapeHtml(profile.rol)}</span></span></div>
      </div></header>`;
    const content = document.createElement('div');
    content.className = 'kora-shell-content';
    children.forEach(child => content.appendChild(child));
    main.appendChild(content);

    const aside = document.createElement('aside');
    aside.className = 'kora-sidebar';
    aside.setAttribute('aria-label', 'Navegación principal de AURA');
    aside.dataset.open = 'false';
    aside.innerHTML = `<div class="kora-sidebar__brand"><div data-kora-brand data-variant="sidebar" data-product-name="${productName}" title="${productName} — Creditek"></div>
      <button class="kora-icon-button kora-drawer-close ghost" type="button" aria-label="Cerrar navegación">${staticIcon('x')}</button></div>
      <nav class="kora-sidebar__nav">${navigationHtml(activeItem)}</nav>
      <div class="kora-sidebar__footer"><button class="kora-nav-link ghost" type="button" data-aura-about><i data-lucide="info"></i><span class="kora-nav-text">Acerca de AURA</span></button>
      <button class="kora-nav-link kora-logout ghost" type="button"><i data-lucide="log-out"></i><span class="kora-nav-text">Cerrar sesión</span></button></div>`;
    const overlay = document.createElement('div');
    overlay.className = 'kora-drawer-overlay';
    overlay.hidden = true;
    const dialog = document.createElement('dialog');
    dialog.setAttribute('aria-labelledby', 'auraAboutTitle');
    dialog.innerHTML = `<div class="aura-about"><p>Creditek</p><h2 id="auraAboutTitle">AURA v${AURA_VERSION}</h2><p>Shell independiente para agentes y herramientas comerciales.</p><button type="button" class="btn primary" data-aura-about-close>Cerrar</button></div>`;
    app.append(aside, main, overlay, dialog);
    app.classList.add('kora-shell-root');
    app.dataset.koraMounted = 'true';
    app.dataset.sidebarCollapsed = localStorage.getItem('aura_sidebar_collapsed') === 'true' ? 'true' : 'false';

    const renderBrand = () => {
      const marker = aside.querySelector('[data-kora-brand]');
      marker.dataset.variant = app.dataset.sidebarCollapsed === 'true' ? 'sidebar-collapsed' : 'sidebar';
      marker.dataset.productName = productName;
      marker.dataset.koraBrandReady = 'false';
      marker.replaceChildren();
      root.KoraBrand?.render?.(marker);
    };
    renderBrand();
    if (!root.KoraBrand) document.addEventListener('kora-brand-ready', renderBrand, { once: true });
    root.KoraAudio?.setUser?.('aura-portal');

    const closeDrawer = () => { aside.dataset.open = 'false'; aside.removeAttribute('role'); aside.removeAttribute('aria-modal'); overlay.hidden = true; };
    const openDrawer = () => { aside.dataset.open = 'true'; aside.setAttribute('role', 'dialog'); aside.setAttribute('aria-modal', 'true'); overlay.hidden = false; aside.querySelector('a,button')?.focus(); };
    aside.querySelector('.kora-drawer-close').addEventListener('click', closeDrawer);
    overlay.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeDrawer(); });
    const navigationControl = main.querySelector('.kora-navigation-toggle');
    const media = matchMedia('(max-width: 63.999rem)');
    const syncControl = () => {
      if (media.matches) {
        navigationControl.innerHTML = staticIcon('menu');
        navigationControl.setAttribute('aria-label', 'Abrir navegación');
      } else {
        const collapsed = app.dataset.sidebarCollapsed === 'true';
        navigationControl.innerHTML = staticIcon(collapsed ? 'panel-left-open' : 'panel-left-close');
        navigationControl.setAttribute('aria-label', collapsed ? 'Expandir navegación' : 'Colapsar navegación');
      }
    };
    navigationControl.addEventListener('click', () => {
      if (media.matches) return openDrawer();
      app.dataset.sidebarCollapsed = String(app.dataset.sidebarCollapsed !== 'true');
      localStorage.setItem('aura_sidebar_collapsed', app.dataset.sidebarCollapsed);
      renderBrand();
      syncControl();
    });
    media.addEventListener?.('change', syncControl);
    syncControl();

    aside.querySelectorAll('.kora-nav-group__label').forEach(button => button.addEventListener('click', () => {
      const group = button.closest('.kora-nav-group');
      group.dataset.open = String(group.dataset.open !== 'true');
      button.setAttribute('aria-expanded', group.dataset.open);
    }));
    aside.querySelectorAll('.kora-nav-link[data-kora-action]').forEach(link => link.addEventListener('click', event => {
      event.preventDefault();
      aside.querySelectorAll('[aria-current="page"]').forEach(node => node.removeAttribute('aria-current'));
      link.setAttribute('aria-current', 'page');
      const action = link.dataset.koraAction;
      const title = link.dataset.koraTitle;
      if (action === 'dashboard') root.showSection?.('dashboard', link);
      if (action === 'configuration') root.showSection?.('configuracion', link);
      if (action === 'module') root.openModule?.(link.dataset.koraHref, title, link);
      if (action === 'configured') root.openModule?.(root.AuraEnvironment.url(link.dataset.koraTarget), title, link);
      if (action === 'external') root.open(root.AuraEnvironment.url(link.dataset.koraTarget), '_blank', 'noopener');
      const group = link.closest('.kora-nav-group').querySelector('.kora-nav-group__label span').textContent;
      setContext(title, [productName, group, title]);
      closeDrawer();
    }));
    main.querySelector('[data-kora-command]').addEventListener('input', event => {
      const query = event.target.value.trim().toLocaleLowerCase('es');
      aside.querySelectorAll('.kora-nav-link[data-kora-action]').forEach(link => { link.hidden = Boolean(query && !link.textContent.toLocaleLowerCase('es').includes(query)); });
    });
    aside.querySelector('.kora-logout').addEventListener('click', onLogout);
    aside.querySelector('[data-aura-about]').addEventListener('click', () => dialog.showModal());
    dialog.querySelector('[data-aura-about-close]').addEventListener('click', () => dialog.close());
    main.querySelector('[data-aura-notifications]').addEventListener('click', () => root.showToast?.('No hay notificaciones nuevas'));
    installDelayedTooltips(app);
    root.lucide?.createIcons();
    requestAnimationFrame(() => { app.dataset.koraStable = 'true'; });
  }

  function mountPortal() {
    mountKoraShell({
      root: document.getElementById('app'),
      profile: { nombre: 'Oscar Pacheco', rol: 'Gerencia' },
      onLogout: () => root.doLogout?.(),
      productName: 'AURA',
    });
  }

  root.AuraNavigation = Object.freeze({ mountKoraShell, mountPortal, setContext, version: AURA_VERSION });
}(window));
