import { catalogApi } from './catalog-api.mjs';
import { buildOrderRequest, sanitizeOrderResponse } from './order-contract.mjs';
import { formatProviderLabel } from './provider-display.mjs';
import {
  buildCanonicalName,
  findSimilarCanonical,
  parseReferenceProposal,
} from './canonical-reference.mjs';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const escapeHtml = value => String(value ?? '—').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

const showAlert = message => {
  const element = $('#catalogAdminAlert');
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('show', Boolean(message));
};

const table = (headers, rows) => {
  if (!rows.length) return '<div class="catalog-empty">Sin información.</div>';
  return `<div class="catalog-table-wrap"><table class="catalog-table"><thead><tr>${
    headers.map(header => `<th>${header.label}</th>`).join('')
  }</tr></thead><tbody>${
    rows.map(row => `<tr>${headers.map(header => `<td>${escapeHtml(row[header.key])}</td>`).join('')}</tr>`).join('')
  }</tbody></table></div>`;
};

let providersCache = [];

const setTab = async name => {
  $$('[data-catalog-tab]').forEach(button => button.classList.toggle('active', button.dataset.catalogTab === name));
  $$('[data-catalog-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.catalogPanel === name));
  if (name === 'stats') await loadStats();
  if (name === 'providers') await loadProvidersAdmin();
  if (name === 'exceptions') await loadExceptions();
};

const refreshProviderSelect = async (selectedId = '') => {
  const providers = await catalogApi.providers({ activeOnly: true });
  const select = $('#catalogProvider');
  select.innerHTML = '<option value="">Seleccionar proveedor</option>' +
    providers.map(provider => `<option value="${escapeHtml(provider.id)}">${escapeHtml(formatProviderLabel(provider))}</option>`).join('');
  if (selectedId && providers.some(provider => provider.id === selectedId)) select.value = selectedId;
  return providers;
};

const renderProviders = () => {
  const needle = $('#catalogProviderSearch').value.trim().toLocaleLowerCase('es');
  const rows = providersCache.filter(provider => (
    `${provider.name} ${provider.commercial_name}`.toLocaleLowerCase('es').includes(needle)
  ));
  $('#catalogProvidersTable').innerHTML = rows.length
    ? `<div class="catalog-table-wrap"><table class="catalog-table"><thead><tr>
        <th>Proveedor</th><th>NIT</th><th>Contacto</th><th>Estado</th><th>Acciones</th>
      </tr></thead><tbody>${rows.map(provider => `<tr>
        <td>${escapeHtml(formatProviderLabel(provider))}</td>
        <td>${escapeHtml(provider.nit)}</td>
        <td>${escapeHtml(provider.contact)}</td>
        <td><span class="catalog-status catalog-status-${provider.status}">${escapeHtml(provider.status)}</span></td>
        <td class="catalog-row-actions">
          <button class="catalog-secondary" type="button" data-edit-provider="${escapeHtml(provider.id)}">Editar</button>
          <button class="catalog-secondary" type="button" data-toggle-provider="${escapeHtml(provider.id)}">${
            provider.status === 'activo' ? 'Desactivar' : 'Activar'
          }</button>
        </td>
      </tr>`).join('')}</tbody></table></div>`
    : '<div class="catalog-empty">No se encontraron proveedores.</div>';
};

const loadProvidersAdmin = async () => {
  providersCache = await catalogApi.providers({ activeOnly: false });
  renderProviders();
};

const openProviderDialog = (provider = null) => {
  const form = $('#catalogProviderForm');
  form.reset();
  $('#catalogProviderId').value = provider?.id || '';
  $('#catalogProviderName').value = provider?.name || '';
  $('#catalogProviderCommercialName').value = provider?.commercial_name || '';
  $('#catalogProviderNit').value = provider?.nit || '';
  $('#catalogProviderContact').value = provider?.contact || '';
  $('#catalogProviderPhone').value = provider?.phone || '';
  $('#catalogProviderEmail').value = provider?.email || '';
  $('#catalogProviderStatus').value = provider?.status || 'activo';
  $('#catalogProviderNotes').value = provider?.notes || '';
  $('#catalogProviderDialogTitle').textContent = provider ? 'Editar proveedor' : 'Nuevo proveedor';
  $('#catalogProviderDialog').showModal();
  $('#catalogProviderName').focus();
};

const closeProviderDialog = () => $('#catalogProviderDialog').close();

const saveProvider = async event => {
  event.preventDefault();
  const button = $('#catalogSaveProvider');
  button.disabled = true;
  try {
    const saved = await catalogApi.saveProvider({
      id: $('#catalogProviderId').value,
      name: $('#catalogProviderName').value,
      commercial_name: $('#catalogProviderCommercialName').value,
      nit: $('#catalogProviderNit').value,
      contact: $('#catalogProviderContact').value,
      phone: $('#catalogProviderPhone').value,
      email: $('#catalogProviderEmail').value,
      status: $('#catalogProviderStatus').value,
      notes: $('#catalogProviderNotes').value,
    });
    closeProviderDialog();
    await Promise.all([loadProvidersAdmin(), refreshProviderSelect(saved.id)]);
    showAlert('Proveedor guardado correctamente.');
  } catch (error) {
    showAlert(error.message);
  } finally {
    button.disabled = false;
  }
};

const toggleProvider = async id => {
  const provider = providersCache.find(item => item.id === id);
  if (!provider) return;
  try {
    await catalogApi.saveProvider({
      ...provider,
      status: provider.status === 'activo' ? 'inactivo' : 'activo',
    });
    await Promise.all([loadProvidersAdmin(), refreshProviderSelect()]);
    showAlert(`Proveedor ${provider.status === 'activo' ? 'desactivado' : 'activado'} correctamente.`);
  } catch (error) {
    showAlert(error.message);
  }
};

const loadStats = async () => {
  const rows = await catalogApi.providerStats();
  $('#catalogStats').innerHTML = table([
    { key: 'provider_name', label: 'Proveedor' },
    { key: 'won_references', label: 'Referencias ganadas' },
    { key: 'won_percentage', label: '% ganado' },
    { key: 'average_cost', label: 'Costo promedio' },
    { key: 'month', label: 'Mes' },
  ], rows);
};

const loadHistory = async () => {
  const search = $('#catalogHistorySearch').value.trim();
  if (!search) {
    $('#catalogHistory').innerHTML = '<div class="catalog-empty">Escribe una referencia para consultar su histórico.</div>';
    return;
  }
  const rows = await catalogApi.history(search);
  $('#catalogHistory').innerHTML = table([
    { key: 'canonical_name', label: 'Referencia' },
    { key: 'provider_name', label: 'Proveedor' },
    { key: 'cost', label: 'Costo' },
    { key: 'created_at', label: 'Fecha' },
    { key: 'won', label: 'Ganó' },
  ], rows);
};

const exceptionLabel = type => ({
  missing_image: 'Referencia nueva por validar',
  unmatched: 'Referencia sin equivalencia',
  not_publishable: 'Producto no publicable',
}[type] || 'Referencia por validar');

const newReferenceFields = (exception, proposal) => `
  <div class="catalog-new-reference" data-new-reference="${escapeHtml(exception.id)}" hidden>
    <div class="catalog-new-reference-grid">
      <label>Marca<input data-canonical-field="brand" value="${escapeHtml(proposal.brand)}"></label>
      <label>Modelo o referencia<input data-canonical-field="model" value="${escapeHtml(proposal.model)}"></label>
      <label>RAM (GB)<input data-canonical-field="ramGb" type="number" min="1" value="${escapeHtml(proposal.ramGb || '')}"></label>
      <label>Almacenamiento (GB)<input data-canonical-field="storageGb" type="number" min="1" value="${escapeHtml(proposal.storageGb || '')}"></label>
      <label>Red<input data-canonical-field="connectivity" value="${escapeHtml(proposal.connectivity)}" placeholder="4G, 5G"></label>
      <label>Colores<input data-canonical-field="colors" value="${escapeHtml(proposal.colors.join(', '))}"></label>
      <label>Categoría<input data-canonical-field="category" value="${escapeHtml(proposal.category)}"></label>
      <label class="catalog-new-reference-name">Nombre canónico<input data-canonical-field="canonicalName" value="${escapeHtml(buildCanonicalName(proposal))}"></label>
    </div>
  </div>`;

const readCanonicalFields = row => {
  const value = field => row.querySelector(`[data-canonical-field="${field}"]`)?.value.trim() || '';
  return {
    brand: value('brand'),
    model: value('model'),
    ramGb: Number(value('ramGb')) || null,
    storageGb: Number(value('storageGb')) || null,
    connectivity: value('connectivity').toUpperCase(),
    colors: value('colors').split(',').map(item => item.trim()).filter(Boolean),
    category: value('category'),
    canonicalName: value('canonicalName'),
  };
};

const renderExceptions = async exceptions => {
  const products = exceptions.length ? await catalogApi.products() : [];
  $('#catalogExceptions').innerHTML = exceptions.length
    ? `<div class="catalog-table-wrap"><table class="catalog-table"><thead><tr><th>Referencia recibida</th><th>Excepción</th><th>Equivalencia canónica</th><th></th></tr></thead><tbody>${
      exceptions.map(exception => {
        const proposal = parseReferenceProposal(exception.source_reference);
        return `<tr data-exception-row="${escapeHtml(exception.id)}">
        <td>${escapeHtml(exception.source_reference)}</td>
        <td>${escapeHtml(exceptionLabel(exception.exception_type))}</td>
        <td><select data-offer-product="${escapeHtml(exception.id)}"><option value="">Seleccionar referencia existente</option>${
          products.map(product => `<option value="${escapeHtml(product.id)}">${escapeHtml(product.canonical_name)}</option>`).join('')
        }<option value="__create__">+ Crear como nueva referencia: “${escapeHtml(exception.source_reference)}”</option></select>
        ${newReferenceFields(exception, proposal)}</td>
        <td><button class="catalog-secondary" data-save-offer="${escapeHtml(exception.id)}">Guardar regla</button></td>
      </tr>`;
      }).join('')
    }</tbody></table></div>`
    : '<div class="catalog-empty">No existen referencias pendientes.</div>';

  $$('[data-offer-product]').forEach(select => select.addEventListener('change', () => {
    const editor = $(`[data-new-reference="${select.dataset.offerProduct}"]`);
    if (editor) editor.hidden = select.value !== '__create__';
  }));

  $$('[data-save-offer]').forEach(button => button.addEventListener('click', async () => {
    const row = button.closest('[data-exception-row]');
    const select = row.querySelector('[data-offer-product]');
    const productId = select.value;
    if (!productId) return showAlert('Completa o selecciona una referencia canónica antes de guardar.');
    button.disabled = true;
    try {
      let forceCreate = false;
      let canonical = null;
      if (productId === '__create__') {
        canonical = readCanonicalFields(row);
        if (!canonical.brand || !canonical.model || !canonical.ramGb || !canonical.storageGb || !canonical.category) {
          throw new Error('Completa o selecciona una referencia canónica antes de guardar.');
        }
        canonical.canonicalName = canonical.canonicalName || buildCanonicalName(canonical);
        const probable = findSimilarCanonical(canonical, products);
        if (probable) {
          const createAnyway = window.confirm(
            `Ya existe una referencia similar. Revísala antes de crear una nueva.\n\n${probable.canonical_name}\n\n¿Deseas crearla de todas formas?`,
          );
          if (!createAnyway) {
            select.value = probable.id;
            row.querySelector('[data-new-reference]').hidden = true;
            throw new Error('Ya existe una referencia similar. Revísala antes de crear una nueva.');
          }
          forceCreate = true;
        }
      }
      await catalogApi.saveOfferRule({
        exception_id: button.dataset.saveOffer,
        canonical_product_id: productId === '__create__' ? '' : productId,
        create_new: productId === '__create__',
        canonical,
        force_create: forceCreate,
      });
      row.remove();
      showAlert(productId === '__create__'
        ? 'Referencia creada y regla guardada correctamente.'
        : 'Regla guardada correctamente.');
    } catch (error) {
      showAlert(error.message);
    } finally {
      if (document.contains(button)) button.disabled = false;
    }
  }));
};

const loadExceptions = async () => {
  $('#catalogExceptions').innerHTML = '<div class="catalog-empty">Cargando referencias pendientes…</div>';
  try {
    await renderExceptions(await catalogApi.exceptions());
  } catch (error) {
    $('#catalogExceptions').innerHTML = '<div class="catalog-empty">No fue posible cargar las referencias pendientes.</div>';
    showAlert(error.message);
  }
};

const renderAnalysis = async result => {

  const preview = result.preview || [];
  $('#catalogPreview').innerHTML = `${table([
    { key: 'name', label: 'Referencia' },
    { key: 'provider_name', label: 'Mejor proveedor' },
    { key: 'cost', label: 'Costo' },
    { key: 'sale_price', label: 'Precio B2B' },
    { key: 'image_status', label: 'Imagen' },
  ], preview)}
  ${result.version_id ? `<div class="catalog-actions"><button class="catalog-primary" id="catalogPublish" data-version="${result.version_id}">PUBLICAR CATÁLOGO</button></div>` : ''}`;
  $('#catalogPublish')?.addEventListener('click', async event => {
    event.currentTarget.disabled = true;
    try {
      await catalogApi.publish(event.currentTarget.dataset.version);
      showAlert('Catálogo publicado correctamente.');
      await window.B2BCatalog.reload();
    } catch (error) {
      showAlert(error.message);
      event.currentTarget.disabled = false;
    }
  });
};

const analyze = async () => {
  const button = $('#catalogAnalyze');
  button.disabled = true;
  showAlert('');
  try {
    const result = await catalogApi.analyze({
      provider_id: $('#catalogProvider').value,
      raw_text: $('#catalogRawText').value,
      utility_type: $('#catalogUtilityType').value,
      utility_value: $('#catalogUtilityValue').value,
    });
    await renderAnalysis(result);
    await loadExceptions();
    await setTab('exceptions');
  } catch (error) {
    showAlert(error.message);
  } finally {
    button.disabled = false;
  }
};

const saveUtility = async () => {
  const button = $('#catalogSaveUtility');
  const value = Number($('#catalogUtilityValue').value);
  if (!Number.isFinite(value) || value < 0) {
    showAlert('Ingresa un valor de utilidad válido.');
    return;
  }
  button.disabled = true;
  try {
    await catalogApi.setUtility($('#catalogUtilityType').value, value);
    showAlert('Regla de utilidad guardada.');
  } catch (error) {
    showAlert(error.message);
  } finally {
    button.disabled = false;
  }
};

const open = async () => {
  $('#vistaCatalogAdmin').hidden = false;
  const [, settings] = await Promise.all([
    refreshProviderSelect(),
    catalogApi.settings(),
  ]);
  if (settings[0]) {
    $('#catalogUtilityType').value = settings[0].utility_type;
    $('#catalogUtilityValue').value = settings[0].utility_value;
  }
  await loadExceptions();
};

const close = () => {
  $('#vistaCatalogAdmin').hidden = true;
};

window.B2BCatalogAdmin = {
  open,
  close,
  authenticate: pin => catalogApi.authenticate(pin),
  adminOrders: () => catalogApi.adminOrders(),
  closePeriod: pedidos => catalogApi.closePeriod(pedidos),
};
window.B2BCatalog = {
  async reload() {
    try {
      const items = await catalogApi.publicCatalog();
      window.__b2bReplaceCatalog(items);
    } catch (error) {
      window.mostrarToast?.(`❌ ${error.message}`);
    }
  },
  async submitOrder(order) {
    const payload = buildOrderRequest(order);
    return sanitizeOrderResponse(await catalogApi.submitOrder(payload));
  },
};

$$('[data-catalog-tab]').forEach(button => button.addEventListener('click', () => setTab(button.dataset.catalogTab)));
$('#catalogAnalyze')?.addEventListener('click', analyze);
$('#catalogSaveUtility')?.addEventListener('click', saveUtility);
$('#catalogNewProvider')?.addEventListener('click', () => openProviderDialog());
$('#catalogCreateProvider')?.addEventListener('click', () => openProviderDialog());
$('#catalogCloseProvider')?.addEventListener('click', closeProviderDialog);
$('#catalogCancelProvider')?.addEventListener('click', closeProviderDialog);
$('#catalogProviderForm')?.addEventListener('submit', saveProvider);
$('#catalogProviderSearch')?.addEventListener('input', renderProviders);
$('#catalogProvidersTable')?.addEventListener('click', event => {
  const edit = event.target.closest('[data-edit-provider]');
  if (edit) openProviderDialog(providersCache.find(provider => provider.id === edit.dataset.editProvider));
  const toggle = event.target.closest('[data-toggle-provider]');
  if (toggle) toggleProvider(toggle.dataset.toggleProvider);
});
$('#catalogProviderDialog')?.addEventListener('click', event => {
  if (event.target === $('#catalogProviderDialog')) closeProviderDialog();
});
$('#catalogRollback')?.addEventListener('click', async event => {
  event.currentTarget.disabled = true;
  try {
    await catalogApi.rollback();
    await window.B2BCatalog.reload();
    showAlert('Versión anterior restaurada correctamente.');
  } catch (error) {
    showAlert(error.message);
  } finally {
    event.currentTarget.disabled = false;
  }
});
let historyTimer;
$('#catalogHistorySearch')?.addEventListener('input', () => {
  clearTimeout(historyTimer);
  historyTimer = setTimeout(() => loadHistory().catch(error => showAlert(error.message)), 250);
});

try {
  $('#catalogAdminMount')?.append($('#vistaCatalogAdmin'));
  await window.B2BCatalog.reload();
  const isAdmin = await catalogApi.isAdmin();
  if (isAdmin === true) await open();
} catch (error) {
  showAlert(error.message);
}
