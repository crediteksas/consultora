(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CreditekTesoreriaClientes = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fold = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const masked = account => account ? `${account.banco} · ${account.tipo_cuenta} · •••• ${account.numero_cuenta.slice(-4)}` : 'Sin cuenta registrada';
  function directory(origins, beneficiaries, accounts, sites = [], clients = []) {
    return origins.filter(o => o.tipo === 'aliado' && o.activo).map(origin => {
      const site = sites.find(s=>s.origen_codigo===origin.codigo);
      const client = clients.find(c=>c.id===site?.aliado_id);
      const holders = beneficiaries.filter(b => b.tipo === 'aliado' && b.activo && (client && Object.hasOwn(client,'payment_beneficiary_id') ? b.id===client.payment_beneficiary_id : b.origen_codigo === origin.codigo));
      const beneficiary = holders.length === 1 ? holders[0] : null;
      const banks = accounts.filter(a => a.beneficiary_id === beneficiary?.id && a.activo)
        .sort((a,b) => String(b.validada_at || b.created_at).localeCompare(String(a.validada_at || a.created_at)));
      const account = banks[0] || null;
      return { origin:{...origin,ciudad:origin.ciudad || site?.ciudad}, beneficiary, account, site, client, conflict: holders.length > 1,
        status: holders.length > 1 ? 'revisar' : !beneficiary ? 'sin_titular' : !account ? 'sin_cuenta' : account.validada ? 'completo' : 'sin_validar' };
    }).sort((a,b) => a.origin.nombre.localeCompare(b.origin.nombre, 'es'));
  }
  function filterRows(rows, query, status) {
    const q = fold(query).trim();
    return rows.filter(r => (!status || r.status === status) && (!q || fold([
      r.origin.nombre, r.origin.codigo, r.origin.ciudad, r.beneficiary?.nombre, r.beneficiary?.identificacion,
      r.client?.razon_social, r.client?.identificacion, r.client?.contacto, r.client?.telefono, r.client?.email
    ].join(' ')).includes(q)));
  }
  const labels = {completo:'Cuenta verificada',sin_titular:'Falta titular',sin_cuenta:'Falta cuenta',sin_validar:'Cuenta sin verificar',revisar:'Revisar titulares duplicados'};
  function create({sb}) {
    let host, origins = [], beneficiaries = [], accounts = [], rows = [], page = 0, query = '', status = '', loaded = false, saving = false, returnFocus;
    const $ = s => host.querySelector(s);
    async function all(table, columns, order) {
      const result = [];
      for (let start = 0; ; start += 500) {
        const response = await sb.from(table).select(columns).order(order).range(start,start+499);
        if (response.error) throw response.error;
        result.push(...response.data);
        if (response.data.length < 500) return result;
      }
    }
    async function refresh() {
      const result = await Promise.all([
        all('origenes','codigo,nombre,tipo,ciudad,activo','codigo'),
        all('liquidation_beneficiaries','id,tipo,nombre,identificacion,origen_codigo,activo','id'),
        all('beneficiary_bank_accounts','id,beneficiary_id,banco,tipo_cuenta,numero_cuenta,activo,validada,validada_at,created_at','id'),
        all('aliados_sedes','id,aliado_id,origen_codigo,nombre,ciudad,direccion','id'),
        all('aliados','id,nombre_comercial,razon_social,identificacion,propietario,contacto,telefono,email,observacion,revision,payment_beneficiary_id','id')
      ]);
      [origins,beneficiaries,accounts] = result;
      rows = directory(...result);
      loaded = true;
      renderList();
    }
    function message(text, error = false) {
      $('#clientNotice').textContent = text;
      $('#clientNotice').classList.toggle('tc-error', error);
    }
    function renderList() {
      const filtered = filterRows(rows,query,status);
      page = Math.min(page, Math.max(0, Math.ceil(filtered.length/10)-1));
      const visible = filtered.slice(page*10,page*10+10);
      $('#clientCount').textContent = `${filtered.length} comercios · ${rows.filter(r=>r.status !== 'completo').length} con datos por completar en el directorio`;
      $('#clientList').innerHTML = visible.map(r => `<article class="tc-row">
        <div><h3>${esc(r.origin.nombre)}</h3><p>${esc(r.origin.ciudad || 'Ciudad no registrada')}</p><small>${esc(r.client?.contacto || r.origin.codigo)}${r.client?.telefono ? ` · ${esc(r.client.telefono)}` : ''}</small>${r.client && rows.filter(x=>x.client?.id===r.client.id).length>1 ? `<p>Cliente: ${esc(r.client.razon_social || r.client.nombre_comercial)} · ${rows.filter(x=>x.client?.id===r.client.id).length} locales</p>`:''}</div>
        <div><span class="tc-label">Titular del pago</span><strong>${esc(r.beneficiary?.nombre || 'Por relacionar')}</strong><p>${r.beneficiary?.identificacion ? `CC / NIT: ${esc(r.beneficiary.identificacion)}` : 'Sin identificación registrada'}</p></div>
        <div><span class="tc-label">Cuenta bancaria</span><p>${esc(masked(r.account))}</p><span class="tc-status">${esc(labels[r.status])}</span></div>
        <button class="btn secondary" data-edit="${esc(r.origin.codigo)}">Ver ficha y cuenta</button>
      </article>`).join('') || '<p class="empty">No hay comercios que coincidan con esta búsqueda.</p>';
      $('#clientPage').textContent = `Página ${page+1} de ${Math.max(1,Math.ceil(filtered.length/10))}`;
      $('#clientPrev').disabled = page === 0;
      $('#clientNext').disabled = (page+1)*10 >= filtered.length;
      $('#clientExecutive').innerHTML = '<option value="">Seleccionar ejecutivo para editar su cuenta</option>' + beneficiaries.filter(b=>b.tipo==='ejecutivo' && b.activo).map(b=>`<option value="${esc(b.id)}">${esc(b.nombre)}</option>`).join('');
    }
    function bankFields(b) {
      const bank = accounts.filter(a=>a.beneficiary_id===b?.id && a.activo)
        .sort((a,c)=>String(c.validada_at||c.created_at).localeCompare(String(a.validada_at||a.created_at)))[0];
      const f = $('#clientForm').elements;
      f.name.value = b?.nombre || ''; f.identification.value = b?.identificacion || '';
      f.bank.value = bank?.banco || ''; f.accountType.value = bank?.tipo_cuenta || 'ahorros'; f.accountNumber.value = bank?.numero_cuenta || '';
      f.verified.checked = false;
      f.name.readOnly=!!b;f.identification.readOnly=!!b;
      const related=rows.filter(r=>r.beneficiary?.id===b?.id && b);
      $('#clientSharedAccount').textContent=related.length ? `Titular relacionado con ${related.length} local(es): ${related.map(r=>r.origin.nombre).join(', ')}. Editar su cuenta cambia la cuenta maestra para futuras liquidaciones de todos ellos; no cambia órdenes anteriores.` : 'Puedes seleccionar un titular existente sin trasladarlo de sus otros locales.';
    }
    function open(code, trigger) {
      const row = rows.find(r=>r.origin.codigo===code);
      if (!row) return;
      if (row.conflict) return message('Este comercio tiene más de un titular activo. Revisa la asociación antes de guardar otra cuenta.',true);
      returnFocus = trigger;
      const f = $('#clientForm'); f.reset();
      f.dataset.executive = '';
      f.elements.name.readOnly = false; f.elements.identification.readOnly = false;
      $('#clientHolder').parentElement.hidden = false;
      f.dataset.origin = code; f.dataset.previous = row.beneficiary?.id || '';
      $('#clientEditorTitle').textContent = row.origin.nombre;
      $('#clientEditorError').textContent = '';
      const available = beneficiaries.filter(b=>b.tipo==='aliado' && b.activo);
      f.elements.holder.innerHTML = '<option value="">Registrar otro titular</option>' + available.map(b=>`<option value="${esc(b.id)}">${esc(b.nombre)} · ${esc(b.identificacion || 'Sin identificación')}</option>`).join('');
      f.elements.holder.value = row.beneficiary?.id || '';
      bankFields(row.beneficiary);
      $('#clientPrevious').textContent = row.beneficiary ? `Titular actual: ${row.beneficiary.nombre}. Esta cuenta corresponde al cliente y a sus locales.` : 'Este cliente todavía no tiene un titular para pagos. Puedes elegir uno existente.';
      const history = accounts.filter(a=>a.beneficiary_id===row.beneficiary?.id || beneficiaries.some(b=>b.id===a.beneficiary_id && b.origen_codigo===code));
      $('#clientAccountHistory').innerHTML = history.length ? history.map(a=>`<li>${esc(masked(a))} · ${a.activo ? 'Activa' : 'Anterior'}</li>`).join('') : '<li>No hay cuentas anteriores.</li>';
      const profile = $('#clientProfile'); profile.reset(); profile.dataset.origin=code; profile.dataset.client=row.client?.id || ''; profile.dataset.revision=row.client?.revision ?? '';
      const values={...row.client,nombre:row.origin.nombre,ciudad:row.origin.ciudad,direccion:row.site?.direccion};
      for(const element of profile.elements) if(element.name) element.value=values[element.name] || '';
      $('#clientProfileSave').disabled=!row.client;
      $('#clientProfileError').textContent=row.client ? '' : 'Esta ficha todavía no está vinculada. Actualiza el directorio o solicita revisar su relación; puedes consultar su cuenta.';
      $('#clientProfileTab').hidden=false;
      $('#clientSitesTab').hidden=false;
      renderSites(row);
      setPanel('profile');
      $('#clientDialog').showModal();
    }
    function setPanel(panel) {
      $('#clientProfile').hidden=panel!=='profile'; $('#clientBankPanel').hidden=panel!=='bank'; $('#clientSitesPanel').hidden=panel!=='sites';
      $('#clientProfileTab').classList.toggle('active',panel==='profile'); $('#clientBankTab').classList.toggle('active',panel==='bank');
      $('#clientSitesTab').classList.toggle('active',panel==='sites');
    }
    function renderSites(row) {
      const localRows=rows.filter(r=>r.client?.id && r.client.id===row.client?.id);
      $('#clientSitesList').innerHTML=localRows.map(r=>`<li><strong>${esc(r.origin.nombre)}</strong> · ${esc(r.origin.ciudad || 'Ciudad no registrada')}</li>`).join('');
      $('#clientSitesSummary').textContent=`Cliente: ${row.client?.razon_social || row.client?.nombre_comercial || row.origin.nombre}. ${localRows.length} local(es). Los datos generales y la cuenta son compartidos; nombre, ciudad, dirección y ventas se conservan por local.`;
      const form=$('#clientLinkForm');form.reset();form.dataset.origin=row.origin.codigo;form.dataset.previous=row.client?.id || '';
      const options=[...new Map(rows.filter(r=>r.client && r.client.id!==row.client?.id).map(r=>[r.client.id,r])).values()];
      $('#clientDestination').innerHTML='<option value="">Seleccionar cliente existente</option>'+options.map(r=>`<option value="${esc(r.client.id)}">${esc(r.client.razon_social || r.client.nombre_comercial || r.origin.nombre)} · ${rows.filter(x=>x.client?.id===r.client.id).length} locales</option>`).join('');
      $('#clientLinkError').textContent='';$('#clientDestinationInfo').textContent='';
    }
    function destinationInfo() {
      const row=rows.find(r=>r.client?.id===$('#clientDestination').value);
      $('#clientDestinationInfo').textContent=row ? `Este local se incorporará a ${row.client.razon_social || row.client.nombre_comercial || row.origin.nombre}. Titular: ${row.beneficiary?.nombre || 'Pendiente'}. Cuenta: ${masked(row.account)}. Se conservarán ventas, dirección y pagos anteriores.` : '';
      $('#clientLinkForm').elements.confirmLink.checked=false;
    }
    async function linkSite(event) {
      event.preventDefault();if(saving)return;
      const f=event.currentTarget;if(!f.elements.confirmLink.checked)return;
      saving=true;$('#clientLinkSave').disabled=true;$('#clientClose').disabled=true;$('#clientLinkError').textContent='';let saved=false;
      try {
        const r=await sb.rpc('tesoreria_vincular_local_cliente',{p_origen_codigo:f.dataset.origin,p_cliente_anterior:f.dataset.previous,p_cliente_destino:f.elements.destination.value});
        if(r.error)throw r.error;
        saved=true;$('#clientDialog').close();await refresh();message('Local relacionado con el cliente y su cuenta. No se modificaron órdenes de pago ni saldos.');
      }catch(error){if(saved)message('La relación se guardó. Actualiza el directorio; no vuelvas a guardar.',true);else $('#clientLinkError').textContent=error.message || 'No fue posible relacionar el local.';}
      finally{saving=false;$('#clientLinkSave').disabled=false;$('#clientClose').disabled=false;}
    }
    function openBeneficiary(id) {
      const row=rows.find(r=>r.beneficiary?.id===id);
      if(row){open(row.origin.codigo);setPanel('bank');return;}
      const b=beneficiaries.find(b=>b.id===id && b.tipo==='ejecutivo' && b.activo);
      if(!b)return message('No se encontró un titular activo relacionado. Busca el comercio para completar su ficha.',true);
      const f=$('#clientForm');f.reset();f.dataset.executive=b.id;f.dataset.origin='';f.dataset.previous='';
      bankFields(b);f.elements.name.readOnly=true;f.elements.identification.readOnly=true;
      $('#clientHolder').parentElement.hidden=true;$('#clientProfileTab').hidden=true;$('#clientSitesTab').hidden=true;
      $('#clientEditorTitle').textContent=b.nombre;$('#clientPrevious').textContent='Cuenta del ejecutivo. Su identidad y las órdenes existentes no se modifican.';
      $('#clientAccountHistory').innerHTML=accounts.filter(a=>a.beneficiary_id===b.id).map(a=>`<li>${esc(masked(a))} · ${a.activo?'Activa':'Anterior'}</li>`).join('');
      $('#clientEditorError').textContent='';setPanel('bank');$('#clientDialog').showModal();
    }
    async function saveProfile(event) {
      event.preventDefault();if(saving)return;
      const f=event.currentTarget;if(!f.dataset.client)return;
      saving=true;$('#clientProfileSave').disabled=true;$('#clientClose').disabled=true;$('#clientProfileError').textContent='';
      let saved=false;
      try{
        const response=await sb.rpc('tesoreria_guardar_ficha_cliente',{p_origen_codigo:f.dataset.origin,p_cliente_id:f.dataset.client,p_revision:Number(f.dataset.revision),p_datos:Object.fromEntries(new FormData(f))});
        if(response.error)throw response.error;
        saved=true;$('#clientDialog').close();await refresh();message('Ficha actualizada en Aliados y Tesorería. No se modificaron órdenes de pago ni saldos.');
      }catch(error){if(saved)message('La ficha se guardó. Actualiza la lista; no vuelvas a guardar.',true);else $('#clientProfileError').textContent=error.message || 'No fue posible guardar la ficha.';}
      finally{saving=false;$('#clientProfileSave').disabled=false;$('#clientClose').disabled=false;}
    }
    async function save(event) {
      event.preventDefault();
      if (saving) return;
      const form = event.currentTarget, values = Object.fromEntries(new FormData(form));
      const check = window.CreditekAliadosCuentas.validateNewBeneficiary({...values,originCode:form.dataset.origin || form.dataset.executive});
      if (!check.ok) { $('#clientEditorError').textContent = check.errors.join(' '); return; }
      if (!values.verified) { $('#clientEditorError').textContent = 'Verifica los datos del titular y de la cuenta antes de guardar.'; return; }
      saving = true;
      $('#clientSave').disabled = true; $('#clientClose').disabled = true;
      $('#clientEditorError').textContent = '';
      const v = check.value;
      let saved = false;
      try {
        const response = form.dataset.executive ? await sb.rpc('aliados_guardar_cuenta_bancaria',{
          p_beneficiary_id:form.dataset.executive,p_banco:v.bank,p_tipo_cuenta:v.accountType,p_numero_cuenta:v.accountNumber,p_validar:true
        }) : await sb.rpc('tesoreria_guardar_cliente_cuenta', {
          p_origen_codigo:v.originCode, p_previous_beneficiary_id:form.dataset.previous || null,
          p_nombre:v.name, p_identificacion:v.identification, p_banco:v.bank,
          p_tipo_cuenta:v.accountType, p_numero_cuenta:v.accountNumber, p_verificada:true
        });
        if (response.error) throw response.error;
        saved = true;
        $('#clientDialog').close();
        await refresh();
        message('Cliente y cuenta guardados para futuras liquidaciones. No se modificaron órdenes de pago ni saldos.');
      } catch (error) {
        if (saved) message('Los datos se guardaron, pero no fue posible actualizar la lista. Pulsa Actualizar; no vuelvas a guardar.',true);
        else $('#clientEditorError').textContent = error.message || 'No fue posible guardar. Revisa los datos e intenta nuevamente.';
      } finally {
        saving = false; $('#clientSave').disabled = false; $('#clientClose').disabled = false;
      }
    }
    async function mount(element) {
      host = element;
      if (!$('#clientList')) {
        host.classList.add('tc-directory');
        host.innerHTML = `<section class="card">
          <h2>Clientes y cuentas</h2><p class="section-copy">Una misma ficha en Aliados y Tesorería: información del comercio, contacto y cuenta para pagos.</p>
          <div class="tc-filters"><label>Buscar cliente o titular<input id="clientSearch" type="search" placeholder="Comercio, ciudad, nombre o identificación"></label>
          <label>Estado de los datos<select id="clientStatus"><option value="">Todos</option>${Object.entries(labels).map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select></label>
          <button id="clientClear" class="btn secondary">Limpiar</button></div>
          <p id="clientNotice" role="status" aria-live="polite"></p><p id="clientCount" class="section-copy"></p>
          <div id="clientList"></div><nav class="tc-pagination" aria-label="Páginas de clientes"><button id="clientPrev" class="btn secondary">Anterior</button><span id="clientPage"></span><button id="clientNext" class="btn secondary">Siguiente</button></nav>
          <details class="tc-executives"><summary>Cuentas de ejecutivos</summary><label>Ejecutivo<select id="clientExecutive"></select></label></details>
        </section>
        <dialog id="clientDialog" class="tc-dialog" aria-labelledby="clientEditorTitle">
          <header><div><span class="tc-label">Cliente y cuenta bancaria</span><h2 id="clientEditorTitle"></h2></div><button id="clientClose" type="button" class="btn secondary">Cerrar</button></header>
          <nav class="tc-tabs" aria-label="Secciones de la ficha"><button id="clientProfileTab" class="btn secondary" type="button">Datos del cliente</button><button id="clientBankTab" class="btn secondary" type="button">Cuenta de pago</button><button id="clientSitesTab" class="btn secondary" type="button">Locales del cliente</button></nav>
          <form id="clientProfile"><div class="tc-form-grid">
            <label>Nombre del comercio<input name="nombre" required minlength="3" maxlength="180"></label>
            <label>Ciudad<input name="ciudad" maxlength="120"></label>
            <label>Razón social<input name="razon_social" maxlength="180"></label>
            <label>Identificación legal del cliente<input name="identificacion" maxlength="25" pattern="[0-9.\\-]{5,25}"></label>
            <label>Propietario<input name="propietario" maxlength="180"></label>
            <label>Contacto<input name="contacto" maxlength="180"></label>
            <label>Teléfono<input name="telefono" type="tel" maxlength="40"></label>
            <label>Correo<input name="email" type="email" maxlength="180"></label>
            <label class="tc-wide">Dirección de esta sede<input name="direccion" maxlength="250"></label>
            <label class="tc-wide">Observaciones<textarea name="observacion" maxlength="2000" rows="3"></textarea></label>
          </div><p class="tc-help">Los datos generales son comunes a los locales del cliente. Nombre del comercio, ciudad y dirección pertenecen a este local. El titular bancario puede ser distinto: no copies su identificación como identificación legal del cliente.</p>
          <p id="clientProfileError" class="tc-error" role="alert"></p><button id="clientProfileSave" class="btn primary" type="submit">Guardar datos del cliente</button></form>
          <section id="clientBankPanel" hidden><p id="clientPrevious" class="section-copy"></p>
          <form id="clientForm"><label>Titular relacionado<select name="holder" id="clientHolder"></select></label>
            <div class="tc-form-grid"><label>Nombre o razón social del titular<input name="name" required minlength="3" maxlength="180" autocomplete="off"></label>
            <label>CC / NIT del titular<input name="identification" inputmode="numeric" required pattern="[0-9]{5,20}" maxlength="20"></label>
            <label>Banco<input name="bank" required minlength="2" maxlength="100"></label>
            <label>Tipo de cuenta<select name="accountType"><option value="ahorros">Ahorros</option><option value="corriente">Corriente</option></select></label>
            <label class="tc-wide">Número completo de cuenta<input name="accountNumber" inputmode="numeric" required pattern="[0-9]{5,30}" maxlength="30" autocomplete="off"></label></div>
            <p id="clientSharedAccount" class="tc-help"></p><label class="tc-check"><input type="checkbox" name="verified" required><span>He verificado el titular, la cuenta y los locales que la comparten.</span></label>
            <p class="tc-help">Guardar no autoriza ni registra pagos. Las órdenes ya creadas conservan sus datos; los cambios se usarán en futuras liquidaciones.</p>
            <p id="clientEditorError" class="tc-error" role="alert"></p>
            <button id="clientSave" type="submit" class="btn primary">Guardar cliente y cuenta</button>
          </form><details><summary>Cuentas registradas</summary><ul id="clientAccountHistory"></ul></details></section>
          <section id="clientSitesPanel" hidden><p id="clientSitesSummary" class="section-copy"></p><ul id="clientSitesList" class="tc-sites"></ul>
           <details><summary>Relacionar este local con otro cliente</summary><form id="clientLinkForm">
            <label>Cliente al que pertenece este local<select id="clientDestination" name="destination" required></select></label>
            <p id="clientDestinationInfo" class="tc-help"></p>
            <label class="tc-check"><input name="confirmLink" type="checkbox" required><span>Confirmo que este local pertenece al cliente seleccionado y usará su cuenta para futuras liquidaciones.</span></label>
            <p id="clientLinkError" class="tc-error" role="alert"></p><button id="clientLinkSave" class="btn primary" type="submit">Relacionar local</button>
           </form></details></section>
        </dialog>`;
        $('#clientSearch').oninput = e => {query=e.target.value;page=0;renderList();};
        $('#clientStatus').onchange = e => {status=e.target.value;page=0;renderList();};
        $('#clientClear').onclick = () => {query='';status='';page=0;$('#clientSearch').value='';$('#clientStatus').value='';renderList();};
        $('#clientPrev').onclick = () => {page--;renderList();};
        $('#clientNext').onclick = () => {page++;renderList();};
        $('#clientList').onclick = e => {const b=e.target.closest('[data-edit]');if(b)open(b.dataset.edit,b);};
        $('#clientClose').onclick = () => $('#clientDialog').close();
        $('#clientDialog').onclose = () => returnFocus?.focus();
        $('#clientDialog').oncancel = e => {if(saving)e.preventDefault();};
        $('#clientHolder').onchange = e => bankFields(beneficiaries.find(b=>b.id===e.target.value));
        $('#clientForm').onsubmit = save;
        $('#clientProfile').onsubmit=saveProfile;
        $('#clientProfileTab').onclick=()=>setPanel('profile');$('#clientBankTab').onclick=()=>setPanel('bank');
        $('#clientSitesTab').onclick=()=>setPanel('sites');$('#clientLinkForm').onsubmit=linkSite;$('#clientDestination').onchange=destinationInfo;
        $('#clientExecutive').onchange=e=>{if(e.target.value)openBeneficiary(e.target.value);};
      }
      message('Cargando clientes y cuentas…');
      try {await refresh(); message('');}
      catch { message(loaded ? 'No se pudo actualizar. Se conserva la consulta anterior; intenta con Actualizar.' : 'No fue posible consultar clientes y cuentas. Pulsa Actualizar para reintentar.',true); }
    }
    return {mount,openBeneficiary,openOrigin:code=>open(code)};
  }
  return {directory,filterRows,masked,create};
}));
