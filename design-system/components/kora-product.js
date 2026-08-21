(function () {
  document.documentElement.dataset.koraProduct = '1.0.0';
  document.documentElement.dataset.koraBrandVersion = '1.0.1';
  document.documentElement.dataset.koraEcosystem = '2.0.0';

  const KORA_BRAND_ASSETS = Object.freeze({
    appIcon: null,
    corporateFavicon: '/creditek/shared/branding/creditek-logo.png',
    creditekLogo: '/creditek/shared/branding/creditek-logo.png',
    startupImage: null,
  });
  const KORA_LUCIDE_URL = 'https://unpkg.com/lucide@1.27.0/dist/umd/lucide.min.js';

  function renderLucideIcons() {
    window.lucide?.createIcons?.({
      attrs: {
        'aria-hidden': 'true',
        'stroke-width': 1.8,
      },
    });
  }

  function ensureLucideIcons() {
    if (window.lucide?.createIcons) {
      renderLucideIcons();
      return;
    }
    const current = document.querySelector('script[data-kora-lucide]');
    if (current) {
      current.addEventListener('load', renderLucideIcons, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = KORA_LUCIDE_URL;
    script.defer = true;
    script.dataset.koraLucide = '1.27.0';
    script.addEventListener('load', renderLucideIcons, { once: true });
    document.head.appendChild(script);
  }

  function iconForLabel(label) {
    const value = label.toLocaleLowerCase('es');
    if (/cuadro de ventas/.test(value)) return 'shopping-cart';
    if (/cartera pendiente/.test(value)) return 'hand-coins';
    if (/inventario valorizado/.test(value)) return 'package-search';
    if (/cumplimiento de presupuesto/.test(value)) return 'target';
    if (/rentabilidad por tienda/.test(value)) return 'store';
    if (/rentabilidad por categoría/.test(value)) return 'tags';
    if (/utilidad creditek/.test(value)) return 'chart-no-axes-column-increasing';
    if (/crecimiento mes a mes/.test(value)) return 'trending-up';
    if (/top productos|slow movers/.test(value)) return 'trophy';
    if (/config|ajuste/.test(value)) return 'settings';
    if (/inventario|producto|bodega|pedido/.test(value)) return 'boxes';
    if (/campaña|publicidad|meta ads/.test(value)) return 'megaphone';
    if (/venta|gasto|costo|presupuesto|pago|cartera/.test(value)) return 'wallet';
    if (/reporte|análisis|tendencia|rendimiento|kpi/.test(value)) return 'bar-chart-3';
    if (/cliente|usuario|perfil/.test(value)) return 'users';
    if (/tienda|estado actual/.test(value)) return 'store';
    if (/copiar|documento|historial/.test(value)) return 'clipboard-list';
    if (/buscar/.test(value)) return 'search';
    if (/alerta|advertencia|novedad/.test(value)) return 'alert-triangle';
    if (/éxito|correct|cruzado|aprobado/.test(value)) return 'check-circle';
    if (/cerrar|bloque|seguridad|admin/.test(value)) return 'shield-check';
    if (/crear|generar/.test(value)) return 'sparkles';
    return 'circle-dot';
  }

  function replaceLeadingEmoji(element) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let textNode = walker.nextNode();
    while (textNode && !/^\s*\p{Extended_Pictographic}/u.test(textNode.nodeValue || '')) {
      textNode = walker.nextNode();
    }
    if (!textNode) return;
    const clean = (textNode.nodeValue || '')
      .replace(/^\s*[\p{Extended_Pictographic}\uFE0F\u200D]+\s*/u, '')
      .trimStart();
    const icon = document.createElement('i');
    icon.dataset.lucide = iconForLabel(clean || element.textContent);
    icon.className = 'kora-interface-icon';
    icon.setAttribute('aria-hidden', 'true');
    textNode.parentNode.insertBefore(icon, textNode);
    textNode.nodeValue = clean ? ` ${clean}` : '';
  }

  const KORA_INTERFACE_ICON_SELECTOR = [
    'button',
    '.budget-title',
    '.cierre-title',
    '.estado-mes-label',
    '.estado-real-header',
    '.excel-title',
    '.hist-titulo',
    '.kpi-label',
    '.modal-title',
    '.page-title',
    '.section-divider',
    '.section-title',
    '.table-title',
    'h1',
    'h2',
  ].join(', ');

  function normalizeInterfaceIcons(scope = document) {
    const iconOnly = '.nav-icon, .module-icon, .tool-icon, .cat-btn-emoji, .icono, .lock';
    scope.querySelectorAll?.(iconOnly).forEach(element => {
      if (!/\p{Extended_Pictographic}/u.test(element.textContent || '')) return;
      const icon = document.createElement('i');
      icon.dataset.lucide = iconForLabel(element.closest('button, a, article, section')?.textContent || element.textContent);
      icon.className = 'kora-interface-icon';
      icon.setAttribute('aria-hidden', 'true');
      element.replaceChildren(icon);
    });
    scope.querySelectorAll?.(KORA_INTERFACE_ICON_SELECTOR).forEach(replaceLeadingEmoji);
  }

  function observeInterfaceIcons() {
    const observer = new MutationObserver(records => {
      records.forEach(record => {
        const element = record.target.nodeType === Node.TEXT_NODE
          ? record.target.parentElement
          : record.target;
        if (!(element instanceof Element)) return;
        const target = element.matches(KORA_INTERFACE_ICON_SELECTOR)
          ? element
          : element.closest(KORA_INTERFACE_ICON_SELECTOR);
        if (target && /\p{Extended_Pictographic}/u.test(target.textContent || '')) {
          replaceLeadingEmoji(target);
          renderLucideIcons();
        }
      });
    });
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
  }

  function ensureBrandMetadata() {
    if (document.head.querySelector('link[rel~="icon"]')) return;
    const favicon = document.createElement('link');
    favicon.rel = 'icon';
    favicon.type = 'image/png';
    favicon.href = KORA_BRAND_ASSETS.corporateFavicon;
    document.head.appendChild(favicon);
  }

  function brandTemplate(variant, productName) {
    const compact = variant === 'sidebar-collapsed';
    const signature = variant === 'public' ? 'Una solución de' : 'by';
    return `
      <span class="kora-brand__product" aria-hidden="true">${productName}</span>
      <span class="kora-brand__signature" aria-hidden="true">${signature}</span>
      <span class="kora-brand__logo-frame${compact ? ' kora-brand__logo-frame--compact' : ''}" aria-hidden="true">
        <span class="kora-brand__logo-crop">
          <img class="kora-brand__logo" src="${KORA_BRAND_ASSETS.creditekLogo}" alt="" width="1906" height="825">
        </span>
      </span>`;
  }

  function renderBrand(root) {
    if (!(root instanceof Element) || root.dataset.koraBrandReady === 'true') return;
    const variant = root.dataset.variant || 'public';
    const productName = root.dataset.productName || 'KORA';
    root.classList.add('kora-brand', `kora-brand--${variant}`);
    root.setAttribute('role', 'img');
    root.setAttribute('aria-label', `${productName} — Creditek`);
    root.innerHTML = brandTemplate(variant, productName);
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

  const AUDIO_DEFAULTS = Object.freeze({
    enabled: false,
    error: true,
    interaction: true,
    success: true,
    volume: 0.18,
  });
  let audioUser = 'anonymous';
  let audioSettings = { ...AUDIO_DEFAULTS };
  let audioContext;
  let audioReturnFocus;

  function audioStorageKey() {
    return `kora_ui_audio:${encodeURIComponent(audioUser)}`;
  }

  function loadAudioSettings() {
    try {
      const stored = JSON.parse(localStorage.getItem(audioStorageKey()) || '{}');
      audioSettings = {
        ...AUDIO_DEFAULTS,
        ...stored,
        enabled: stored.enabled === true,
        volume: Math.min(0.35, Math.max(0, Number(stored.volume ?? AUDIO_DEFAULTS.volume))),
      };
    } catch (_) {
      audioSettings = { ...AUDIO_DEFAULTS };
    }
    syncAudioSettings();
  }

  function saveAudioSettings() {
    localStorage.setItem(audioStorageKey(), JSON.stringify(audioSettings));
  }

  function soundPattern(type) {
    if (type === 'success') return [[520, 0, 0.07], [680, 0.08, 0.09]];
    if (type === 'error') return [[240, 0, 0.1], [190, 0.11, 0.12]];
    if (type === 'alert') return [[420, 0, 0.08], [420, 0.12, 0.08]];
    if (type === 'complete') return [[440, 0, 0.06], [580, 0.07, 0.06], [720, 0.14, 0.1]];
    return [[360, 0, 0.045]];
  }

  function playSound(type = 'interaction', force = false) {
    if (!force && (!audioSettings.enabled || audioSettings[type] === false)) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches && type === 'interaction') return;
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    audioContext ||= new Context();
    const start = audioContext.currentTime;
    soundPattern(type).forEach(([frequency, delay, duration]) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = type === 'error' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, start + delay);
      gain.gain.setValueAtTime(0.0001, start + delay);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, audioSettings.volume * 0.08), start + delay + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + delay + duration);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(start + delay);
      oscillator.stop(start + delay + duration + 0.01);
    });
  }

  function audioPanelTemplate() {
    return `<div class="kora-audio-backdrop" data-kora-audio-close></div>
      <section class="kora-audio-dialog" role="document" aria-labelledby="koraAudioTitle">
        <header class="kora-audio-header">
          <div><span class="kora-audio-eyebrow">Configuración · Experiencia</span>
            <h2 id="koraAudioTitle">Sonidos del sistema</h2>
            <p>Señales breves para acciones importantes. Permanecen desactivadas hasta que decidas activarlas.</p>
          </div>
          <button class="kora-icon-button" type="button" data-kora-audio-close aria-label="Cerrar configuración"><span aria-hidden="true">×</span></button>
        </header>
        <div class="kora-audio-body">
          <label class="kora-audio-setting"><span><strong>Activar sonidos</strong><small>Preferencia guardada únicamente para este usuario.</small></span>
            <input type="checkbox" data-kora-audio-enabled></label>
          <label class="kora-audio-volume"><span><strong>Volumen</strong><output data-kora-audio-volume-output>18%</output></span>
            <input type="range" min="0" max="35" step="1" value="18" data-kora-audio-volume></label>
          <div class="kora-audio-grid" aria-label="Tipos de sonido">
            <label><input type="checkbox" data-kora-audio-kind="interaction"><span>Interacción</span></label>
            <button type="button" class="secondary" data-kora-audio-preview="interaction">Probar</button>
            <label><input type="checkbox" data-kora-audio-kind="success"><span>Éxito y proceso terminado</span></label>
            <button type="button" class="secondary" data-kora-audio-preview="success">Probar</button>
            <label><input type="checkbox" data-kora-audio-kind="error"><span>Error y alerta importante</span></label>
            <button type="button" class="secondary" data-kora-audio-preview="error">Probar</button>
          </div>
        </div>
      </section>`;
  }

  function ensureAudioPanel() {
    let panel = document.getElementById('koraAudioPanel');
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = 'koraAudioPanel';
    panel.className = 'kora-audio-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.innerHTML = audioPanelTemplate();
    document.body.appendChild(panel);
    panel.querySelectorAll('[data-kora-audio-close]').forEach(node => node.addEventListener('click', closeAudioSettings));
    panel.querySelector('[data-kora-audio-enabled]').addEventListener('change', event => {
      audioSettings.enabled = event.target.checked;
      saveAudioSettings();
      if (audioSettings.enabled) playSound('success');
    });
    panel.querySelector('[data-kora-audio-volume]').addEventListener('input', event => {
      audioSettings.volume = Number(event.target.value) / 100;
      saveAudioSettings();
      syncAudioSettings();
    });
    panel.querySelectorAll('[data-kora-audio-kind]').forEach(input => input.addEventListener('change', event => {
      audioSettings[event.target.dataset.koraAudioKind] = event.target.checked;
      saveAudioSettings();
    }));
    panel.querySelectorAll('[data-kora-audio-preview]').forEach(button => button.addEventListener('click', () => {
      playSound(button.dataset.koraAudioPreview, true);
    }));
    return panel;
  }

  function syncAudioSettings() {
    const panel = document.getElementById('koraAudioPanel');
    if (!panel) return;
    panel.querySelector('[data-kora-audio-enabled]').checked = audioSettings.enabled;
    const volume = Math.round(audioSettings.volume * 100);
    panel.querySelector('[data-kora-audio-volume]').value = String(volume);
    panel.querySelector('[data-kora-audio-volume-output]').textContent = `${volume}%`;
    panel.querySelectorAll('[data-kora-audio-kind]').forEach(input => {
      input.checked = audioSettings[input.dataset.koraAudioKind] !== false;
    });
  }

  function openAudioSettings(trigger) {
    const panel = ensureAudioPanel();
    audioReturnFocus = trigger || document.activeElement;
    syncAudioSettings();
    panel.hidden = false;
    document.body.classList.add('kora-overlay-open');
    panel.querySelector('[data-kora-audio-enabled]').focus();
  }

  function closeAudioSettings() {
    const panel = document.getElementById('koraAudioPanel');
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    document.body.classList.remove('kora-overlay-open');
    audioReturnFocus?.focus?.();
  }

  function observeFeedbackSounds() {
    const observer = new MutationObserver(records => {
      records.forEach(record => {
        const node = record.target;
        if (!(node instanceof Element)) return;
        const visible = node.classList.contains('show') || node.getAttribute('open') !== null;
        if (!visible || node.dataset.koraSoundPlayed === 'true') return;
        const text = node.textContent.toLocaleLowerCase('es');
        const type = /error|fall|rechaz|inválid|no fue posible/.test(text) ? 'error' : 'success';
        node.dataset.koraSoundPlayed = 'true';
        playSound(type);
      });
    });
    document.querySelectorAll('.toast, .alert, [role="alert"], [role="status"]').forEach(node => {
      observer.observe(node, { attributes: true, attributeFilter: ['class', 'open'] });
    });
  }

  window.KoraAudio = Object.freeze({
    closeSettings: closeAudioSettings,
    openSettings: openAudioSettings,
    play: playSound,
    setUser(user) {
      audioUser = String(user || 'anonymous');
      loadAudioSettings();
    },
    version: '1.0.0',
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
      table.querySelectorAll('tbody td').forEach(cell => {
        const value = cell.textContent.trim();
        if (/^-?[$€£]?\s?[\d.,]+%?$/.test(value)) cell.classList.add('kora-numeric');
      });
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
    normalizeInterfaceIcons();
    observeInterfaceIcons();
    enhanceTables();
    enhanceControls();
    enhanceOverlays();
    ensureAudioPanel();
    loadAudioSettings();
    observeFeedbackSounds();
    document.addEventListener('click', event => {
      const settingsTrigger = event.target.closest('[data-kora-audio-settings]');
      if (settingsTrigger) {
        event.preventDefault();
        openAudioSettings(settingsTrigger);
        return;
      }
      if (event.target.closest('[data-kora-sound="interaction"], .kora-nav-link')) playSound('interaction');
      if (event.target.closest('button[type="submit"], .btn-primary, .guardar-btn, .submit-btn, .login-btn')) playSound('interaction');
    });
    document.addEventListener('keydown', event => {
      const panel = document.getElementById('koraAudioPanel');
      if (event.key === 'Escape') closeAudioSettings();
      if (event.key !== 'Tab' || !panel || panel.hidden) return;
      const focusable = Array.from(panel.querySelectorAll('button:not([disabled]), input:not([disabled])'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    ensureLucideIcons();
    requestAnimationFrame(() => document.documentElement.classList.add('kora-visual-ready'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
  document.dispatchEvent(new CustomEvent('kora-brand-ready'));
})();
