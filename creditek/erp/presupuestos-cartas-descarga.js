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
  // PDF vectorial: texto seleccionable, logo original y sin servicios externos.
  function pdf(c, logo, JsPDF) {
    archivos([c]);
    const doc = new JsPDF({unit:'mm',format:'a4',compress:true});
    const navy = '#112640', teal = '#008A91';
    const money = v => '$ ' + new Intl.NumberFormat('es-CO',{maximumFractionDigits:2}).format(Number(v)||0);
    const number = v => new Intl.NumberFormat('es-CO').format(Number(v)||0);
    const mes = new Intl.DateTimeFormat('es-CO',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(c.mes+'-01T12:00:00Z'));
    let y=16;
    function text(s, size=11, color=navy, bold=false, width=178) {
      doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);doc.setTextColor(color);
      const lines=doc.splitTextToSize(String(s),width), step=size*0.45;
      for(const line of lines){ if(y+step>278){doc.addPage();y=20;} doc.text(line,16,y); y+=step; }
    }
    doc.setDrawColor(teal);doc.setLineWidth(1.2);doc.line(16,y,194,y);
    const props=doc.getImageProperties(logo); const h=38*props.height/props.width;
    doc.addImage(logo,'PNG',16,22,38,h);
    y=Math.max(39,24+h);text('PRESUPUESTO COMERCIAL · '+mes.toUpperCase(),9,teal,true);y+=6;
    text(c.tienda.nombre,24,navy,true);text(mes,14,'#617183');y+=5;
    text('Para',10,'#617183');text(c.administradores?.join(', ') || 'Administración de la tienda',12,navy,true);
    text('Administración de tienda',10,'#617183');y+=5;
    text('Compartimos el presupuesto de tu tienda para '+mes+'. Estas son las metas mensuales para orientar la gestión comercial y el seguimiento de resultados.');y+=6;
    if(y+40>278){doc.addPage();y=20;}
    doc.setFillColor(navy);doc.roundedRect(16,y,178,29,3,3,'F');
    doc.setTextColor('#FFFFFF');doc.setFont('helvetica','bold');doc.setFontSize(10);doc.text('META DE VENTAS DEL MES',22,y+8);
    doc.setFontSize(24);doc.text(money(c.totales.meta_venta_total),22,y+21);y+=39;
    const metricas=[['Créditos','meta_creditos'],['Celulares de contado','meta_uds_cel'],['Accesorios','meta_uds_acc']];
    metricas.forEach(([label,key],i)=>{
      const x=16+i*61;doc.setFillColor('#F3F8FA');doc.roundedRect(x,y,56,25,2,2,'F');
      doc.setTextColor('#617183');doc.setFontSize(9);doc.setFont('helvetica','normal');doc.text(label,x+4,y+7);
      doc.setTextColor(navy);doc.setFontSize(20);doc.setFont('helvetica','bold');doc.text(number(c.totales[key]),x+4,y+18);
    });y+=35;
    if(c.premio?.activo){
      text('PREMIO POR CUMPLIMIENTO',10,teal,true);text(c.premio.estrategia,14,navy,true);y+=3;
      if(c.premio.premio_tres!=null)text('Si cumples exactamente 3 de las 4 metas: '+money(c.premio.premio_tres),12,navy,true);
      if(c.premio.premio_cuatro!=null)text('Si cumples las 4 metas: '+money(c.premio.premio_cuatro),12,navy,true);
      y+=3;text('Las metas son ventas, créditos, celulares de contado y accesorios. Cada meta se cumple al alcanzar el 100% del objetivo mensual. Aplica el premio del nivel alcanzado; los premios no se suman.',9,'#617183');y+=6;
    }
    text('Gracias por tu compromiso con la atención a nuestros clientes y el cumplimiento de las metas de la tienda.');y+=6;
    text('Cordialmente,');text('Gerencia · Creditek',11,navy,true);y+=7;
    text(c.tienda.nombre+' · '+mes+' · Metas registradas en KORA',8,'#617183');
    doc.setProperties({title:'PPTO '+c.tienda.nombre+' '+periodo(c.mes),author:'Creditek',subject:'Presupuesto mensual por tienda'});
    return new Uint8Array(doc.output('arraybuffer'));
  }
  return Object.freeze({periodo,archivos,pdf});
});
