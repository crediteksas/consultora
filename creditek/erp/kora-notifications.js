(function (global) {
  'use strict';

  // Consultas de solo lectura: RLS sigue siendo la autoridad sobre lo visible.
  function pendingSources(profile, financialAccess = false) {
    if (!profile?.id || profile.activo === false) return [];
    const central = ['gerencia', 'auditoria'].includes(profile.rol);
    const sources = [{key:'incidents',table:'kora_incidents',title:'Incidencias abiertas',path:'/creditek/erp/incidencias.html',filters:[['in','status',['nuevo','en_revision','confirmado','en_desarrollo','pendiente_validacion','corregido','reabierto']]]}];
    if (central) {
      sources.push(
        {key:'transfers',table:'traslados',title:'Traslados recibidos · falta autorización',path:'/creditek/erp/traslados.html',filters:[['eq','estado','recibido_pendiente_aprobacion']]},
        {key:'store-expenses',table:'gastos',title:'Gastos de tiendas por aprobar',path:'/creditek/erp/gastos.html',filters:[['eq','estado','registrado']]},
        {key:'ally-expenses',table:'aliados_gastos_operativos',title:'Gastos de Aliados pendientes de aprobación',path:'/creditek/erp/aliados-gastos.html',filters:[['eq','estado','pendiente']]},
      );
    } else if (profile.rol === 'admin_tienda' && profile.tienda_codigo) {
      sources.push(
        {key:'transfers',table:'traslados',title:'Traslados por recibir',path:'/creditek/erp/traslados.html',filters:[['eq','estado','despachado'],['eq','tienda_destino',profile.tienda_codigo]]},
        {key:'expense-corrections',table:'gastos',title:'Gastos devueltos · corregir y reenviar',path:'/creditek/erp/gastos.html',filters:[['eq','correccion_pendiente',true],['eq','tienda_codigo',profile.tienda_codigo]]},
      );
    }
    if (financialAccess) sources.push(
      {key:'financial-approval',table:'financial_entries',title:profile.rol==='gerencia'?'Gastos y retiros por autorizar':'Gastos y retiros · esperando autorización',path:'/creditek/erp/aliados-tesoreria.html?vista=gastos',filters:[['eq','status','pendiente_aprobacion']]},
      {key:'financial-payment',table:'financial_entries',title:'Gastos autorizados · falta registrar pago',path:'/creditek/erp/aliados-tesoreria.html?vista=gastos',filters:[['eq','status','aprobado']]},
    );
    return sources;
  }

  async function pendingCount(sb, source) {
    let query = sb.from(source.table).select('id', {count:'exact', head:true});
    for (const [method, column, value] of source.filters) query = query[method](column, value);
    const result = await query;
    if (result.error || !Number.isInteger(result.count)) throw new Error('No se pudieron consultar todos los pendientes.');
    return {...source, count:result.count};
  }

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
    let pending = [];
    let incomplete = false;
    let loading = false;

    function setStatus(message, isError = false) {
      const node = panel.querySelector('[data-kora-notifications-status]');
      node.textContent = message || '';
      node.dataset.kind = isError ? 'error' : 'success';
    }

    function updateCount() {
      const unread = notifications.filter(item => !item.read_at).length;
      const tasks = pending.reduce((sum,item)=>sum+item.count,0);
      const total = tasks + unread;
      count.textContent = incomplete ? (total ? `${total}+` : '!') : total > 99 ? '99+' : String(total);
      count.hidden = total === 0 && !incomplete;
      const summary = `${tasks} pendientes · ${unread} avisos sin leer${incomplete?' · consulta incompleta':''}`;
      trigger.setAttribute('aria-label', `Notificaciones, ${summary}`);
      panel.querySelector('[data-kora-notifications-summary]').textContent = total || incomplete ? summary : 'Sin pendientes ni avisos nuevos';
    }

    function safePath(item) {
      const configured = String(item.metadata?.internal_path || '');
      const allowed = /^\/creditek\/erp\/(?:mis-reportes|incidencias)\.html\?id=[0-9a-f-]{36}$/i;
      if (allowed.test(configured)) {
        return configured.replace('/mis-reportes.html', '/incidencias.html');
      }
      return `/creditek/erp/incidencias.html?id=${encodeURIComponent(item.incident_id)}`;
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
      if (pending.some(item=>item.count>0)) {
        list.append(element('p','Pendientes por gestionar · se retiran al resolver el trámite, no al leerlos.','kora-notifications-empty'));
        pending.filter(item=>item.count>0).forEach(item=>{
          const button=element('button',undefined,'kora-notification-item ghost');
          button.type='button';
          button.dataset.pending=item.key;
          button.dataset.unread='true';
          button.append(element('strong',`${item.count} · ${item.title}`),element('span','Abrir pendientes','kora-notification-item__link'));
          button.addEventListener('click',()=>location.assign(item.path));
          list.append(button);
        });
      }
      if (!notifications.length) {
        if (!pending.some(item=>item.count>0)) list.append(element('p', incomplete?'No se pudo comprobar si estás al día.':'No tienes notificaciones ni trámites pendientes.', 'kora-notifications-empty'));
        updateCount();
        return;
      }
      list.append(element('p','Avisos · leerlos no resuelve trámites.','kora-notifications-empty'));
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
        const results = await Promise.allSettled([sb.from('kora_notifications')
          .select('id,type,title,message,incident_id,read_at,created_at,metadata')
          .order('created_at', { ascending: false })
          .limit(50),
          ['gerencia','auditoria'].includes(profile.rol)?sb.rpc('es_controlador_financiero'):Promise.resolve({data:false}),
        ]);
        incomplete = false;
        const notices=results[0];
        if(notices.status==='rejected'||notices.value.error||!Array.isArray(notices.value.data)) incomplete=true;
        else notifications=notices.value.data;
        const access=results[1];
        const financialAccess=access.status==='fulfilled'&&!access.value.error&&access.value.data===true;
        if(access.status==='rejected'||access.value.error) incomplete=true;
        const sources=pendingSources(profile,financialAccess);
        const counts=await Promise.allSettled(sources.map(source=>pendingCount(sb,source)));
        pending=counts.map((result,i)=>{
          if(result.status==='fulfilled')return result.value;
          incomplete=true;
          return pending.find(item=>item.key===sources[i].key)||{...sources[i],count:0};
        });
        render();
        setStatus(incomplete?'No se pudieron actualizar todos los pendientes. Vuelve a abrir la campana para reintentar.':'',incomplete);
      } catch (error) {
        incomplete=true;
        updateCount();
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
    const refreshVisible=()=>{if(!document.hidden)load();};
    document.addEventListener('visibilitychange',refreshVisible);
    const timer=window.setInterval(refreshVisible,60000);
    window.addEventListener('pagehide',()=>window.clearInterval(timer),{once:true});
    load();
  }

  global.KoraNotifications = Object.freeze({ mount, pendingSources, pendingCount });
  document.dispatchEvent(new CustomEvent('kora-notifications-ready'));
})(window);
