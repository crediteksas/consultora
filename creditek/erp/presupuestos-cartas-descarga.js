(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.KoraCartasDescarga = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  function periodo(mes) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new Error('Selecciona un mes válido.');
    return meses[Number(mes.slice(5))-1] + ' ' + mes.slice(2,4);
  }
  function seguro(value) {
    return String(value || '').normalize('NFC').replace(/[\x00-\x1f<>:"/\\|?*]/g, ' ')
      .replace(/\s+/g, ' ').replace(/^[. ]+|[. ]+$/g, '').slice(0,90) || 'Tienda';
  }
  function archivos(cartas) {
    if (!cartas?.length) throw new Error('No hay cartas para descargar.');
    const pendientes = cartas.filter(c => !c.completo || c.accesoriosPendientes);
    if (pendientes.length) throw new Error('No se descargó el ZIP. Completa o verifica el presupuesto de: ' + pendientes.map(c => c.tienda.nombre).join(', ') + '.');
    if (cartas.some(c => c.mes !== cartas[0].mes)) throw new Error('Las cartas deben corresponder al mismo mes.');
    const usados = new Set();
    return cartas.map(c => {
      const base = 'PPTO ' + seguro(c.tienda.nombre) + ' ' + periodo(c.mes);
      let nombre = base + '.pdf', n = 1;
      while (usados.has(nombre.toLocaleLowerCase('es'))) nombre = base + ' (' + (++n) + ').pdf';
      usados.add(nombre.toLocaleLowerCase('es'));
      return { nombre, carta:c };
    });
  }
  // Una sola plantilla: la misma cartaHtml que utiliza la vista previa de KORA.
  // Se captura a 3x para conservar CSS grid, tipografía, logo y premios sin otro diseño.
  async function pdf(c, logo, JsPDF, plantilla = globalThis.KoraPresupuestosRetailCartas) {
    archivos([c]);
    if (!plantilla?.cartaHtml) throw new Error('No se pudo cargar la plantilla de la carta.');
    const logoUrl = 'data:image/png;base64,' + btoa(Array.from(logo, b => String.fromCharCode(b)).join(''));
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;height:1200px;border:0;pointer-events:none';
    const html = plantilla.cartaHtml(c).replace('</head>', '<style>.print-action{display:none!important}</style></head>')
      .replace('src="/creditek/shared/branding/creditek-logo.png"', 'src="' + logoUrl + '"');
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('La carta tardó demasiado en prepararse. Intenta de nuevo.')), 15000);
        frame.onload = () => { clearTimeout(timer); resolve(); };
        frame.srcdoc = html;
        document.body.appendChild(frame);
      });
      const source = frame.contentDocument;
      await source.fonts.ready;
      await Promise.all(Array.from(source.images, img => img.decode()));
      const height = Math.ceil(source.body.getBoundingClientRect().height);
      if (!height || height > 1600) throw new Error('La carta excede el tamaño seguro de una página. Revisa los nombres y la estrategia.');
      const xhtml = new XMLSerializer().serializeToString(source.documentElement);
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="794" height="' + height + '"><foreignObject width="100%" height="100%">' + xhtml + '</foreignObject></svg>';
      const picture = new Image();
      picture.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      await picture.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 794 * 3; canvas.height = height * 3;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Tu navegador no pudo preparar la carta PDF.');
      context.scale(3, 3); context.fillStyle = '#fff'; context.fillRect(0, 0, 794, height);
      context.drawImage(picture, 0, 0);
      const doc = new JsPDF({unit:'mm',format:'a4',compress:true});
      const width = Math.min(210, 297 * 794 / height);
      doc.addImage(canvas.toDataURL('image/png'), 'PNG', (210-width)/2, 0, width, height*width/794, undefined, 'FAST');
      doc.setProperties({title:'PPTO '+c.tienda.nombre+' '+periodo(c.mes),author:'Creditek',subject:'Presupuesto mensual por tienda'});
      return new Uint8Array(doc.output('arraybuffer'));
    } finally {
      frame.remove();
    }
  }
  return Object.freeze({periodo,archivos,pdf});
});
