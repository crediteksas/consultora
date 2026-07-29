import { catalogApi } from './catalog-api.mjs';
import { buildOrderRequest, sanitizeOrderResponse } from './order-contract.mjs';

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

const setTab = async name => {
  $$('[data-catalog-tab]').forEach(button => button.classList.toggle('active', button.dataset.catalogTab === name));
  $$('[data-catalog-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.catalogPanel === name));
  if (name === 'stats') await loadStats();
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

const renderAnalysis = async result => {
  const exceptions = result.exceptions || [];
  const products = exceptions.length ? await catalogApi.products() : [];
  $('#catalogExceptions').innerHTML = exceptions.length
    ? `<div class="catalog-table-wrap"><table class="catalog-table"><thead><tr><th>Referencia recibida</th><th>Excepción</th><th>Equivalencia canónica</th><th></th></tr></thead><tbody>${
      exceptions.map(exception => `<tr>
        <td>${escapeHtml(exception.source_reference)}</td>
        <td>${escapeHtml(exception.exception_type)}</td>
        <td><select data-offer-product="${escapeHtml(exception.offer_id)}"><option value="">Seleccionar referencia</option>${
          products.map(product => `<option value="${escapeHtml(product.id)}">${escapeHtml(product.canonical_name)}</option>`).join('')
        }</select></td>
        <td><button class="catalog-secondary" data-save-offer="${escapeHtml(exception.offer_id)}">Guardar regla</button></td>
      </tr>`).join('')
    }</tbody></table></div>`
    : '<div class="catalog-empty">La lista no generó excepciones.</div>';
  $$('[data-save-offer]').forEach(button => button.addEventListener('click', async () => {
    const productId = $(`[data-offer-product="${button.dataset.saveOffer}"]`).value;
    if (!productId) return showAlert('Selecciona una referencia canónica');
    button.disabled = true;
    try {
      await catalogApi.correctOffer(button.dataset.saveOffer, productId);
      button.closest('tr').remove();
      showAlert('Corrección guardada y disponible para futuras listas.');
    } catch (error) {
      showAlert(error.message);
      button.disabled = false;
    }
  }));

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
  const [providers, settings] = await Promise.all([
    catalogApi.providers(),
    catalogApi.settings(),
  ]);
  $('#catalogProvider').innerHTML = '<option value="">Seleccionar proveedor</option>' +
    providers.map(provider => `<option value="${provider.id}">${provider.name}</option>`).join('');
  if (settings[0]) {
    $('#catalogUtilityType').value = settings[0].utility_type;
    $('#catalogUtilityValue').value = settings[0].utility_value;
  }
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
