(function () {
  'use strict';

  const LOGO = '/creditek/shared/branding/creditek-logo.png';
  const EXCELJS = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
  const COLORS = { navy: '0B1E3D', teal: '00C4CC', pale: 'EAFBFC', gray: '64748B', white: 'FFFFFF' };
  let mounted = false;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const textHeader = /(?:^|\b)(?:id|imei|serial|c[oó]digo|identificaci[oó]n|nit|cuenta|tel[eé]fono|documento|consecutivo)(?:\b|$)/i;
  const amountHeader = /(?:^|\b)(?:valor|total|costo|precio|pago|pagamos|utilidad|saldo|abono|bono|gasto|ingreso|egreso|efectivo|facturado|cartera|comisi[oó]n)(?:\b|$)/i;
  const sumHeader = /(?:^|\b)(?:cantidad|unidades?|operaciones?|ventas?|compras?|valor|total|costo|pago|pagamos|utilidad|saldo|abono|bono|gasto|ingreso|egreso|efectivo|facturado|cartera|comisi[oó]n)(?:\b|$)/i;
  const percentHeader = /%|porcentaje|margen|participaci[oó]n|tasa/i;
  const excelColumn = index => {let name='';for(let n=index+1;n;n=Math.floor((n-1)/26))name=String.fromCharCode(65+(n-1)%26)+name;return name;};
  const quoteSheet = name => `'${String(name).replaceAll("'","''")}'`;
  function colombianNumber(value) {
    const normalized=clean(value).replace(/\s/g,'').replace(/^\$/,'');
    if(!/^-?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?$/.test(normalized))return null;
    const parsed=Number(normalized.replaceAll('.','').replace(',','.'));
    return Number.isFinite(parsed)?parsed:null;
  }
  function typedCell(value,header='') {
    const raw=clean(value);if(!raw)return {value:'',kind:'blank',format:'General'};
    if(textHeader.test(header))return {value:raw,kind:'text',format:'@'};
    const percent=raw.match(/^(-?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?)\s*%$/);
    if(percent){const number=colombianNumber(percent[1]);if(number!=null)return {value:number/100,kind:'percent',format:'0.0%'};}
    const iso=raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:\b|T)/),local=raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if((/fecha|corte|vencimiento|generado|aprobaci[oó]n/i.test(header))&&(iso||local)){
      const parts=iso?[Number(iso[1]),Number(iso[2]),Number(iso[3])]:[Number(local[3]),Number(local[2]),Number(local[1])];
      return {value:new Date(Date.UTC(parts[0],parts[1]-1,parts[2],12)),kind:'date',format:'dd/mm/yyyy'};
    }
    const number=colombianNumber(raw);
    if(number!=null&&(raw.includes('$')||amountHeader.test(header)))return {value:number,kind:'currency',format:'"$"#,##0.00'};
    if(number!=null&&/cantidad|unidades?|operaciones?|ventas?|compras?|cr[eé]ditos?|d[ií]as?/i.test(header))return {value:number,kind:'number',format:'#,##0'};
    if(number!=null&&percentHeader.test(header))return {value:number>1?number/100:number,kind:'percent',format:'0.0%'};
    return {value:raw,kind:'text',format:'@'};
  }
  const visible = element => !!element && !element.closest('[hidden],.hidden,.modal:not(.show),dialog:not([open]),[data-kora-no-export]') && getComputedStyle(element).display !== 'none';
  const nowBogota = () => new Intl.DateTimeFormat('es-CO', { timeZone:'America/Bogota', dateStyle:'medium', timeStyle:'short' }).format(new Date());
  const stamp = () => new Intl.DateTimeFormat('en-CA', { timeZone:'America/Bogota', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false }).formatToParts(new Date()).reduce((m,p)=>(m[p.type]=p.value,m),{});
  function reportId() { const p=stamp(),random=crypto.getRandomValues(new Uint16Array(1))[0].toString(16).padStart(4,'0').toUpperCase();return `KORA-REP-${p.year}${p.month}${p.day}-${p.hour}${p.minute}${p.second}-${random}`; }
  function pageTitle() { return clean(document.querySelector('.main-content h1,.page h1,main h1,.kora-topbar__title')?.textContent || document.title || 'Informe KORA'); }
  function labelFor(input) { return clean(input.closest('label')?.querySelector('span,.field-label')?.textContent || document.querySelector(`label[for="${CSS.escape(input.id||'')}"]`)?.textContent || input.getAttribute('aria-label') || input.name || input.id); }
  function selectedValue(input) { return input.tagName === 'SELECT' ? clean(input.selectedOptions[0]?.textContent) : clean(input.value); }
  function reportScope(profile) {
    const role=clean(profile?.rol).toLowerCase(),ownStore=['admin_tienda','asesor'].includes(role);
    const selector=document.querySelector('#koraStoreSelector,#sidebarTiendaSel,[data-kora-store-selector]');
    const selectedStore=selector?.value?clean(selector.selectedOptions?.[0]?.textContent):'';
    const shellStore=clean(document.querySelector('[data-kora-retail-store] span')?.textContent);
    const code=clean(profile?.tienda_codigo);
    if(ownStore)return {label:shellStore||code||'Mi tienda',code,restricted:true};
    if(selectedStore)return {label:selectedStore,code:clean(selector.value),restricted:false};
    return {label:'Todas las tiendas autorizadas',code:'',restricted:false};
  }
  function filters() {
    const roots = document.querySelectorAll('.toolbar,.filters,.filter-bar,.dashboard-filterbar,.kora-report-filters,[aria-label*="Filtro" i],[aria-label*="Período" i]');
    const seen = new Set(), result = [];
    roots.forEach(root => root.querySelectorAll('input,select').forEach(input => {
      if (seen.has(input) || !visible(input) || ['password','file','hidden'].includes(input.type)) return;
      seen.add(input); const label=labelFor(input),value=selectedValue(input);
      if (label && value) result.push([label,value]);
    }));
    return result;
  }
  function metrics() {
    const selectors = '.metric,.kpi-card,.dashboard-metric,.resumen-card,.summary-card,.stat-card';
    return [...document.querySelectorAll(selectors)].filter(visible).map(card => {
      const label=clean(card.querySelector('small,.kpi-label,.kpi-name,.label,[class*="label"]')?.textContent);
      const value=clean(card.querySelector('strong,.kpi-value,.kpi-valor,.value,[class*="value"]')?.textContent);
      return label && value ? [label,value] : null;
    }).filter(Boolean).filter((item,index,array)=>array.findIndex(x=>x[0]===item[0]&&x[1]===item[1])===index);
  }
  function tables() {
    return [...document.querySelectorAll('main table,.main-content table,.kora-shell-content table')].filter(visible).map((table,index) => {
      const heading=clean(table.closest('section,.card,.table-card,.panel')?.querySelector('h2,h3,.panel-title')?.textContent)||`Detalle ${index+1}`;
      const rawHeaders=[...table.querySelectorAll('thead th')].map(th=>clean(th.textContent)),kept=rawHeaders.map((header,column)=>({header,column})).filter(({header})=>header&&!/^acciones?$/i.test(header));
      const headers=kept.map(item=>item.header);
      const rows=[...table.querySelectorAll('tbody tr')].filter(visible).map(tr=>{const cells=[...tr.querySelectorAll(':scope > td')];return kept.map(({column})=>clean(cells[column]?.textContent));}).filter(row=>row.some(Boolean));
      return { sourceId:table.querySelector('tbody')?.id || '', heading, headers:headers.length?headers:(rows[0]?.map((_,i)=>`Columna ${i+1}`)||[]), rows };
    }).filter(table=>table.headers.length||table.rows.length);
  }
  function snapshot(profile) {
    const scope=reportScope(profile),appliedFilters=filters();
    appliedFilters.unshift(['Alcance del informe',scope.code?`${scope.label} · ${scope.code}`:scope.label]);
    return { id:reportId(), title:pageTitle(), route:location.pathname+location.search+location.hash, generated:nowBogota(), user:profile?.nombre||profile?.email||'Usuario KORA', role:profile?.rol||'', scope, filters:appliedFilters, metrics:metrics(), tables:tables() };
  }
  async function audit(sb, report, format) {
    if (!sb?.rpc) return;
    const records=report.tables.reduce((n,t)=>n+t.rows.length,0);
    const { error } = await sb.rpc('kora_registrar_exportacion', { p_reporte_id:report.id, p_formato:format, p_ruta:report.route, p_titulo:report.title, p_filtros:Object.fromEntries(report.filters), p_registros:records });
    if (error) console.warn('[KORA Reportes] No se registró la exportación', error.message);
  }
  function loadScript(id,src,globalName){if(window[globalName])return Promise.resolve(window[globalName]);return new Promise((resolve,reject)=>{const prior=document.getElementById(id);if(prior){prior.addEventListener('load',()=>resolve(window[globalName]),{once:true});prior.addEventListener('error',reject,{once:true});return}const script=document.createElement('script');script.id=id;script.src=src;script.onload=()=>resolve(window[globalName]);script.onerror=()=>reject(new Error('No fue posible cargar el generador de Excel.'));document.head.appendChild(script)})}
  async function logoBase64(){const response=await fetch(LOGO);if(!response.ok)throw new Error('No fue posible cargar el logo Creditek.');const blob=await response.blob();return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)})}
  function filename(report,extension){return `${report.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'informe-kora'}-${report.id}.${extension}`}
  function structuredSheet(workbook, table, index, report) {
    const lastColumn = excelColumn(table.headers.length - 1);
    const sheet = workbook.addWorksheet(`${String(index+1).padStart(2,'0')} ${table.heading}`.slice(0,31), {
      views: [{state:'frozen', ySplit:5, xSplit:3, showGridLines:false}]
    });
    sheet.columns = table.columns.map(([,width,format], i) => ({width, style:{numFmt:format || (i>=6 && i<=22 ? table.moneyFormat : 'General')}}));
    sheet.getCell('A2').value = `${table.heading} · ${report.id}`;
    sheet.getCell('A2').font = {name:'Arial',size:14,bold:true,color:{argb:COLORS.navy}};
    sheet.mergeCells('A2:K2');
    sheet.getCell('A3').value = table.note;
    sheet.mergeCells(`A3:${lastColumn}3`);
    sheet.getCell('A3').alignment = {wrapText:true,vertical:'middle'};
    sheet.getRow(3).height = 30;
    const header = sheet.getRow(5);header.values = table.headers;header.height = 42;
    header.eachCell(cell => {
      cell.font={name:'Arial',size:10,bold:true,color:{argb:COLORS.white}};
      cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:COLORS.navy}};
      cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};
    });
    table.rows.forEach((values,i) => {
      const row=sheet.getRow(i+6);row.values=values;row.height=42;
      row.eachCell(cell => {
        const calculated = cell.value && typeof cell.value === 'object' && 'formula' in cell.value;
        cell.font={name:'Arial',size:10,color:{argb:calculated?'111827':typeof cell.value==='number'?'2457A7':COLORS.navy}};
        cell.alignment={vertical:'middle',wrapText:true,horizontal:typeof cell.value==='number'||calculated?'right':'left'};
        if(i%2===0)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'F5FAFC'}};
      });
    });
    const last=table.rows.length+5, total=last+1;
    sheet.getCell(total,1).value='TOTAL INCLUIDAS';
    table.totals.forEach(col => {
      sheet.getCell(`${col}${total}`).value={formula:`IF(COUNTIFS(F6:F${last},"Sí")<>COUNTIFS(F6:F${last},"Sí",${col}6:${col}${last},">=0")+COUNTIFS(F6:F${last},"Sí",${col}6:${col}${last},"<0"),"Faltan datos",SUMIFS(${col}6:${col}${last},F6:F${last},"Sí"))`};
    });
    sheet.getRow(total).height=30;
    sheet.getRow(total).eachCell(cell=>{cell.font={name:'Arial',size:10,bold:true};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:COLORS.pale}};});
    sheet.autoFilter={from:'A5',to:`${lastColumn}${last}`};
    sheet.addConditionalFormatting({ref:`V6:W${last}`,rules:[{type:'expression',formulae:['AND(ISNUMBER(V6),ABS(V6)>0.01)'],style:{font:{bold:true,color:{argb:'B42318'}},fill:{type:'pattern',pattern:'solid',bgColor:{argb:'FFF1F2'}}}}]});
    sheet.addConditionalFormatting({ref:`X6:X${last}`,rules:[{type:'expression',formulae:['X6<>"Coincide"'],style:{font:{bold:true,color:{argb:'B42318'}}}}]});
    sheet.pageSetup={orientation:'landscape',paperSize:8,fitToPage:true,fitToWidth:0,fitToHeight:0,printTitlesRow:'1:5',printTitlesColumn:'A:C'};
    sheet.headerFooter.oddFooter=`Creditek S.A.S. · ${report.id} · Página &P de &N`;
  }
  async function exportExcel(report,sb){
    if(window.KoraReportData?.prepareExcel) report=await window.KoraReportData.prepareExcel(report);
    const ExcelJS=await loadScript('koraExcelJs',EXCELJS,'ExcelJS'),workbook=new ExcelJS.Workbook();workbook.creator='KORA · Creditek S.A.S.';workbook.created=new Date();workbook.subject=`${report.title} · ${report.id}`;workbook.calcProperties.fullCalcOnLoad=true;
    let imageId=null;try{imageId=workbook.addImage({base64:await logoBase64(),extension:'png'})}catch(error){console.warn('[KORA Reportes] Excel continuará sin imagen',error.message)}
    const summary=workbook.addWorksheet('Resumen',{views:[{showGridLines:false}]});summary.properties.defaultRowHeight=20;summary.columns=[{width:28},{width:42},{width:24},{width:24}];summary.mergeCells('A1:D3');if(imageId!==null)summary.addImage(imageId,{tl:{col:.15,row:.15},ext:{width:180,height:52}});summary.mergeCells('A5:D5');summary.getCell('A5').value=report.title;summary.getCell('A5').font={name:'Montserrat',size:20,bold:true,color:{argb:COLORS.navy}};summary.getCell('A6').value='Código de trazabilidad';summary.getCell('B6').value=report.id;summary.getCell('A7').value='Generado';summary.getCell('B7').value=report.generated;summary.getCell('A8').value='Responsable';summary.getCell('B8').value=`${report.user}${report.role?` · ${report.role}`:''}`;summary.getCell('A9').value='Alcance';summary.getCell('B9').value=report.scope?.code?`${report.scope.label} · ${report.scope.code}`:report.scope?.label||'Según permisos del usuario';summary.getCell('A10').value='Ruta de origen';summary.getCell('B10').value=report.route;
    let row=12;if(report.filters.length){summary.getCell(`A${row}`).value='Parámetros aplicados';summary.getCell(`A${row}`).font={bold:true,color:{argb:COLORS.white}};summary.getCell(`A${row}`).fill={type:'pattern',pattern:'solid',fgColor:{argb:COLORS.navy}};summary.mergeCells(`A${row}:D${row}`);row++;report.filters.forEach(([label,value])=>{summary.getCell(`A${row}`).value=label;summary.getCell(`B${row}`).value=value;row++});row++}if(report.metrics.length){summary.getCell(`A${row}`).value='Indicadores visibles';summary.getCell(`A${row}`).font={bold:true,color:{argb:COLORS.white}};summary.getCell(`A${row}`).fill={type:'pattern',pattern:'solid',fgColor:{argb:COLORS.navy}};summary.mergeCells(`A${row}:D${row}`);row++;report.metrics.forEach(([label,value])=>{summary.getCell(`A${row}`).value=label;summary.getCell(`B${row}`).value=value;row++})}
    const controls=[];
    report.tables.forEach((table,index)=>{
      if(table.structured){structuredSheet(workbook,table,index,report);controls.push({sheet:workbook.worksheets.at(-1),heading:table.heading,last:table.rows.length+5,structured:true});return;}
      const sheet=workbook.addWorksheet(`${String(index+1).padStart(2,'0')} ${table.heading}`.slice(0,31),{views:[{state:'frozen',ySplit:5,xSplit:Math.min(2,table.headers.length),showGridLines:false}]});
      const columns=Math.max(table.headers.length,2);sheet.mergeCells(1,1,2,columns);if(imageId!==null)sheet.addImage(imageId,{tl:{col:.1,row:.1},ext:{width:150,height:44}});sheet.mergeCells(4,1,4,columns);sheet.getCell(4,1).value=`${table.heading} · ${report.id}`;sheet.getCell(4,1).font={bold:true,size:14,color:{argb:COLORS.navy}};
      const header=sheet.addRow(table.headers);header.height=34;header.eachCell(cell=>{cell.font={bold:true,color:{argb:COLORS.white}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:COLORS.navy}};cell.alignment={horizontal:'center',vertical:'middle',wrapText:true}});
      const kinds=table.headers.map(()=>new Set());
      table.rows.forEach(values=>{const converted=table.headers.map((title,column)=>{const parsed=typedCell(values[column],title);kinds[column].add(parsed.kind);return parsed;});const row=sheet.addRow(converted.map(cell=>cell.value));converted.forEach((parsed,column)=>{row.getCell(column+1).numFmt=parsed.format;});});
      const last=Math.max(5,table.rows.length+5),totalRow=last+1,controlRow=last+2;
      sheet.getCell(totalRow,1).value='Totales / promedios';sheet.getCell(controlRow,1).value='Registros';sheet.getCell(controlRow,2).value=table.rows.length?{formula:`SUBTOTAL(103,A6:A${last})`,result:table.rows.length}:0;
      table.headers.forEach((title,column)=>{const col=excelColumn(column);if(kinds[column].has('percent')){sheet.getCell(totalRow,column+1).value={formula:`IFERROR(SUBTOTAL(101,${col}6:${col}${last}),"")`};sheet.getCell(totalRow,column+1).numFmt='0.0%';}else if(sumHeader.test(title)&&(kinds[column].has('currency')||kinds[column].has('number'))){sheet.getCell(totalRow,column+1).value={formula:`SUBTOTAL(109,${col}6:${col}${last})`};sheet.getCell(totalRow,column+1).numFmt=kinds[column].has('currency')?'"$"#,##0.00':'#,##0';}});
      [totalRow,controlRow].forEach(rowNumber=>{const row=sheet.getRow(rowNumber);row.height=24;row.eachCell(cell=>{cell.font={bold:true,color:{argb:COLORS.navy}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:COLORS.pale}};});});
      if(table.rows.length)sheet.addTable({name:`KoraTabla${index+1}`,ref:'A5',headerRow:true,totalsRow:false,style:{theme:'TableStyleMedium2',showRowStripes:true},columns:table.headers.map(name=>({name})),rows:table.rows.map((values,rowIndex)=>table.headers.map((title,column)=>typedCell(values[column],title).value))});
      sheet.columns.forEach((column,columnIndex)=>{let width=Math.max(12,Math.min(28,clean(table.headers[columnIndex]).length+2));column.eachCell({includeEmpty:false},cell=>{const value=cell.value instanceof Date?'00/00/0000':clean(cell.value);width=Math.max(width,Math.min(columnIndex<2?38:24,value.length+2));});column.width=width;});
      sheet.eachRow((row,rowNumber)=>{if(rowNumber>5&&rowNumber<totalRow&&rowNumber%2===0)row.eachCell(cell=>cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'F5FAFC'}});row.eachCell(cell=>cell.alignment={vertical:'middle',wrapText:true,horizontal:typeof cell.value==='number'?'right':'left'});});
      if(table.rows.length)sheet.addConditionalFormatting({ref:`A6:${excelColumn(table.headers.length-1)}${last}`,rules:[{type:'containsText',operator:'containsText',text:'REVISAR',style:{font:{bold:true,color:{argb:'B42318'}},fill:{type:'pattern',pattern:'solid',fgColor:{argb:'FFF1F2'}}}},{type:'containsText',operator:'containsText',text:'Faltan datos',style:{font:{bold:true,color:{argb:'B42318'}},fill:{type:'pattern',pattern:'solid',fgColor:{argb:'FFF1F2'}}}}]});
      sheet.headerFooter.oddFooter=`Creditek S.A.S. · ${report.id} · Página &P de &N`;sheet.pageSetup={orientation:table.headers.length>6?'landscape':'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0,paperSize:9};controls.push({sheet,heading:table.heading,last,structured:false});
    });
    if(controls.length){
      row+=2;
      summary.getCell(`A${row}`).value='Control del archivo';summary.getCell(`A${row}`).font={bold:true,color:{argb:COLORS.white}};summary.getCell(`A${row}`).fill={type:'pattern',pattern:'solid',fgColor:{argb:COLORS.navy}};summary.mergeCells(`A${row}:D${row}`);row++;
      summary.getRow(row).values=['Hoja','Contenido','Registros','Control'];summary.getRow(row).eachCell(cell=>{cell.font={bold:true,color:{argb:COLORS.white}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:COLORS.navy}};});row++;
      for(const control of controls){summary.getCell(row,1).value=control.sheet.name;summary.getCell(row,2).value=control.heading;summary.getCell(row,3).value={formula:`COUNTA(${quoteSheet(control.sheet.name)}!A6:A${control.last})`,result:Math.max(0,control.last-5)};summary.getCell(row,4).value='Datos y fórmulas incluidos';row++;}
      summary.getCell(row,2).value='Total de registros';summary.getCell(row,3).value={formula:`SUM(C${row-controls.length}:C${row-1})`};summary.getRow(row).eachCell(cell=>{cell.font={bold:true};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:COLORS.pale}};});
    }
    const buffer=await workbook.xlsx.writeBuffer(),url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})),link=document.createElement('a');link.href=url;link.download=filename(report,'xlsx');link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);await audit(sb,report,'xlsx');
  }
  function pdfTable(table){return `<section><h2>${esc(table.heading)}</h2><table><thead><tr>${table.headers.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${table.rows.map(row=>`<tr>${row.map(x=>`<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`}
  async function exportPdf(report,sb){const popup=window.open('','_blank');if(!popup)throw new Error('Permite ventanas emergentes para generar el PDF.');popup.opener=null;const filterText=report.filters.length?report.filters.map(([k,v])=>`<span><b>${esc(k)}:</b> ${esc(v)}</span>`).join(''):'<span>Sin filtros adicionales</span>';const metricText=report.metrics.map(([k,v])=>`<div><small>${esc(k)}</small><strong>${esc(v)}</strong></div>`).join('');popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(report.title)} · ${esc(report.id)}</title><style>@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{font-family:Montserrat,Arial,sans-serif;color:#0B1E3D;margin:0;font-size:10px}.head{display:flex;justify-content:space-between;gap:24px;border-bottom:4px solid #00C4CC;padding-bottom:10px}.head img{width:155px;max-height:55px;object-fit:contain}.head h1{font-size:22px;margin:6px 0}.meta{text-align:right;line-height:1.55}.filters{display:flex;flex-wrap:wrap;gap:7px;margin:12px 0}.filters span{background:#EAFBFC;border:1px solid #9DE7EA;border-radius:8px;padding:6px 8px}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}.metrics div{border:1px solid #D9E3EA;border-top:3px solid #00C4CC;border-radius:8px;padding:8px}.metrics small{display:block;color:#64748B}.metrics strong{display:block;font-size:15px;margin-top:3px}section{break-inside:auto;margin:15px 0}h2{font-size:14px;margin:0 0 7px}table{width:100%;border-collapse:collapse;font-size:8.5px}thead{display:table-header-group}th{background:#0B1E3D;color:#fff;text-align:left;padding:6px}td{padding:6px;border-bottom:1px solid #DCE5EB;vertical-align:top;overflow-wrap:anywhere}tr{break-inside:avoid}.trace{margin-top:16px;border:1px solid #CAD7DF;background:#F7FAFC;padding:9px;border-radius:8px}.foot{display:flex;justify-content:space-between;margin-top:12px;border-top:1px solid #CAD7DF;padding-top:8px;color:#526075}.tools{position:fixed;right:14px;bottom:14px}.tools button{background:#00C4CC;color:#0B1E3D;border:0;border-radius:10px;padding:12px 18px;font-weight:800}@media print{.tools{display:none}}</style></head><body><header class="head"><div><img src="${LOGO}" alt="Creditek"><h1>${esc(report.title)}</h1></div><div class="meta"><b>${esc(report.id)}</b><br>Generado: ${esc(report.generated)}<br>Responsable: ${esc(report.user)} · ${esc(report.role)}<br>Origen: ${esc(report.route)}</div></header><div class="filters">${filterText}</div>${report.metrics.length?`<div class="metrics">${metricText}</div>`:''}${report.tables.length?report.tables.map(pdfTable).join(''):'<p>No hay tablas visibles para los parámetros actuales.</p>'}<div class="trace"><b>Trazabilidad KORA</b><br>Este informe representa exclusivamente la información visible y los filtros aplicados al momento de su generación. Código: ${esc(report.id)}.</div><footer class="foot"><span><b>Creditek S.A.S. · NIT 901.259.859-0</b></span><span>Documento generado electrónicamente por KORA · valores en COP cuando aplique</span></footer><div class="tools"><button onclick="window.print()">Imprimir / Guardar PDF</button></div></body></html>`);popup.document.close();await audit(sb,report,'pdf')}
  function toast(message,error=false){let node=document.getElementById('koraReportToast');if(!node){node=document.createElement('div');node.id='koraReportToast';node.style.cssText='position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:360px;padding:12px 16px;border-radius:10px;color:#fff;font:600 13px Montserrat,Arial,sans-serif;box-shadow:0 8px 24px rgba(11,30,61,.25)';document.body.appendChild(node)}node.textContent=message;node.style.background=error?'#B42318':'#0B1E3D';node.hidden=false;setTimeout(()=>node.hidden=true,4500)}
  function mount({profile,sb}={}){if(mounted)return;const actions=document.querySelector('.kora-topbar__actions');if(!actions)return;mounted=true;const wrap=document.createElement('div');wrap.style.cssText='position:relative';wrap.innerHTML='<button class="kora-icon-button ghost" type="button" data-kora-report-toggle aria-label="Generar informe" title="Generar informe"><i data-lucide="file-down"></i></button><div data-kora-report-menu hidden style="position:absolute;right:0;top:calc(100% + 8px);z-index:2000;width:230px;background:#fff;border:1px solid #DCE5EB;border-radius:12px;padding:7px;box-shadow:0 14px 34px rgba(11,30,61,.18)"><button type="button" data-format="xlsx" style="display:block;width:100%;padding:10px;border:0;border-radius:8px;background:#fff;text-align:left;font:700 12px Montserrat;color:#0B1E3D;cursor:pointer">Descargar Excel completo</button><button type="button" data-format="pdf" style="display:block;width:100%;padding:10px;border:0;border-radius:8px;background:#fff;text-align:left;font:700 12px Montserrat;color:#0B1E3D;cursor:pointer">Generar PDF</button></div>';actions.insertBefore(wrap,actions.querySelector('[data-kora-help]'));const menu=wrap.querySelector('[data-kora-report-menu]');wrap.querySelector('[data-kora-report-toggle]').onclick=()=>menu.hidden=!menu.hidden;wrap.querySelectorAll('[data-format]').forEach(button=>button.onclick=async()=>{menu.hidden=true;button.disabled=true;try{const report=snapshot(profile);if(button.dataset.format==='xlsx')await exportExcel(report,sb);else await exportPdf(report,sb);toast(`Informe ${button.dataset.format.toUpperCase()} generado · ${report.id}`)}catch(error){toast(error.message||'No fue posible generar el informe.',true)}finally{button.disabled=false}});document.addEventListener('click',event=>{if(!wrap.contains(event.target))menu.hidden=true});window.lucide?.createIcons()}
  window.KoraReportExport={mount,snapshot,typedCell,excelColumn,reportScope};
  document.dispatchEvent(new CustomEvent('kora-report-export-ready'));
})();
