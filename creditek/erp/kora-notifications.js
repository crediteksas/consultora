(function (global) {
  'use strict';

  const formatDate = value => new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function mount({ sb, profile }) {
    const trigger = document.querySelector('[data-kora-notifications]');
    if (!sb || !profile?.id || !trigger || trigger.dataset.koraNotificationsReady === 'true') return;
    trigger.dataset.koraNotificationsReady = 'true';
    trigger.disabled = false;
    trigger.setAttribute('aria-label', 'Notificaciones');
    trigger.title = 'Notificaciones';
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-haspopup', 'dialog');

    const count = element('span', '', 'kora-notifications-count');
    count.setAttribute('data-kora-notification-count', '');
    count.hidden = true;
    trigger.append(count);

    const panel = element('section', undefined, 'kora-notifications-panel');
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Notificaciones');
    panel.innerHTML = `<header class="kora-notifications-panel__header">
      <div><strong>Notificaciones</strong><span data-kora-notifications-summary></span></div>
      <button type="button" class="ghost" data-kora-notifications-read-all>Marcar todas como leídas</button>
    </header>
    <div class="kora-notifications-list" data-kora-notifications-list></div>
    <p class="kora-notifications-status" role="status" data-kora-notifications-status></p>`;
    document.body.append(panel);

    let notifications = [];
    let loading = false;

    function setStatus(message, isError = false) {
      const node = panel.querySelector('[data-kora-notifications-status]');
      node.textContent = message || '';
      node.dataset.kind = isError ? 'error' : 'success';
    }

    function updateCount() {
      const unread = notifications.filter(item => !item.read_at).length;
      count.textContent = unread > 99 ? '99+' : String(unread);
      count.hidden = unread === 0;
      trigger.setAttribute('aria-label', unread ? `Notificaciones, ${unread} sin leer` : 'Notificaciones');
      panel.querySelector('[data-kora-notifications-summary]').textContent = unread
        ? `${unread} sin leer`
        : 'Todo al día';
    }

    function safePath(item) {
      const configured = String(item.metadata?.internal_path || '');
      const allowed = /^\/creditek\/erp\/(?:mis-reportes|incidencias)\.html\?id=[0-9a-f-]{36}$/i;
      return allowed.test(configured)
        ? configured
        : `/creditek/erp/mis-reportes.html?id=${encodeURIComponent(item.incident_id)}`;
    }

    async function markRead(item) {
      if (item.read_at) return;
      const readAt = new Date().toISOString();
      const { error } = await sb.from('kora_notifications')
        .update({ read_at: readAt })
        .eq('id', item.id)
        .is('read_at', null);
      if (error) throw error;
      item.read_at = readAt;
      updateCount();
    }

    function render() {
      const list = panel.querySelector('[data-kora-notifications-list]');
      list.replaceChildren();
      if (!notifications.length) {
        list.append(element('p', 'No tienes notificaciones.', 'kora-notifications-empty'));
        updateCount();
        return;
      }
      notifications.forEach(item => {
        const button = element('button', undefined, 'kora-notification-item ghost');
        button.type = 'button';
        button.dataset.unread = String(!item.read_at);
        const title = element('strong', item.title);
        const message = element('span', item.message);
        const metadata = item.metadata || {};
        if (item.type === 'incident_resolved') {
          if (metadata.resolution) button.append(element('span', `Resolución: ${metadata.resolution}`, 'kora-notification-item__detail'));
          if (metadata.fixed_version) button.append(element('span', `Versión: ${metadata.fixed_version}`, 'kora-notification-item__detail'));
          if (metadata.responsible) button.append(element('span', `Responsable: ${metadata.responsible}`, 'kora-notification-item__detail'));
        }
        const time = element('time', formatDate(item.created_at));
        time.dateTime = item.created_at;
        button.prepend(title, message);
        button.append(time, element('span', 'Ver incidencia', 'kora-notification-item__link'));
        button.addEventListener('click', async () => {
          try {
            await markRead(item);
            location.assign(safePath(item));
          } catch (error) {
            setStatus(error.message || 'No fue posible abrir la notificación.', true);
          }
        });
        list.append(button);
      });
      updateCount();
    }

    async function load() {
      if (loading) return;
      loading = true;
      try {
        const { data, error } = await sb.from('kora_notifications')
          .select('id,type,title,message,incident_id,read_at,created_at,metadata')
          .order('created_at', { ascending: false })
          .limit(50);
        if (error) throw error;
        notifications = data || [];
        render();
        setStatus('');
      } catch (error) {
        setStatus(error.message || 'No fue posible cargar las notificaciones.', true);
      } finally {
        loading = false;
      }
    }

    function close({ restoreFocus = true } = {}) {
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      if (restoreFocus) trigger.focus();
    }

    async function open() {
      panel.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      await load();
      panel.querySelector('button')?.focus();
    }

    trigger.addEventListener('click', () => panel.hidden ? open() : close());
    panel.querySelector('[data-kora-notifications-read-all]').addEventListener('click', async () => {
      const unread = notifications.filter(item => !item.read_at);
      if (!unread.length) return;
      const readAt = new Date().toISOString();
      const { error } = await sb.from('kora_notifications')
        .update({ read_at: readAt })
        .is('read_at', null);
      if (error) {
        setStatus(error.message || 'No fue posible marcar las notificaciones.', true);
        return;
      }
      unread.forEach(item => { item.read_at = readAt; });
      render();
      setStatus('Todas las notificaciones quedaron leídas.');
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !panel.hidden) close();
    });
    document.addEventListener('pointerdown', event => {
      if (!panel.hidden && !panel.contains(event.target) && !trigger.contains(event.target)) {
        close({ restoreFocus: false });
      }
    });
    document.addEventListener('kora-notifications-refresh', load);
    window.addEventListener('focus', load);
    load();
  }

  global.KoraNotifications = Object.freeze({ mount });
  document.dispatchEvent(new CustomEvent('kora-notifications-ready'));
})(window);
