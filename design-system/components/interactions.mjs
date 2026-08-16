const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const previousDisabledState = new WeakMap();
const triggerByOverlay = new WeakMap();

export function getNextTabIndex(currentIndex, total, key) {
  if (total <= 0) return 0;
  if (key === 'Home') return 0;
  if (key === 'End') return total - 1;
  if (key === 'ArrowRight' || key === 'ArrowDown') return (currentIndex + 1) % total;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (currentIndex - 1 + total) % total;
  return currentIndex;
}

export function setButtonLoading(button, loading) {
  if (!button) return;

  if (loading) {
    if (!previousDisabledState.has(button)) {
      previousDisabledState.set(button, Boolean(button.disabled));
    }
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    return;
  }

  button.disabled = previousDisabledState.get(button) ?? false;
  previousDisabledState.delete(button);
  button.removeAttribute('aria-busy');
}

function focusableElements(container) {
  return [...container.querySelectorAll(focusableSelector)]
    .filter(element => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true');
}

function trapFocus(event, container) {
  if (event.key !== 'Tab') return;
  const elements = focusableElements(container);
  if (!elements.length) {
    event.preventDefault();
    container.focus();
    return;
  }

  const first = elements[0];
  const last = elements[elements.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function openOverlay(overlay, trigger) {
  if (!overlay) return;
  if (trigger) triggerByOverlay.set(overlay, trigger);
  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');
  document.documentElement.style.overflow = 'hidden';
  const first = focusableElements(overlay)[0];
  (first || overlay).focus();
}

export function closeOverlay(overlay) {
  if (!overlay) return;
  overlay.hidden = true;
  overlay.setAttribute('aria-hidden', 'true');
  document.documentElement.style.removeProperty('overflow');
  triggerByOverlay.get(overlay)?.focus();
  triggerByOverlay.delete(overlay);
}

function initTabs(root) {
  root.querySelectorAll('[data-ctk-tabs]').forEach(tablist => {
    const tabs = [...tablist.querySelectorAll('[role="tab"]')];
    tabs.forEach((tab, index) => {
      tab.addEventListener('keydown', event => {
        const nextIndex = getNextTabIndex(index, tabs.length, event.key);
        if (nextIndex === index && !['Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        tabs[nextIndex].focus();
      });
      tab.addEventListener('click', () => {
        tabs.forEach(item => {
          const selected = item === tab;
          item.setAttribute('aria-selected', String(selected));
          item.tabIndex = selected ? 0 : -1;
          const panel = document.getElementById(item.getAttribute('aria-controls'));
          if (panel) panel.hidden = !selected;
        });
      });
    });
  });
}

function initOverlays(root) {
  root.addEventListener('click', event => {
    const opener = event.target.closest('[data-ctk-open]');
    if (opener) {
      const overlay = document.getElementById(opener.dataset.ctkOpen);
      openOverlay(overlay, opener);
      return;
    }

    const closer = event.target.closest('[data-ctk-close]');
    if (closer) closeOverlay(closer.closest('[data-ctk-overlay]'));
  });

  root.querySelectorAll('[data-ctk-overlay]').forEach(overlay => {
    overlay.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeOverlay(overlay);
      } else {
        trapFocus(event, overlay);
      }
    });
  });
}

function initDropdowns(root) {
  root.addEventListener('click', event => {
    const trigger = event.target.closest('[data-ctk-dropdown-trigger]');
    root.querySelectorAll('[data-ctk-dropdown-menu]').forEach(menu => {
      const ownsMenu = trigger?.getAttribute('aria-controls') === menu.id;
      menu.hidden = !ownsMenu || !menu.hidden;
      if (ownsMenu) trigger.setAttribute('aria-expanded', String(!menu.hidden));
    });
  });

  root.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    root.querySelectorAll('[data-ctk-dropdown-menu]:not([hidden])').forEach(menu => {
      menu.hidden = true;
      const trigger = root.querySelector(`[aria-controls="${menu.id}"]`);
      trigger?.setAttribute('aria-expanded', 'false');
      trigger?.focus();
    });
  });
}

export function createToast(message, options = {}) {
  const region = document.querySelector('[data-ctk-toast-region]');
  if (!region) throw new Error('Falta una región data-ctk-toast-region');

  const toast = document.createElement('div');
  toast.className = 'ctk-toast ctk-motion-enter';
  toast.setAttribute('role', options.status === 'danger' ? 'alert' : 'status');
  toast.textContent = message;
  region.appendChild(toast);

  const timeout = options.timeout ?? 5000;
  if (timeout > 0) window.setTimeout(() => toast.remove(), timeout);
  return toast;
}

export function initCreditekDesignSystem(root = document) {
  initTabs(root);
  initOverlays(root);
  initDropdowns(root);
}
