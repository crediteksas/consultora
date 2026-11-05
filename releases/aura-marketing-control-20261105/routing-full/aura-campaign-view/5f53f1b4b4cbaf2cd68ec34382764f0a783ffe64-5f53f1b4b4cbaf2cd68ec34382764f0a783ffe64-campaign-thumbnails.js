(() => {
  const previews = new Map();
  const pending = new Set();
  let working = false;
  const safeImage = value => typeof value === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(value) && value.length < 90000;
  function openPreview(data) {
    const dialog = document.createElement('dialog');
    dialog.className = 'campaign-preview-dialog';
    const close = document.createElement('button');
    close.textContent = 'Cerrar'; close.autofocus = true;
    close.onclick = () => dialog.close();
    const title = document.createElement('h2'); title.textContent = 'Piezas de la campaña';
    dialog.append(close, title);
    const note = document.createElement('p');
    note.textContent = data.stale ? 'Última copia guardada; no se pudo confirmar la pieza actual.' : 'Miniaturas de referencia. No modifican la publicación original.';
    if (data.partial) note.textContent += ' Vista limitada a los primeros 5 anuncios.';
    dialog.append(note);
    for (const item of data.items.filter(item => safeImage(item.image))) {
      const figure = document.createElement('figure');
      const img = document.createElement('img'); img.src = item.image; img.alt = item.name || 'Pieza del anuncio';
      const caption = document.createElement('figcaption'); caption.textContent = item.name || 'Anuncio ' + item.adId;
      figure.append(img, caption); dialog.append(figure);
    }
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    document.body.append(dialog); dialog.showModal();
  }
  function paint(id, data) {
    document.querySelectorAll('[data-campaign-thumbnail]').forEach(slot => {
      if (slot.dataset.campaignThumbnail !== id) return;
      slot.replaceChildren();
      const items = (data.items || []).filter(item => safeImage(item.image));
      if (!items.length) {
        slot.textContent = data.stale ? 'No se pudo cargar la miniatura' : 'Sin imagen disponible';
        const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Reintentar';
        retry.setAttribute('aria-label', 'Reintentar miniatura de esta campaña');
        retry.onclick = () => { previews.delete(id); slot.textContent = 'Cargando miniatura…'; window.loadCampaignThumbnails(); };
        slot.append(retry); return;
      }
      const button = document.createElement('button'); button.type = 'button'; button.className = 'campaign-thumb-button';
      button.setAttribute('aria-label', 'Ver piezas de esta campaña');
      const img = document.createElement('img'); img.src = items[0].image; img.alt = items[0].name || 'Miniatura del anuncio'; img.loading = 'lazy';
      img.onerror = () => { button.replaceChildren(document.createTextNode('Sin miniatura')); };
      button.append(img);
      if (items.length > 1 || data.stale) {
        const label = document.createElement('span'); label.textContent = data.stale ? 'Guardada' : '+' + (items.length - 1); button.append(label);
      }
      button.onclick = () => openPreview({ ...data, items }); slot.append(button);
    });
  }
  window.loadCampaignThumbnails = async function () {
    document.querySelectorAll('[data-campaign-thumbnail]').forEach(slot => {
      const id = slot.dataset.campaignThumbnail;
      if (!/^\d{1,30}$/.test(id)) return;
      const saved = previews.get(id);
      const fresh = saved && Date.now() - saved.loadedAt < (saved.items?.length ? 3600000 : 60000);
      if (fresh) paint(id, saved); else pending.add(id);
    });
    if (working) return;
    working = true;
    try {
      while (pending.size) {
        const ids = [...pending].slice(0, 10); ids.forEach(id => pending.delete(id));
        try {
          const result = await metaWorkerRequest('/v1/campaign/thumbnails?ids=' + ids.join(','));
          for (const id of ids) {
            const data = result.campaigns?.find(row => row.campaignId === id) || { items: [], stale: true };
            data.loadedAt = Date.now(); previews.set(id, data); paint(id, data);
          }
        } catch { ids.forEach(id => paint(id, { items: [], stale: true })); }
      }
    } finally { working = false; }
  };
  document.addEventListener('DOMContentLoaded', window.loadCampaignThumbnails);
})();
