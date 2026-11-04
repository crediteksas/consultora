(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.KoraCierrePdfZip = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const safe = v => String(v).normalize('NFC').replace(/[\x00-\x1f<>:"/\\|?*]/g, ' ').replace(/\s+/g, ' ').replace(/^[. ]+|[. ]+$/g, '').slice(0, 70) || 'Tienda';
  function archivos(reports) {
    if (!Array.isArray(reports) || !reports.length || reports.length > 100) throw new Error('Prepara entre uno y cien informes Retail para el ZIP.');
    const used = new Set(), stores = new Set(); let month, closed;
    return reports.map(report => {
      const meta = report.pdfBatch, table = report.tables?.[0];
      if (meta?.kind !== 'retail-budget-close' || report.scope?.business !== 'retail' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(meta.mes) || typeof meta.cerrado !== 'boolean' || typeof meta.tiendaCodigo !== 'string' || !meta.tiendaCodigo.trim() || typeof meta.tiendaNombre !== 'string' || !meta.tiendaNombre.trim() || !Array.isArray(report.tables) || report.tables.length !== 1 || table?.headers?.length !== 8 || table.rows?.length !== 4) throw new Error('El informe no tiene el formato de cierre Retail esperado.');
      if (month && month !== meta.mes) throw new Error('Todos los PDF del ZIP deben corresponder al mismo mes.');
      if (closed !== undefined && closed !== meta.cerrado) throw new Error('Los informes no comparten el mismo corte mensual.');
      month = meta.mes; closed = meta.cerrado;
      if (stores.has(meta.tiendaCodigo)) throw new Error('Una tienda aparece dos veces en el ZIP.');
      stores.add(meta.tiendaCodigo);
      for (const row of table.rows) if (!Array.isArray(row) || row.length !== 8 || typeof row[0] !== 'string' || row.slice(1).some(v => v !== null && (typeof v !== 'number' || !Number.isFinite(v)))) throw new Error('El informe contiene valores no verificables.');
      const nombre = `${meta.cerrado ? 'Cierre' : 'Avance'} PPTO ${safe(meta.tiendaNombre)} ${safe(meta.tiendaCodigo)} ${month}.pdf`;
      if (used.has(nombre.toLocaleLowerCase('es'))) throw new Error('Hay nombres duplicados de PDF.');
      used.add(nombre.toLocaleLowerCase('es'));
      return { nombre, mes: month, cerrado: closed };
    });
  }
  // Helvetica/WinAnsi mantiene el texto seleccionable. Puntuación tipográfica se normaliza,
  // sin cambiar valores. Caracteres no representables fallan en lugar de perderse.
  function text(v) {
    const s = String(v ?? '').normalize('NFC').replace(/[\u2010-\u2015\u2212]/g, '-').replace(/[\u00a0\u202f]/g, ' ').replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\u2026/g, '...').replace(/≥/g, '>=').replace(/≤/g, '<=');
    if (/[^\x20-\x7e\u00a0-\u00ff\n\r]/u.test(s)) throw new Error('Un texto del informe contiene caracteres no compatibles con el PDF. Revisa el nombre o las notas.');
    return s;
  }
  function logoSize(image, maxWidth, maxHeight) {
    if (!(image.width > 0 && image.height > 0)) throw new Error('No se pudo determinar el tamaño del logo Creditek.');
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
    return { width: image.width * scale, height: image.height * scale };
  }
  function pdf(report, logo, JsPDF, colors) {
    if (!report.id || !logo || !colors || typeof JsPDF !== 'function' || report.tables?.length !== 1) throw new Error('No se pudo preparar el documento PDF.');
    const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
    const M = 12, W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), width = W - 2 * M, bottom = H - 21;
    const table = report.tables[0];
    const groups = [
      { title: table.heading, columns: [0, 1, 2, 3, 4, 5, 6, 7], widths: [26, 24, 24, 24, 24, 21, 22, 21] },
    ];
    let y = M;
    const font = (size, bold = false, color = '#0B1E3D') => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(color); };
    const lines = (value, max) => doc.splitTextToSize(text(value), max);
    const lh = size => size * .352778 * 1.2;
    function heading(first) {
      const size = logoSize(doc.getImageProperties(logo), first ? 40 : 30, first ? 12 : 9);
      doc.addImage(logo, 'PNG', M, M, size.width, size.height);
      font(first ? 17 : 13, true, '#008A96'); doc.text('KORA', W - M, M + 8, { align: 'right' });
      y = M + 16; font(first ? 15 : 11, true);
      const title = lines(report.title, width); doc.text(title, M, y); y += title.length * lh(first ? 15 : 11) + 1.5;
      if (first) {
        font(7.3, false, '#526075'); const meta = lines(`${report.id} · Generado: ${report.generated}\nResponsable: ${report.user} · ${report.role} · Origen: ${report.route}`, width);
        doc.text(meta, M, y); y += meta.length * lh(7.3) + 3;
        font(7.3); const filters = lines(report.filters.map(([k,v]) => `${k}: ${v}`).join(' · '), width - 6), height = filters.length * lh(7.3) + 4;
        doc.setFillColor('#EAFBFC'); doc.rect(M, y, width, height, 'F'); doc.text(filters, M + 3, y + 4); y += height + 5;
      } else { font(7.5); doc.text(text(report.id), M, y); y += 5; }
      if (y > bottom - 35) throw new Error('El encabezado es demasiado extenso para un PDF legible.');
    }
    function nextPage() { doc.addPage(); heading(false); }
    function ensure(height) { if (y + height > bottom) nextPage(); }
    function tableHeader(group) {
      const { columns, widths } = group;
      font(7.2, true, '#FFFFFF'); const labels = columns.map((column,i) => lines(table.headers[column], widths[i] - 3));
      const h = Math.max(13, ...labels.map(a => a.length * lh(7.2) + 4)); ensure(h + 18);
      let x = M;
      labels.forEach((a,i) => { doc.setFillColor('#0B1E3D'); doc.rect(x,y,widths[i],h,'F'); font(7.2,true,'#FFFFFF'); doc.text(a,x+widths[i]/2,y+(h-a.length*lh(7.2))/2+3,{align:'center',lineHeightFactor:1.2}); x += widths[i]; });
      y += h;
    }
    heading(true);
    for(const group of groups){
      const { columns, widths } = group;
      font(11,true);ensure(25);doc.text(text(group.title),M,y);y+=5;tableHeader(group);
      table.rows.forEach((row,index) => {
        const cells = columns.map((col,i) => {const size=col?8:8;font(size,true);const valueLines=lines(row[col],widths[i]-2);font(6.5);const note=table.rowNotes?.[index]?.[col];const noteLines=note?lines(note,widths[i]-2):[];return {valueLines,noteLines,size,height:valueLines.length*lh(size)+noteLines.length*lh(6.5)+(noteLines.length?1:0)+4};});
        const h=Math.max(15,...cells.map(c=>c.height));if(h>bottom-45)throw new Error('Una fila es demasiado extensa para el PDF.');
        if(y+h>bottom){nextPage();tableHeader(group);if(y+h>bottom)throw new Error('Una fila es demasiado extensa para este encabezado.');}
        let x=M;
        cells.forEach((c,i)=>{
          const col=columns[i],key=table.rowTones?.[index]?.[col],tone=typeof key==='string'&&Object.prototype.hasOwnProperty.call(colors,key)?colors[key]:null;
          const bg=tone?'#'+tone.background:col===0?'#F1F5F9':col===3?'#EFFAFB':index%2?'#F5FAFC':'#FFFFFF',fg=tone?'#'+tone.foreground:'#0B1E3D';
          doc.setFillColor(bg);doc.setDrawColor('#DCE5EB');doc.setLineWidth(.12);doc.rect(x,y,widths[i],h,'FD');
          const content=c.height-4,base=y+(h-content)/2+c.size*.352778*.8,tx=x+widths[i]/2;
          font(c.size,true,fg);doc.text(c.valueLines,tx,base,{align:'center',lineHeightFactor:1.2});
          if(c.noteLines.length){font(6.5,false,tone?fg:'#526075');doc.text(c.noteLines,tx,base+c.valueLines.length*lh(c.size)+1,{align:'center',lineHeightFactor:1.2});}
          x+=widths[i];
        });y+=h;
      });
      y+=5;
    }
    y+=4;ensure(8);font(10,true);doc.text('Notas y alcance',M,y);y+=4;
    for(const note of report.notes||[]){font(7.3,false,'#526075');const a=lines(note,width-4);for(const line of a){ensure(lh(7.3)+1);font(7.3,false,'#526075');doc.text(line,M+2,y);y+=lh(7.3);}y+=1;}
    const pages=doc.getNumberOfPages();
    for(let page=1;page<=pages;page++){
      doc.setPage(page);doc.setDrawColor('#B7E8EB');doc.line(M,H-20,W-M,H-20);font(7,true);doc.text(text(`Trazabilidad KORA · ${report.id}`),M,H-15);doc.text(`Página ${page} de ${pages}`,W-M,H-15,{align:'right'});
      font(7,false,'#526075');doc.text(text('Creditek S.A.S. · NIT 901.259.859-0 · Valores en COP cuando aplique.'),M,H-11);doc.text('Información visible con filtros y permisos al generar el informe; no acredita un pago ni un saldo bancario.',M,H-7);
    }
    doc.setProperties({title:text(report.title),author:'Creditek S.A.S.',subject:text(`Cierre mensual · ${report.id}`)});
    return new Uint8Array(doc.output('arraybuffer'));
  }
  return Object.freeze({ archivos, pdf, logoSize });
});
