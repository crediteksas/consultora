(function installAuraResponsive(document, window) {
  'use strict';

  const page = document.body?.dataset.auraPage;
  if (page !== 'sofia') return;

  const phone = window.matchMedia('(max-width: 47.999rem)');
  const narrow = window.matchMedia('(max-width: 74.999rem)');
  const main = document.querySelector('.main');
  const rightPanel = document.getElementById('right-panel');
  if (!main || !rightPanel) return;

  const setPane = pane => {
    if (phone.matches) document.body.dataset.sofiaPane = pane;
    else document.body.removeAttribute('data-sofia-pane');
  };

  const button = (label, icon, className) => {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = `aura-pane-button ${className}`;
    node.innerHTML = `<i class="ti ti-${icon}" aria-hidden="true"></i><span>${label}</span>`;
    return node;
  };

  const closeProfile = () => rightPanel.classList.remove('show');
  const enhanceProfile = () => {
    if (!rightPanel.classList.contains('show')) return;
    if (rightPanel.querySelector('.aura-panel-close')) return;
    const close = button('Cerrar', 'x', 'aura-panel-close');
    close.setAttribute('aria-label', 'Cerrar información del cliente');
    close.addEventListener('click', closeProfile);
    rightPanel.prepend(close);
  };

  const enhanceChat = () => {
    const header = document.querySelector('#chat-area .chat-header');
    if (!header || header.querySelector('.aura-chat-tools')) return;
    const tools = document.createElement('div');
    tools.className = 'aura-chat-tools';
    const back = button('Conversaciones', 'arrow-left', 'aura-chat-back');
    const details = button('Detalles', 'user-circle', 'aura-chat-details');
    back.addEventListener('click', () => { closeProfile(); setPane('list'); });
    details.addEventListener('click', () => { rightPanel.classList.add('show'); enhanceProfile(); });
    tools.append(back, details);
    header.prepend(tools);
  };

  document.addEventListener('click', event => {
    if (event.target.closest('.conv-item')) {
      window.requestAnimationFrame(() => { setPane('chat'); enhanceChat(); enhanceProfile(); });
      return;
    }
    const tab = event.target.closest('.sidebar-tab');
    if (tab) window.requestAnimationFrame(() => setPane(tab.matches(':first-child') ? 'list' : 'table'));
  });

  const originalOpenChat = window.openChat;
  if (typeof originalOpenChat === 'function') {
    window.openChat = function responsiveOpenChat(...args) {
      const result = originalOpenChat.apply(this, args);
      window.requestAnimationFrame(() => { setPane('chat'); enhanceChat(); enhanceProfile(); });
      return result;
    };
  }

  const originalSwitchView = window.switchView;
  if (typeof originalSwitchView === 'function') {
    window.switchView = function responsiveSwitchView(view, ...args) {
      const result = originalSwitchView.call(this, view, ...args);
      window.requestAnimationFrame(() => setPane(view === 'chats' || view === 'intervention' ? 'list' : 'table'));
      return result;
    };
  }

  new MutationObserver(() => { enhanceChat(); enhanceProfile(); }).observe(main, {
    subtree: true, childList: true, attributes: true, attributeFilter: ['class'],
  });

  const sync = () => {
    if (phone.matches && !document.body.dataset.sofiaPane) setPane('list');
    if (!phone.matches) document.body.removeAttribute('data-sofia-pane');
  };
  phone.addEventListener?.('change', sync);
  narrow.addEventListener?.('change', sync);
  sync();
}(document, window));
