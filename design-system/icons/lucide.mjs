const defaultAttributes = {
  'aria-hidden': 'true',
  focusable: 'false',
  'stroke-width': '1.75',
};

export function renderLucideIcons(lucide, options = {}) {
  if (!lucide || typeof lucide.createIcons !== 'function') {
    throw new TypeError('Se requiere la API oficial de Lucide');
  }

  lucide.createIcons({
    attrs: { ...defaultAttributes, ...options.attrs },
    icons: options.icons,
    nameAttr: 'data-lucide',
  });
}

export function labelIconButton(button, label) {
  if (!button || !label) throw new TypeError('IconButton requiere elemento y etiqueta');
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
}
