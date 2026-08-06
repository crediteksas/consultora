(function (global) {
  'use strict';

  const PIECES_URL = 'https://ditiwpndvmyuqcagupea.supabase.co/rest/v1/calendario_piezas?select=id,fecha,tipo,estado,plataformas&order=fecha.desc&limit=500';
  const PIECES_KEY = 'sb_publishable_oVNantrnKzXdtXu5B7YQIg_9fxHp7aW';
  const ORIGINS_URL = 'https://creditek-clientes.comercial-853.workers.dev/api/origenes';

  const text = value => String(value ?? '').trim();
  const key = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-CO');

  function normalizeOrigins(rows) {
    const normalized = (Array.isArray(rows) ? rows : []).map(row => ({
      codigo: text(row.codigo),
      nombre: text(row.nombre),
      tipo: key(row.tipo),
      ciudad: text(row.ciudad),
    }));
    const allies = normalized.filter(row => row.tipo === 'aliado');
    const owned = normalized.filter(row => row.tipo === 'propia');
    const citiesMap = new Map();
    allies.forEach(row => {
      if (row.ciudad && !citiesMap.has(key(row.ciudad))) citiesMap.set(key(row.ciudad), row.ciudad);
    });
    return { allies, owned, cities: [...citiesMap.values()].sort((a, b) => a.localeCompare(b, 'es')) };
  }

  function summarizePieces(rows) {
    const summary = { total: 0, pending: 0, drafts: 0, scheduled: 0, errors: 0, approval: 0, published: 0 };
    (Array.isArray(rows) ? rows : []).forEach(row => {
      summary.total += 1;
      const state = key(row.estado_formal || row.estado);
      if (['borrador', 'generado'].includes(state)) summary.drafts += 1;
      else if (['programado', 'publicando'].includes(state)) summary.scheduled += 1;
      else if (['error', 'requiere_revision'].includes(state)) summary.errors += 1;
      else if (['en_revision', 'aprobado', 'generando_imagen', 'listo_para_publicar', 'lista_para_publicar'].includes(state)) summary.approval += 1;
      else if (state === 'publicado') summary.published += 1;
      else summary.pending += 1;
    });
    return summary;
  }

  function resolveSelection(cities, allyCodes, allies) {
    const selectedCities = (cities || []).filter(value => value && value !== '*');
    const selectedAllies = (allyCodes || []).filter(value => value && value !== '*');
    const derivedCities = selectedAllies.map(code => allies.find(ally => ally.codigo === code)?.ciudad).filter(Boolean);
    return {
      cities: [...new Set([...selectedCities, ...derivedCities])],
      allies: [...new Set(selectedAllies)],
    };
  }

  function selectedValues(select) {
    const values = [...select.selectedOptions].map(option => option.value);
    return values.includes('*') ? [] : values;
  }

  function option(value, label, selected = false) {
    const node = document.createElement('option');
    node.value = value;
    node.textContent = label;
    node.selected = selected;
    return node;
  }

  function renderOrigins(data) {
    const citySelect = document.getElementById('publisher-city-filter');
    const allySelect = document.getElementById('publisher-ally-filter');
    citySelect.replaceChildren(option('*', `Todas las ciudades (${data.cities.length})`, true));
    data.cities.forEach(city => citySelect.append(option(city, city)));
    allySelect.replaceChildren(option('*', `Todos los aliados (${data.allies.length})`, true));
    data.allies.forEach(ally => allySelect.append(option(ally.codigo, `${ally.nombre} · ${ally.ciudad || 'Ciudad no registrada'}`)));
    document.getElementById('publisher-source-count').textContent = `${data.allies.length} aliados · ${data.cities.length} ciudades · ${data.owned.length} tiendas propias separadas`;
  }

  function stateLabel(row) {
    const state = key(row.estado_formal || row.estado);
    return ({
      sin_imagen: 'Pendiente', borrador: 'Borrador', generado: 'Borrador', en_revision: 'Pendiente de aprobación',
      aprobado: 'Aprobado', lista_para_publicar: 'Pendiente de aprobación', listo_para_publicar: 'Listo para publicar',
      programado: 'Programado', publicando: 'Publicando', publicado: 'Publicado', error: 'Error', requiere_revision: 'Con error',
    })[state] || text(row.estado_formal || row.estado || 'Pendiente');
  }

  function renderPieces(rows) {
    const summary = summarizePieces(rows);
    document.getElementById('publisher-summary').innerHTML = [
      ['Pendientes', summary.pending], ['Borradores', summary.drafts], ['Programadas', summary.scheduled],
      ['Con error', summary.errors], ['Por aprobar', summary.approval], ['Total', summary.total],
    ].map(([label, value]) => `<span><b>${value}</b>${label}</span>`).join('');
    const list = document.getElementById('publisher-list');
    list.replaceChildren();
    rows.slice(0, 20).forEach(row => {
      const item = document.createElement('div');
      item.className = 'publisher-row';
      const networks = Array.isArray(row.plataformas) ? row.plataformas.join(', ') : 'Sin red registrada';
      const identity = document.createElement('span');
      const date = document.createElement('b');
      date.textContent = text(row.fecha) || 'Sin fecha';
      identity.append(date, document.createTextNode(text(row.tipo) || 'Publicación'));
      const social = document.createElement('span');
      social.textContent = networks;
      const location = document.createElement('span');
      location.textContent = 'Ubicación histórica no registrada';
      const state = document.createElement('strong');
      state.textContent = stateLabel(row);
      item.append(identity, social, location, state);
      list.append(item);
    });
    document.getElementById('publisher-pending-count').textContent = `${summary.total} registros reales`;
  }

  function updateSelection(data) {
    const selection = resolveSelection(
      selectedValues(document.getElementById('publisher-city-filter')),
      selectedValues(document.getElementById('publisher-ally-filter')),
      data.allies,
    );
    const cities = selection.cities.length ? selection.cities.join(', ') : 'todas las ciudades de aliados';
    const allies = selection.allies.length ? `${selection.allies.length} aliado(s)` : 'todos los aliados';
    document.getElementById('publisher-selection').textContent = `Configuración de publicación: ${cities} · ${allies}`;
  }

  async function init() {
    const panel = document.getElementById('publisher-pending');
    if (!panel) return;
    try {
      const [piecesResponse, originsResponse] = await Promise.all([
        fetch(PIECES_URL, { headers: { apikey: PIECES_KEY }, cache: 'no-store' }),
        fetch(ORIGINS_URL, { cache: 'no-store' }),
      ]);
      if (!piecesResponse.ok) throw new Error(`PENDIENTES_${piecesResponse.status}`);
      if (!originsResponse.ok) throw new Error(`ALIADOS_${originsResponse.status}`);
      const pieces = await piecesResponse.json();
      const originsPayload = await originsResponse.json();
      if (!originsPayload.ok) throw new Error('ALIADOS_NO_DISPONIBLES');
      const data = normalizeOrigins(originsPayload.origenes);
      renderPieces(pieces);
      renderOrigins(data);
      updateSelection(data);
      for (const id of ['publisher-city-filter', 'publisher-ally-filter']) {
        document.getElementById(id).addEventListener('change', event => {
          if ([...event.target.selectedOptions].some(item => item.value !== '*')) event.target.options[0].selected = false;
          if (event.target.selectedOptions.length === 0) event.target.options[0].selected = true;
          updateSelection(data);
        });
      }
      panel.dataset.state = 'ready';
    } catch (error) {
      panel.dataset.state = 'error';
      document.getElementById('publisher-error').textContent = `No se pudieron cargar los pendientes (${text(error.message)}).`;
    }
  }

  global.CreditekRedesPublicador = Object.freeze({ normalizeOrigins, summarizePieces, resolveSelection, init });
  if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', init);
})(typeof window !== 'undefined' ? window : globalThis);
