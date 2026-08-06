(function () {
  'use strict';

  const TARGET_SELECTOR = '[data-aura-help],[data-help],[title],button,a,input,select,textarea,[role="button"]';
  const TOOLTIP_ID = 'aura-context-tooltip';
  let activeTarget = null;
  let showTimer = null;

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function associatedLabel(control) {
    if (!control) return '';
    const wrappingLabel = control.closest?.('label');
    if (wrappingLabel) return cleanText(wrappingLabel.textContent);
    if (!control.id) return '';
    try {
      return cleanText(document.querySelector(`label[for="${CSS.escape(control.id)}"]`)?.textContent);
    } catch (_) {
      return '';
    }
  }

  function helpFor(target) {
    const explicit = cleanText(target.dataset?.auraHelp || target.dataset?.help || target.getAttribute?.('title'));
    if (explicit) return explicit;
    if (target.matches?.('input,select,textarea')) {
      const label = associatedLabel(target) || cleanText(target.getAttribute('aria-label')) || 'Este campo';
      const placeholder = cleanText(target.getAttribute('placeholder'));
      return placeholder
        ? `${label}. Ingresa o selecciona la información solicitada. Ejemplo: ${placeholder}`
        : `${label}. Ingresa o selecciona la información necesaria para continuar.`;
    }
    const name = cleanText(target.getAttribute?.('aria-label') || target.textContent);
    if (!name) return '';
    return target.matches?.('a') ? `${name}. Abre esta sección de AURA.` : `${name}. Ejecuta esta acción.`;
  }

  function ensureTooltip() {
    let tooltip = document.getElementById(TOOLTIP_ID);
    if (tooltip) return tooltip;
    const style = document.createElement('style');
    style.textContent = `
      .aura-context-tooltip{position:fixed;z-index:2147483000;max-width:min(320px,calc(100vw - 24px));padding:9px 11px;border-radius:9px;background:#0B1E3D;color:#fff;font:500 12px/1.45 'DM Sans',system-ui,sans-serif;box-shadow:0 10px 30px rgba(11,30,61,.24);pointer-events:none;opacity:0;transform:translateY(3px);transition:opacity .12s ease,transform .12s ease}
      .aura-context-tooltip.visible{opacity:1;transform:none}
    `;
    document.head.append(style);
    tooltip = document.createElement('div');
    tooltip.id = TOOLTIP_ID;
    tooltip.className = 'aura-context-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.hidden = true;
    document.body.append(tooltip);
    return tooltip;
  }

  function positionTooltip(tooltip, target) {
    const rect = target.getBoundingClientRect();
    const margin = 12;
    const width = tooltip.offsetWidth;
    const height = tooltip.offsetHeight;
    const left = Math.min(Math.max(margin, rect.left + (rect.width - width) / 2), window.innerWidth - width - margin);
    const below = rect.bottom + 8;
    const top = below + height <= window.innerHeight - margin ? below : Math.max(margin, rect.top - height - 8);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  function hideTooltip() {
    clearTimeout(showTimer);
    showTimer = null;
    activeTarget = null;
    const tooltip = document.getElementById(TOOLTIP_ID);
    if (!tooltip) return;
    tooltip.classList.remove('visible');
    tooltip.hidden = true;
  }

  function queueTooltip(target) {
    if (!target || target === activeTarget) return;
    hideTooltip();
    const text = helpFor(target);
    if (!text) return;
    activeTarget = target;
    showTimer = setTimeout(() => {
      if (activeTarget !== target || !target.isConnected) return;
      const tooltip = ensureTooltip();
      tooltip.textContent = text;
      tooltip.hidden = false;
      positionTooltip(tooltip, target);
      requestAnimationFrame(() => tooltip.classList.add('visible'));
    }, 420);
  }

  function targetFrom(event) {
    return event.target?.closest?.(TARGET_SELECTOR) || null;
  }

  document.addEventListener('pointerenter', event => queueTooltip(targetFrom(event)), true);
  document.addEventListener('pointerleave', event => {
    const target = targetFrom(event);
    if (target && target === activeTarget && !target.contains(event.relatedTarget)) hideTooltip();
  }, true);
  document.addEventListener('focusin', event => queueTooltip(targetFrom(event)));
  document.addEventListener('focusout', hideTooltip);
  document.addEventListener('click', hideTooltip, true);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hideTooltip(); });
  window.addEventListener('scroll', hideTooltip, true);
  window.addEventListener('resize', hideTooltip);
})();
