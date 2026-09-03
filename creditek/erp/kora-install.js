(function () {
  const APP_NAME = 'KORA';
  let deferredPrompt = null;

  function ensureMetadata() {
    const links = [
      ['manifest', '/creditek/erp/kora.webmanifest'],
      ['apple-touch-icon', '/creditek/erp/kora-icon-192.png'],
      ['icon', '/creditek/erp/kora-icon-192.png'],
    ];
    links.forEach(([rel, href]) => {
      if (document.head.querySelector(`link[rel="${rel}"]`)) return;
      const link = document.createElement('link'); link.rel = rel; link.href = href; document.head.appendChild(link);
    });
    if (!document.head.querySelector('meta[name="theme-color"]')) {
      const theme = document.createElement('meta'); theme.name = 'theme-color'; theme.content = '#0B1E3D'; document.head.appendChild(theme);
    }
    if (!document.head.querySelector('meta[name="apple-mobile-web-app-capable"]')) {
      const capable = document.createElement('meta'); capable.name = 'apple-mobile-web-app-capable'; capable.content = 'yes'; document.head.appendChild(capable);
    }
  }

  function ensureStyles() {
    if (document.getElementById('koraInstallStyles')) return;
    const style = document.createElement('style');
    style.id = 'koraInstallStyles';
    style.textContent = `
      #koraInstallDialog{border:0;padding:0;border-radius:24px;max-width:min(420px,calc(100vw - 32px));color:#0B1E3D;box-shadow:0 28px 80px rgba(11,30,61,.28)}
      #koraInstallDialog::backdrop{background:rgba(7,22,46,.58);backdrop-filter:blur(5px)}
      .kora-install-card{position:relative;padding:34px 32px 28px;text-align:center;font-family:'DM Sans',Arial,sans-serif;background:linear-gradient(160deg,#fff 58%,#F0FBFB)}
      .kora-install-card img{border-radius:20px;box-shadow:0 14px 30px rgba(11,30,61,.22)}
      .kora-install-eyebrow{margin:18px 0 5px;color:#008E96;font:800 11px Montserrat,Arial,sans-serif;letter-spacing:.18em}
      .kora-install-card h2{margin:0;font:800 25px Montserrat,Arial,sans-serif;letter-spacing:-.03em}
      .kora-install-card p{margin:10px auto 18px;max-width:330px;color:#526075;line-height:1.5;font-size:14px}
      .kora-install-card ol{display:none;margin:4px 0 20px;padding:14px 16px 14px 38px;text-align:left;background:#F4F7FA;border-radius:14px;color:#334155;font-size:13px;line-height:1.55}
      .kora-install-card ol:not(:empty){display:block}
      .kora-install-primary,.kora-install-secondary{width:100%;min-height:46px;border-radius:13px;font:700 14px 'DM Sans',Arial,sans-serif;cursor:pointer}
      .kora-install-primary{border:0;background:#00C4CC;color:#0B1E3D;box-shadow:0 10px 24px rgba(0,196,204,.24)}
      .kora-install-secondary{margin-top:8px;border:0;background:transparent;color:#526075}
      .kora-install-close{position:absolute;right:14px;top:12px;width:40px;height:40px;border:0;border-radius:50%;background:#F3F6F8;color:#0B1E3D;font-size:25px;cursor:pointer}
      .kora-install-nav{background:linear-gradient(135deg,#00C4CC,#20DCE2)!important;color:#07162E!important;font-weight:800!important;box-shadow:0 8px 18px rgba(0,196,204,.18)}
      .kora-install-nav[hidden]{display:none!important}
    `;
    document.head.appendChild(style);
  }

  function isStandalone() { return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true; }
  function platform() {
    const ua = navigator.userAgent || '';
    if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
    if (/android/i.test(ua)) return 'android';
    return 'desktop';
  }

  function dialog() {
    let element = document.getElementById('koraInstallDialog');
    if (element) return element;
    element = document.createElement('dialog');
    element.id = 'koraInstallDialog'; element.setAttribute('aria-labelledby', 'koraInstallTitle');
    element.innerHTML = `
      <form method="dialog" class="kora-install-card">
        <button class="kora-install-close" value="cancel" aria-label="Cerrar">×</button>
        <img src="/creditek/erp/kora-icon-192.png" alt="" width="84" height="84">
        <p class="kora-install-eyebrow">CREDITEK</p>
        <h2 id="koraInstallTitle">Lleva KORA contigo</h2>
        <p data-kora-install-copy>Instala KORA para abrirla desde tu escritorio o pantalla principal.</p>
        <ol data-kora-install-steps></ol>
        <button class="kora-install-primary" type="button" data-kora-install-confirm>Instalar KORA</button>
        <button class="kora-install-secondary" value="cancel">Ahora no</button>
      </form>`;
    document.body.appendChild(element);
    element.querySelector('[data-kora-install-confirm]').addEventListener('click', install);
    return element;
  }

  function configureDialog(element) {
    const copy = element.querySelector('[data-kora-install-copy]');
    const steps = element.querySelector('[data-kora-install-steps]');
    const confirm = element.querySelector('[data-kora-install-confirm]');
    steps.replaceChildren(); confirm.hidden = false;
    if (isStandalone()) { copy.textContent = 'KORA ya está instalada en este dispositivo y lista para usar.'; confirm.hidden = true; return; }
    if (deferredPrompt) { copy.textContent = 'Tendrás el ícono de KORA y se abrirá como una aplicación independiente.'; confirm.textContent = `Instalar ${APP_NAME}`; return; }
    confirm.hidden = true;
    if (platform() === 'ios') {
      copy.textContent = 'En iPhone o iPad se agrega desde el menú Compartir de Safari.';
      steps.innerHTML = '<li>Abre KORA en Safari.</li><li>Pulsa <strong>Compartir</strong>.</li><li>Elige <strong>Agregar a pantalla de inicio</strong> y confirma.</li>';
      return;
    }
    copy.textContent = 'Tu navegador permite crear el acceso desde su menú principal.';
    steps.innerHTML = '<li>Abre el menú del navegador.</li><li>Elige <strong>Instalar KORA</strong> o <strong>Agregar a pantalla de inicio</strong>.</li><li>Confirma para guardar el ícono.</li>';
  }

  async function install() {
    if (!deferredPrompt) return open();
    const prompt = deferredPrompt; deferredPrompt = null;
    await prompt.prompt(); await prompt.userChoice; dialog().close(); syncButtons();
  }
  function open() { const element = dialog(); configureDialog(element); element.showModal(); }
  function syncButtons() {
    document.querySelectorAll('[data-kora-install]').forEach(button => {
      button.hidden = isStandalone(); button.setAttribute('aria-label', 'Instalar KORA en este dispositivo'); button.title = 'Instalar KORA en este dispositivo';
    });
  }

  ensureMetadata(); ensureStyles();
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferredPrompt = event; syncButtons(); });
  window.addEventListener('appinstalled', () => { deferredPrompt = null; syncButtons(); });
  navigator.serviceWorker?.register('/creditek/erp/kora-service-worker.js', { scope: '/creditek/erp/' })
    .catch(error => console.warn('[KORA] No fue posible registrar la instalación:', error?.message || error));
  window.KoraInstall = { open, install, isStandalone };
  document.dispatchEvent(new CustomEvent('kora-install-ready'));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncButtons, { once: true }); else syncButtons();
})();
