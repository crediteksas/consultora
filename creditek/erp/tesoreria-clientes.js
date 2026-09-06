(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CreditekTesoreriaClientes = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fold = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const masked = account => account ? `${account.banco} · ${account.tipo_cuenta} · •••• ${account.numero_cuenta.slice(-4)}` : 'Sin cuenta registrada';
  function directory(origins, beneficiaries, accounts) {
    return origins.filter(o => o.tipo === 'aliado' && o.activo).map(origin => {
      const holders = beneficiaries.filter(b => b.tipo === 'aliado' && b.activo && b.origen_codigo === origin.codigo);
      const beneficiary = holders.length === 1 ? holders[0] : null;
      const banks = accounts.filter(a => a.beneficiary_id === beneficiary?.id && a.activo)
        .sort((a,b) => String(b.validada_at || b.created_at).localeCompare(String(a.validada_at || a.created_at)));
      const account = banks[0] || null;
      return { origin, beneficiary, account, conflict: holders.length > 1,
        status: holders.length > 1 ? 'revisar' : !beneficiary ? 'sin_titular' : !account ? 'sin_cuenta' : account.validada ? 'completo' : 'sin_validar' };
    }).sort((a,b) => a.origin.nombre.localeCompare(b.origin.nombre, 'es'));
  }
  function filterRows(rows, query, status) {
    const q = fold(query).trim();
    return rows.filter(r => (!status || r.status === status) && (!q || fold([
      r.origin.nombre, r.origin.codigo, r.origin.ciudad, r.beneficiary?.nombre, r.beneficiary?.identificacion
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
        all('beneficiary_bank_accounts','id,beneficiary_id,banco,tipo_cuenta,numero_cuenta,activo,validada,validada_at,created_at','id')
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
        <div><h3>${esc(r.origin.nombre)}</h3><p>${esc(r.origin.ciudad || 'Ciudad no registrada')}</p><small>${esc(r.origin.codigo)}</small></div>
        <div><span class="tc-label">Titular del pago</span><strong>${esc(r.beneficiary?.nombre || 'Por relacionar')}</strong><p>${r.beneficiary?.identificacion ? `CC / NIT: ${esc(r.beneficiary.identificacion)}` : 'Sin identificación registrada'}</p></div>
        <div><span class="tc-label">Cuenta bancaria</span><p>${esc(masked(r.account))}</p><span class="tc-status">${esc(labels[r.status])}</span></div>
        <button class="btn secondary" data-edit="${esc(r.origin.codigo)}">${r.beneficiary ? 'Ver y editar' : 'Relacionar cuenta'}</button>
      </article>`).join('') || '<p class="empty">No hay comercios que coincidan con esta búsqueda.</p>';
      $('#clientPage').textContent = `Página ${page+1} de ${Math.max(1,Math.ceil(filtered.length/10))}`;
      $('#clientPrev').disabled = page === 0;
      $('#clientNext').disabled = (page+1)*10 >= filtered.length;
    }
    function bankFields(b) {
      const bank = accounts.filter(a=>a.beneficiary_id===b?.id && a.activo)
        .sort((a,c)=>String(c.validada_at||c.created_at).localeCompare(String(a.validada_at||a.created_at)))[0];
      const f = $('#clientForm').elements;
      f.name.value = b?.nombre || ''; f.identification.value = b?.identificacion || '';
      f.bank.value = bank?.banco || ''; f.accountType.value = bank?.tipo_cuenta || 'ahorros'; f.accountNumber.value = bank?.numero_cuenta || '';
      f.verified.checked = false;
    }
    function open(code, trigger) {
      const row = rows.find(r=>r.origin.codigo===code);
      if (!row) return;
      if (row.conflict) return message('Este comercio tiene más de un titular activo. Revisa la asociación antes de guardar otra cuenta.',true);
      returnFocus = trigger;
      const f = $('#clientForm'); f.reset();
      f.dataset.origin = code; f.dataset.previous = row.beneficiary?.id || '';
      $('#clientEditorTitle').textContent = row.origin.nombre;
      $('#clientEditorError').textContent = '';
      const available = beneficiaries.filter(b=>b.tipo==='aliado' && b.activo && (!b.origen_codigo || b.origen_codigo===code));
      f.elements.holder.innerHTML = '<option value="">Registrar otro titular</option>' + available.map(b=>`<option value="${esc(b.id)}">${esc(b.nombre)} · ${esc(b.identificacion || 'Sin identificación')}</option>`).join('');
      f.elements.holder.value = row.beneficiary?.id || '';
      bankFields(row.beneficiary);
      $('#clientPrevious').textContent = row.beneficiary ? `Titular actual: ${row.beneficiary.nombre}. Si eliges otro, se relacionará para futuras liquidaciones.` : 'Este comercio todavía no tiene un titular para pagos.';
      const history = accounts.filter(a=>beneficiaries.some(b=>b.id===a.beneficiary_id && b.origen_codigo===code));
      $('#clientAccountHistory').innerHTML = history.length ? history.map(a=>`<li>${esc(masked(a))} · ${a.activo ? 'Activa' : 'Anterior'}</li>`).join('') : '<li>No hay cuentas anteriores.</li>';
      $('#clientDialog').showModal();
    }
    async function save(event) {
      event.preventDefault();
      if (saving) return;
      const form = event.currentTarget, values = Object.fromEntries(new FormData(form));
      const check = window.CreditekAliadosCuentas.validateNewBeneficiary({...values,originCode:form.dataset.origin});
      if (!check.ok) { $('#clientEditorError').textContent = check.errors.join(' '); return; }
      if (!values.verified) { $('#clientEditorError').textContent = 'Verifica los datos del titular y de la cuenta antes de guardar.'; return; }
      saving = true;
      $('#clientSave').disabled = true; $('#clientClose').disabled = true;
      $('#clientEditorError').textContent = '';
      const v = check.value;
      let saved = false;
      try {
        const response = await sb.rpc('tesoreria_guardar_cliente_cuenta', {
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
          <h2>Clientes y cuentas</h2><p class="section-copy">Comercios aliados, titulares y cuentas para pagar. No necesitas abrir una liquidación.</p>
          <div class="tc-filters"><label>Buscar cliente o titular<input id="clientSearch" type="search" placeholder="Comercio, ciudad, nombre o identificación"></label>
          <label>Estado de los datos<select id="clientStatus"><option value="">Todos</option>${Object.entries(labels).map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select></label>
          <button id="clientClear" class="btn secondary">Limpiar</button></div>
          <p id="clientNotice" role="status" aria-live="polite"></p><p id="clientCount" class="section-copy"></p>
          <div id="clientList"></div><nav class="tc-pagination" aria-label="Páginas de clientes"><button id="clientPrev" class="btn secondary">Anterior</button><span id="clientPage"></span><button id="clientNext" class="btn secondary">Siguiente</button></nav>
        </section>
        <dialog id="clientDialog" class="tc-dialog" aria-labelledby="clientEditorTitle">
          <header><div><span class="tc-label">Cliente y cuenta bancaria</span><h2 id="clientEditorTitle"></h2></div><button id="clientClose" type="button" class="btn secondary">Cerrar</button></header>
          <p id="clientPrevious" class="section-copy"></p>
          <form id="clientForm"><label>Titular relacionado<select name="holder" id="clientHolder"></select></label>
            <div class="tc-form-grid"><label>Nombre o razón social del titular<input name="name" required minlength="3" maxlength="180" autocomplete="off"></label>
            <label>CC / NIT del titular<input name="identification" inputmode="numeric" required pattern="[0-9]{5,20}" maxlength="20"></label>
            <label>Banco<input name="bank" required minlength="2" maxlength="100"></label>
            <label>Tipo de cuenta<select name="accountType"><option value="ahorros">Ahorros</option><option value="corriente">Corriente</option></select></label>
            <label class="tc-wide">Número completo de cuenta<input name="accountNumber" inputmode="numeric" required pattern="[0-9]{5,30}" maxlength="30" autocomplete="off"></label></div>
            <label class="tc-check"><input type="checkbox" name="verified" required><span>He verificado el titular y los datos bancarios.</span></label>
            <p class="tc-help">Guardar no autoriza ni registra pagos. Las órdenes ya creadas conservan sus datos; los cambios se usarán en futuras liquidaciones.</p>
            <p id="clientEditorError" class="tc-error" role="alert"></p>
            <button id="clientSave" type="submit" class="btn primary">Guardar cliente y cuenta</button>
          </form><details><summary>Cuentas registradas</summary><ul id="clientAccountHistory"></ul></details>
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
      }
      message('Cargando clientes y cuentas…');
      try {await refresh(); message('');}
      catch { message(loaded ? 'No se pudo actualizar. Se conserva la consulta anterior; intenta con Actualizar.' : 'No fue posible consultar clientes y cuentas. Pulsa Actualizar para reintentar.',true); }
    }
    return {mount};
  }
  return {directory,filterRows,masked,create};
}));
