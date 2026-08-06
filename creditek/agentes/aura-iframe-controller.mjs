const NEUTRAL_URL = 'about:blank';
const DEFAULT_TIMEOUT_MS = 12000;

function httpMessage(status) {
  if (status === 401) return 'El módulo requiere una sesión válida (401).';
  if (status === 403) return 'No tienes permiso para abrir este módulo (403).';
  if (status === 404) return 'El módulo solicitado no está disponible (404).';
  if (status >= 500) return `El módulo no respondió correctamente (${status}).`;
  return `No fue posible abrir el módulo (${status}).`;
}

export function createIframeController({
  iframe,
  iframeView,
  mainContent,
  titleElement,
  linkElement,
  baseUrl,
  onError = () => {},
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  log = event => console.info('[AURA module navigation]', event),
}) {
  let requestId = 0;
  let lastRequest = null;
  let cleanupPendingLoad = null;

  function telemetry(event, detail = {}) {
    log({ event, at: new Date().toISOString(), ...detail });
  }

  function auditUrl(destination) {
    return `${destination.origin}${destination.pathname}`;
  }

  function restoreDashboard() {
    iframeView.classList.remove('visible');
    mainContent.style.display = 'block';
  }

  function clearPendingLoad() {
    cleanupPendingLoad?.();
    cleanupPendingLoad = null;
  }

  function resetFrame() {
    clearPendingLoad();
    iframe.src = NEUTRAL_URL;
  }

  function showError(message) {
    restoreDashboard();
    onError(message);
  }

  function clearError() {}

  function destinationFor(rawUrl) {
    const destination = new URL(String(rawUrl || ''), baseUrl);
    const base = new URL(baseUrl);
    if (!['http:', 'https:'].includes(destination.protocol) || destination.origin !== base.origin) {
      throw new Error('La URL del módulo no es válida.');
    }
    return destination;
  }

  function waitForLoad(id, destination) {
    return new Promise(resolve => {
      let settled = false;
      const finish = result => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        iframe.removeEventListener('load', onLoad);
        iframe.removeEventListener('error', onError);
        if (cleanupPendingLoad === cancel) cleanupPendingLoad = null;
        resolve(result);
      };
      const onLoad = () => {
        if (iframe.src !== destination.href) return;
        finish({ ok: true });
      };
      const onError = () => finish({ ok: false, message: 'El navegador no pudo cargar el módulo.' });
      const timer = setTimeout(
        () => finish({ ok: false, timeout: true, message: 'El módulo superó el tiempo máximo de carga.' }),
        timeoutMs,
      );
      const cancel = () => finish({ ok: false, cancelled: true, message: 'Navegación cancelada.' });
      cleanupPendingLoad = cancel;
      iframe.addEventListener('load', onLoad, { once: true });
      iframe.addEventListener('error', onError, { once: true });
      iframe.src = destination.href;
      if (id !== requestId) cancel();
    });
  }

  async function probe(destination) {
    const response = await fetchImpl(destination.href, {
      method: 'HEAD',
      credentials: 'include',
      cache: 'no-store',
      redirect: 'follow',
    });
    if (response.status === 405 || response.status === 501) return { ok: true, status: response.status };
    return { ok: response.ok, status: response.status };
  }

  async function open(rawUrl, title) {
    const id = ++requestId;
    clearPendingLoad();
    resetFrame();
    clearError();
    restoreDashboard();

    let destination;
    try {
      destination = destinationFor(rawUrl);
    } catch (error) {
      showError(error.message);
      telemetry('invalid_url', { module: title });
      return false;
    }

    lastRequest = { url: destination.href, title };
    titleElement.textContent = title;
    linkElement.href = destination.href;
    const loggedUrl = auditUrl(destination);
    telemetry('start', { module: title, url: loggedUrl });

    let preflight;
    try {
      preflight = await probe(destination);
    } catch (error) {
      if (id !== requestId) return false;
      resetFrame();
      showError('No fue posible conectar con el módulo.');
      telemetry('network_error', { module: title, url: loggedUrl });
      return false;
    }
    if (id !== requestId) return false;
    if (!preflight.ok) {
      resetFrame();
      showError(httpMessage(preflight.status));
      telemetry('http_error', { module: title, url: loggedUrl, status: preflight.status });
      return false;
    }

    const loaded = await waitForLoad(id, destination);
    if (id !== requestId || loaded.cancelled) return false;
    if (!loaded.ok) {
      resetFrame();
      showError(loaded.message);
      telemetry(loaded.timeout ? 'timeout' : 'load_error', { module: title, url: loggedUrl });
      return false;
    }

    clearError();
    mainContent.style.display = 'none';
    iframeView.classList.add('visible');
    telemetry('loaded', { module: title, url: loggedUrl, status: preflight.status });
    return true;
  }

  function retry() {
    if (!lastRequest) return Promise.resolve(false);
    telemetry('retry', { module: lastRequest.title, url: lastRequest.url });
    return open(lastRequest.url, lastRequest.title);
  }

  function close() {
    requestId += 1;
    resetFrame();
    clearError();
    restoreDashboard();
  }

  resetFrame();
  return { open, retry, close };
}
