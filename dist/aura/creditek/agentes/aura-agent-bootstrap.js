(function (global) {
  'use strict';

  const params = new URLSearchParams(location.search);
  const embedded = params.get('embedded') === '1' || global.self !== global.top;

  function revealEmbeddedContent() {
    document.documentElement.classList.add('aura-embedded');
    const root = document.querySelector('[data-aura-agent-root], #app');
    root?.classList.add('show');
  }

  if (embedded) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', revealEmbeddedContent, { once: true });
    } else {
      revealEmbeddedContent();
    }
    return;
  }

  const returnTo = `${location.pathname}${params.size ? location.search : ''}`;
  location.replace(`/creditek/agentes/?return_to=${encodeURIComponent(returnTo)}`);
})(typeof window !== 'undefined' ? window : globalThis);
