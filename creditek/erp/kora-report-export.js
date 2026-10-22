(function () {
  'use strict';

  const LOGO = '/creditek/shared/branding/creditek-logo.png';
  const EXCELJS = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
  const COLORS = { navy: '0B1E3D', teal: '00C4CC', pale: 'EAFBFC', gray: '64748B', white: 'FFFFFF' };
  let mounted = false;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const textHeader = /(?:^|\b)(?:id|imei|serial|c[oó]digo|identificaci[oó]n|nit|cuenta|tel[eé]fono|documento|consecutivo)(?:\b|$)/i;
  const amountHeader = /(?:^|\b)(?:valor(?:es)?|monto|total|costos?|precios?|pagos?|pagamos|utilidad|margen|saldos?|abonos?|bonos?|gastos?|ingresos?|egresos?|efectivo|facturado|cartera|comisi[oó]n)(?:\b|$)/i;
  const percentHeader = /%|porcentaje|participaci[oó]n|tasa/i;
  const money = value => clean(new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:2,maximumFractionDigits:2}).format(value));
  const numberText = value => new Intl.NumberFormat('es-CO',{maximumFractionDigits:2}).format(value);
  // Contratos explícitos de columnas de la tabla original, antes de quitar acciones.
  // No sumar costos unitarios, saldos corridos ni promediar tasas/porcentajes.
  const TABLE_TOTALS = {
    'gastos.html': {tbodyGastos:{sums:[3],currency:[3]}},
    'cartera-b2b.html': {rows:{sums:[2,3,4],currency:[2,3,4],balances:[1,5]},dRows:{sums:[2,3,4],currency:[2,3,4]}},
    'cuenta-corriente.html': {tbodyTiendas:{balances:[1]},tbodyInstrucciones:{sums:[4],currency:[4]},tbodyAbonosPendientes:{sums:[1],currency:[1]},tbodyDetalle:{sums:[2,3],currency:[2,3]}},
    'proveedores.html': {'tbody-proveedores':{balances:[2]},'tbody-vencimientos':{sums:[4],currency:[4]},'tbody-facturas':{sums:[2],currency:[2],balances:[3]},'tbody-detalle-lineas':{sums:[1,3],currency:[3]},'tbody-detalle-pagos':{sums:[1],currency:[1]},'tbody-aplicaciones-fifo':{sums:[4],currency:[4]}},
    'ventas.html': {tbodyVentas:{sums:[8],currency:[8]}},
    'caja.html': {tbodyConsolidado:{sums:[2,3,4,5,6,7],currency:[2,3,4,5,6,7],note:'Se totalizan flujos de las filas mostradas. Los saldos esperado, contado y diferencias de cierre no se acumulan entre fechas.'},tbodyMovimientosCaja:{sums:[4,5],currency:[4,5],note:'Entradas y salidas del período. El saldo corrido no se suma.'}},
    'conciliacion.html': {tbodyHistorial:{sums:[3,4,5]},tbodyCruzados:{sums:[4,5,6],currency:[4,5,6]},tbodySinCruce:{sums:[3],currency:[3]}},
    'bodega-central.html': {'tbody-alerta':{sums:[4]},'tbody-movimientos':{sums:[2],note:'Cantidad de movimientos registrados; no equivale a existencias actuales.'},'tbody-unidades':{sums:[2,3],currency:[2,3]}},
    'cierre-periodo.html': {tbodyBloques:{sums:[1]}},
    'confirmaciones-deuda.html': {filas:{balances:[2,3]}},
    'tablero.html': {tbodyEjecutivos:{sums:[1,2,3,4,5,6],currency:[6]}},
    'kardex.html': {tbodyKardex:{sums:[5],note:'Cantidad de movimientos del período; no es el inventario disponible. No se suman costos unitarios.'}},
    'ajustes.html': {tbodyAjustes:{sums:[3]}},
    'catalogo.html': {tbodyProductos:{recordOnly:true,note:'Catálogo de referencias: los costos unitarios y márgenes no se suman. No es una valoración de existencias.'}},
    'remisiones.html': {tbodyRemisiones:{sums:[4],currency:[4]}},
    'traslados.html': {tbodyTraslados:{sums:[5]}},
    'inventario.html': {tbodyAccesorios:{sums:[2,5],currency:[5]},tbodyCelulares:{sums:[4,5],currency:[4,5],note:'Cada fila corresponde a una unidad identificada por IMEI. La valoración corresponde a las unidades consultadas.'}},
    'utilidad-creditek.html': {'tbody-tienda':{sums:[1,2,3],currency:[1,2,3],ratios:[[4,3,1]]},'tbody-referencia':{sums:[1,2,3],currency:[1,2,3],ratios:[[4,3,1]]}},
    'reportes.html': {
      'tbody-comparativo-kpis':{kind:'summary',note:'Indicadores agregados de distinta naturaleza. Se comparan por fila; no se suman entre sí.'},
      'tbody-ventas':{sums:[1,2,4,5],currency:[2],ratios:[[3,2,1,'currency']]},
      'tbody-cartera':{balances:[1]},
      'tbody-inventario':{sums:[1,2,3,4],currency:[3,4],note:'Los SKUs se cuentan por tienda: una misma referencia en varias tiendas no representa un SKU único adicional del catálogo.'},
      'tbody-presupuesto':{sums:[1,2,3,5],currency:[1,2,3,5],ratios:[[4,3,2],[6,3,1,'growth']]},
      'tbody-rent-tienda':{sums:[1,2,3,4,5],currency:[1,2,3,4,5],ratios:[[6,5,1]]},
      'tbody-rent-categoria':{sums:[1,2,3,4],currency:[2,3,4],ratios:[[5,4,2]]},
      'tbody-crecimiento':{sums:[1,2],currency:[1,2],ratios:[[3,2,1,'growth']]},
      'tbody-top-vendidos':{sums:[1,2],currency:[2]},
      'tbody-slow-movers':{sums:[1]},
      'tbody-proveedores':{sums:[1,2,3],currency:[2,3]}
    }
  };
  const SCHEMA_TOTALS = {
    'Fecha|Tienda|Movimiento|Beneficiario|Valor|Estado|Acción':{sums:[4],currency:[4]},
    'Fecha|Negocio|Movimiento|Beneficiario|Valor|Estado|Acción':{sums:[4],currency:[4]},
    'Plataforma|Créditos|Valor financiado|Bonos|Utilidad de liquidaciones':{sums:[1,2,3,4],currency:[2,3,4]},
    'Tipo|Establecimiento|Ciudad|Ejecutivo|Operaciones|Ventas|Pago|Provisión|Resultado calculado|Asociación':{sums:[4,5,6,7,8],currency:[5,6,7,8]},
    'Tipo|Establecimiento|Ciudad|Ejecutivo|Operaciones|Ventas|Pago|Provisión|Utilidad disponible|Asociación':{sums:[4,5,6,7,8],currency:[5,6,7,8]},
    'Fecha contable|Concepto|Valor|Autorización real':{sums:[2],currency:[2]},
    'Establecimiento|Plataformas|Créditos|Valor financiado|Ejecutivo Creditek|Estado / acción':{sums:[2,3],currency:[3]},
    'Establecimiento|Plataformas|Vendedor del comercio|Créditos|Ejecutivo Creditek|Acción':{sums:[3]},
    'Fecha de venta|Beneficiario|Tipo|Plataforma|Concepto|Valor|Estado':{sums:[5],currency:[5]},
    'Establecimiento|Tipo|Créditos|Valor vendido':{sums:[2,3],currency:[3]},
    'Plataforma|Créditos|Valor financiado|Pago beneficiarios|Resultado final|Resultado cerrado|Disponible|Pendientes':{sums:[1,2,3,4,5,6,7],currency:[2,3,4,5,6]},
    'Fecha del movimiento|Seleccionar|Tienda|Plataforma|Corte|IMEI|Abono aplicado|Saldo actual de tienda|Estado':{sums:[6],currency:[6],note:'El saldo de la tienda se repite por movimiento: no se suma como una deuda distinta por fila.'},
    'Fecha del movimiento|Tienda origen|Plataforma|Corte|IMEI|Valor comercial|Utilidad / ajuste de Tercerización|Registro contable':{sums:[5,6],currency:[5,6]},
    'Liquidada|Plataforma|Corte|Estado|Operaciones|Pago a comercios|Bonos|Margen liquidado|Total a pagar|Detalle':{sums:[4,5,6,7,8],currency:[5,6,7,8]},
    'Fecha|Plataforma|Establecimiento|Concepto|Beneficiario / cuenta|Valor|Soporte|Estado|Tesorería|Acción':{sums:[5],currency:[5]},
    'Tienda|Plataforma|IMEI|Abono aplicado|Fecha de aplicación|Aplicó|Estado':{sums:[3],currency:[3]},
    'Seleccionar|Tienda|Plataforma|Corte|IMEI|Abono por aplicar':{sums:[5],currency:[5]},
    'Producto|Tienda|Cantidad|Devolución|Referencia':{sums:[2]},
    'Concepto|Guardado en KORA|Recibido de Krediya|Diferencia':{kind:'summary',note:'Comparación por concepto; los componentes no se suman entre sí.'},
    'Proveedor|Referencia original|Costo|Precio propuesto|Estado / motivo|Línea':{recordOnly:true,note:'Precios unitarios de referencias pendientes. No representan compras ni existencias.'},
    'Incluir|Referencia|Proveedor|Costo real|Precio retail|Margen|Origen / motivo':{recordOnly:true,note:'Lista de precios unitarios; no se suman costos, precios ni márgenes.'},
    'Referencia|Proveedor ganador|Costo|Precio retail':{recordOnly:true,note:'Lista de precios unitarios; no corresponde a un pedido con cantidades.'},
    'Referencia|Proveedor elegido|Costo real|Margen|Precio retail':{recordOnly:true,note:'Precios unitarios por referencia, no un valor total de compra.'},
    'Proveedor|Sin dudas|Dudas|Productos excluidos|Estado|Acciones':{sums:[1,2,3]},
    'Elegir|Pedido / tienda|Referencia / proveedor|Pendiente|Costo proveedor|Precio tienda':{sums:[3]},
    'Cliente|Crédito|Tienda|Original|Pagado|Saldo|Estado|Nova|Acciones':{sums:[3,4],currency:[3,4],balances:[5]},
    'Persona|Rol|%|Base ventas|Comisión':{sums:[4],currency:[4],note:'Se totaliza la comisión. Las bases y porcentajes por persona no se suman.'},
    'Producto|Cant.|Precio|Subtotal':{sums:[1,3],currency:[3]},
    'Equipo|Créditos|PVP KORA|PVP archivo|Diferencia por crédito|Diferencia total':{sums:[1,5],currency:[5]},
    'Pedido|Fecha|Estado|Correo a administración|Productos|Unidades|Total retail':{sums:[4,5,6],currency:[6]},
    'Orden|Proveedor|Fecha|Estado|Total estimado|Acciones':{sums:[4],currency:[4]},
    'Ciudad|Referencia|Cantidad total|Costo unitario|Total':{sums:[2,4],currency:[4]},
    'Destino interno|Referencia|Pedido|Recibido|Costo cotizado|Costo factura|Precio tienda|Motivo del cambio':{sums:[3]},
    'Pedido / destino|Referencia|Cantidad|Proveedor|Costo unitario|Precio retail|Total costo':{sums:[2,6],currency:[6]},
    'Referencia / IMEI|Sistema al corte|Reportado al corte|Diferencia|Actual|Propuesto hoy / aplicado|Costo tienda|Valor diferencia|Observación|Decisión':{sums:[1,2,3,4,5,7],currency:[7]},
    'Tienda|Obligación|Beneficiario|Periodicidad|Valor|Estado|Acción':{note:'Obligaciones de distintas periodicidades: sus importes no se suman como si fueran un mismo período.'},
    'Negocio|Obligación|Beneficiario|Periodicidad|Valor|Estado|Acción':{note:'Obligaciones de distintas periodicidades: sus importes no se suman como si fueran un mismo período.'}
  };
  function tablePolicy(sourceId,headers) {
    const name=location.pathname.replace(/\/$/,'').split('/').at(-1);
    const route=name.endsWith('.html')?name:`${name}.html`;
    const dynamic=route==='aliados-ejecutivos.html'&&headers[0]==='Ejecutivo Creditek'?{sums:[2,3,4],currency:[3,4]}:route==='aliados-plataformas.html'&&headers[0]==='Plataforma'&&headers.length===10?{sums:[2,3,4,5,6,7,8,9],currency:[3,4,5,7,8]}:null;
    const policy=TABLE_TOTALS[route]?.[sourceId]||SCHEMA_TOTALS[headers.join('|')]||dynamic||{};
    return {...policy,subtotal:/tbody-(tienda|referencia|top-vendidos|slow-movers)$/.test(sourceId)};
  }
  function totalValue(values,currency=false) {
    const parsed=values.map(value=>typeof value==='number'&&Number.isFinite(value)?value:colombianNumber(value));
    const missing=parsed.filter(value=>value===null).length;
    const value=parsed.reduce((total,n)=>total+(n===null?0:Math.round(n*100)),0)/100;
    const formatted=currency?money(value):numberText(value);
    return {value,missing,text:missing?`Pendiente: ${missing} dato(s) sin registrar · subtotal conocido ${formatted}`:formatted};
  }
  function completeTable(table) {
    if(table.totalRows?.length)return {...table,explicitTotals:true};
    if(table.kind==='summary'&&!table.sumColumns?.length&&!table.balanceColumns?.length)return table;
    if(table.structured){
      const sums=(table.totals||[]).map(column=>column.split('').reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1);
      const plainRows=table.rows.map(row=>row.map(value=>value&&typeof value==='object'&&'formula' in value?value.result:value));
      const included=plainRows.filter(row=>row[5]==='Sí');
      const totals=completeTable({...table,structured:false,rows:included,sumColumns:sums,currencyColumns:sums});
      return {...table,totalRows:totals.totalRows,explicitTotals:true};
    }
    const sums=table.sumColumns||[],balances=table.balanceColumns||[];
    const total=table.headers.map(()=>''),computed=new Map();
    total[0]=table.subtotal?'Subtotal de filas mostradas':'Total';
    for(const column of sums){const result=totalValue(table.rows.map(row=>row[column]),table.currencyColumns?.includes(column));computed.set(column,result);total[column]=result.text;}
    for(const [column,numerator,denominator,format] of table.ratios||[]){
      const a=computed.get(numerator),b=computed.get(denominator);
      total[column]=!a||!b||a.missing||b.missing?'Pendiente de datos':b.value?format==='currency'?money(a.value/b.value):numberText((a.value/b.value-(format==='growth'?1:0))*100)+' %':'No aplica';
    }
    const totalRows=sums.length?[total]:[];
    for(const column of balances){
      const values=table.rows.map(row=>colombianNumber(row[column]));
      for(const [label,predicate,sign] of [['Saldos por pagar / cobrar',n=>n>=0,1],['Saldos a favor (sin compensar terceros)',n=>n<0,-1]]){
        const row=table.headers.map(()=>''),result=totalValue(values.filter(n=>n===null||predicate(n)).map(n=>n===null?'Sin dato':n*sign),true);row[0]=label+(balances.length>1?' · '+table.headers[column]:'');row[column]=result.text;totalRows.push(row);
      }
    }
    if(!totalRows.length){const count=table.headers.map(()=>'' );count[0]=`Total registros: ${table.rows.length}`;totalRows.push(count);}
    return {...table,totalRows,explicitTotals:true};
  }
  function cellText(cell) {
    if(cell.dataset.koraReportValue!==undefined)return clean(cell.dataset.koraReportValue);
    const exact=cell.querySelector('[data-kora-report-value]');
    if(exact)return clean(exact.dataset.koraReportValue);
    const copy=cell.cloneNode(true);
    copy.querySelectorAll('button.detail-link').forEach(node=>node.replaceWith(node.textContent));
    copy.querySelectorAll('button,input,details,select,[data-kora-no-export],.btn,.trace-id').forEach(node=>node.remove());
    copy.querySelectorAll('br').forEach(node=>node.replaceWith(' · '));
    copy.querySelectorAll('small').forEach(node=>{node.before(' · ');node.after(' ');});
    return clean(copy.textContent);
  }
  function cellNotes(cell) {
    if(cell.dataset.koraReportValue===undefined&&!cell.querySelector('[data-kora-report-value]'))return [];
    return [...cell.querySelectorAll('small')].filter(node=>!node.closest('[data-kora-no-export]')).map(node=>clean(node.textContent)).filter(Boolean);
  }
  const excelColumn = index => {let name='';for(let n=index+1;n;n=Math.floor((n-1)/26))name=String.fromCharCode(65+(n-1)%26)+name;return name;};
  const quoteSheet = name => `'${String(name).replaceAll("'","''")}'`;
  function colombianNumber(value) {
    if(typeof value==='number')return Number.isFinite(value)?value:null;
    const normalized=clean(value).replace(/\s/g,'').replace(/^(-?)\$/,'$1');
    if(!/^-?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?$/.test(normalized))return null;
    const parsed=Number(normalized.replaceAll('.','').replace(',','.'));
    return Number.isFinite(parsed)?parsed:null;
  }
  function typedCell(value,header='') {
    if(typeof value==='number'&&Number.isFinite(value)){
      if(textHeader.test(header))return {value:String(value),kind:'text',format:'@'};
      // Contrato de adaptadores: porcentajes numéricos son ratios Excel
      // (0.15 = 15%, 1.5 = 150%). No inferir escala por magnitud:
      // dividir 1.5 entre 100 dañaría crecimientos legítimos superiores al 100%.
      if(percentHeader.test(header))return {value,kind:'percent',format:'0.0%'};
      return {value,kind:amountHeader.test(header)?'currency':'number',format:amountHeader.test(header)?'"$"#,##0.00':'#,##0.##'};
    }
    if(value instanceof Date)return {value,kind:'date',format:'dd/mm/yyyy'};
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
    if(number!=null&&percentHeader.test(header))return {value:Math.abs(number)>1?number/100:number,kind:'percent',format:'0.0%'};
    if(number!=null&&(raw.includes('$')||amountHeader.test(header)))return {value:number,kind:'currency',format:'"$"#,##0.00'};
    if(number!=null&&/cantidad|unidades?|operaciones?|ventas?|compras?|cr[eé]ditos?|d[ií]as?/i.test(header))return {value:number,kind:'number',format:'#,##0'};
    return {value:raw,kind:'text',format:'@'};
  }
  const visible = element => {
    if(!element || element.closest('[hidden],.hidden,.modal:not(.show),dialog:not([open]),details:not([open]),[data-kora-no-export]'))return false;
    for(let node=element;node;node=node.parentElement)if(getComputedStyle(node).display==='none')return false;
    return true;
  };
  const nowBogota = () => new Intl.DateTimeFormat('es-CO', { timeZone:'America/Bogota', dateStyle:'medium', timeStyle:'short' }).format(new Date());
  const stamp = () => new Intl.DateTimeFormat('en-CA', { timeZone:'America/Bogota', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false }).formatToParts(new Date()).reduce((m,p)=>(m[p.type]=p.value,m),{});
  function reportId() { const p=stamp(),random=crypto.getRandomValues(new Uint16Array(1))[0].toString(16).padStart(4,'0').toUpperCase();return `KORA-REP-${p.year}${p.month}${p.day}-${p.hour}${p.minute}${p.second}-${random}`; }
  function pageTitle() { return clean(document.querySelector('.main-content h1,.page h1,main h1,.kora-topbar__title')?.textContent || document.title || 'Informe KORA'); }
  function labelFor(input) {
    const copy=input.closest('label')?.cloneNode(true);copy?.querySelectorAll('input,select,button').forEach(node=>node.remove());
    const aria=clean(input.getAttribute('aria-label'));
    const known=({filtroTienda:'Tienda',filtroFecha:'Fecha',filtroConcepto:'Concepto',filtroEstado:'Estado',q:'Buscar',state:'Estado'})[input.id];
    return clean(copy?.textContent || input.closest('.campo,.field,.filter-field')?.querySelector('label')?.textContent || document.querySelector(`label[for="${CSS.escape(input.id||'')}"]`)?.textContent || known || (!/^Campo\s*\d+$/i.test(aria)&&aria) || input.placeholder || input.name || input.id);
  }
  function selectedValue(input) { return input.tagName === 'SELECT' ? clean(input.selectedOptions[0]?.textContent) : clean(input.value); }
  function filterInputs() {
    const roots=document.querySelectorAll('.toolbar,.filters,.filter-bar,.dashboard-filterbar,.kora-report-filters,.kora-report-filter-row,.tc-filters,.cobros-filter,[aria-label*="Filtro" i],[aria-label*="Período" i]');
    return [...new Set([...roots].flatMap(root=>[...root.querySelectorAll('input,select')]))].filter(input=>visible(input)&&!['password','file','hidden','checkbox','radio'].includes(input.type));
  }
  function reportScope(profile) {
    const role=clean(profile?.rol).toLowerCase(),ownStore=['admin_tienda','asesor'].includes(role);
    const shellStore=clean(document.querySelector('[data-kora-retail-store] span')?.textContent);
    const code=clean(profile?.tienda_codigo);
    if(ownStore)return {label:shellStore||code||'Mi tienda',code,restricted:true};
    // El selector global de Retail puede conservar otra tienda al visitar Aliados o B2B.
    // Solo los filtros de este informe determinan su encabezado; no cambian permisos ni consultas.
    const selector=filterInputs().find(input=>/^(?:tienda(?: retail)?|establecimiento|origen)$/i.test(labelFor(input))&&input.value&&!/^(?:all|todos|todas)$/i.test(input.value));
    if(selector)return {label:selectedValue(selector),code:/^CK-\d+$/.test(selector.value)?selector.value:'',restricted:false};
    const route=location.pathname;
    const label=/aliados-/.test(route)?'Creditek Aliados · según filtros aplicados':/b2b-/.test(route)?'Creditek B2B · según filtros aplicados':'Según filtros y permisos del informe';
    return {label,code:'',restricted:false};
  }
  function filters() {
    const result = [];
    filterInputs().forEach(input => {
      const label=labelFor(input),value=selectedValue(input);
      if (label && value) result.push([label,value]);
    });
    return result;
  }
  function metrics() {
    const selectors = '.metric,.kpi-card,.dashboard-metric,.resumen-card,.summary-card,.stat-card,.period-stat,.ventas-kpi,.total-indicador';
    return [...document.querySelectorAll(selectors)].filter(visible).map(card => {
      const label=clean(card.querySelector('small,.kpi-label,.kpi-name,.label,[class*="label"],span')?.textContent);
      const valueNode=card.querySelector('strong,.kpi-value,.kpi-valor,.valor,.value,[class*="value"]');
      const value=clean(valueNode?.dataset.koraReportValue ?? valueNode?.textContent);
      return label && value ? [label,value] : null;
    }).filter(Boolean).filter((item,index,array)=>array.findIndex(x=>x[0]===item[0]&&x[1]===item[1])===index);
  }
  function tables() {
    return [...document.querySelectorAll('main table,.main-content table,.kora-shell-content table')].filter(visible).map((table,index) => {
      const container=table.closest('[data-kora-report-heading],section,.card,.table-card,.panel');
      const preceding=[...(container?.querySelectorAll('h2,h3,.panel-title')||[])].filter(node=>node.compareDocumentPosition(table)&Node.DOCUMENT_POSITION_FOLLOWING);
      const heading=clean(table.closest('[data-kora-report-heading]')?.dataset.koraReportHeading||preceding.at(-1)?.textContent)||`Detalle ${index+1}`;
      const rawHeaders=[...table.querySelectorAll('thead th')].map(th=>clean(th.textContent)),kept=rawHeaders.map((header,column)=>({header,column})).filter(({header,column})=>header&&visible(table.querySelectorAll('thead th')[column])&&!/^(acciones?|acción|seleccionar|consulta|consultar|detalle|foto)$/i.test(header));
      const headers=kept.map(item=>item.header);
      const readRow=tr=>{const cells=[];for(const cell of tr.children){if(!['TD','TH'].includes(cell.tagName))continue;cells.push(cellText(cell));for(let i=1;i<cell.colSpan;i++)cells.push('');}return kept.map(({column})=>cells[column]||'');};
      const placeholders=[...table.querySelectorAll('tbody tr')].filter(tr=>visible(tr)&&tr.children.length===1&&tr.firstElementChild.colSpan>1);
      if(placeholders.some(tr=>/cargando|consultando|error|no fue posible/i.test(tr.textContent)))throw new Error('Espera a que termine la consulta o actualiza los datos antes de exportar.');
      const rows=[...table.querySelectorAll('tbody tr')].filter(tr=>visible(tr)&&!tr.querySelector('.empty')&&!(tr.children.length===1&&tr.firstElementChild.colSpan>1)).map(readRow).filter(row=>row.some(Boolean));
      const totalRows=[...table.querySelectorAll('tfoot tr')].filter(visible).map(readRow).filter(row=>row.some(Boolean));
      const sourceId=table.querySelector('tbody')?.id||'',policy=tablePolicy(sourceId,rawHeaders),map=columns=>columns?.map(column=>kept.findIndex(item=>item.column===column)).filter(column=>column>=0);
      const kind=table.closest('[data-kora-report-kind]')?.dataset.koraReportKind||policy.kind||'detail';
      const declared=table.dataset.koraReportSums?.split(',').map(Number);
      const notes=[...table.querySelectorAll('tbody tr')].filter(visible).flatMap(tr=>[...tr.children].flatMap((cell,column)=>kept.some(item=>item.column===column)?cellNotes(cell).map(note=>`${cellText(tr.firstElementChild)} · ${rawHeaders[column]}: ${note}`):[]));
      const result={sourceId,heading,kind,headers,rows,totalRows,notes,policyNote:policy.note,explicitTotals:table.dataset.koraReportTotals==='explicit',sumColumns:map(declared||policy.sums),currencyColumns:map(policy.currency),balanceColumns:map(policy.balances),ratios:policy.ratios?.filter(([c,n,d])=>[c,n,d].every(column=>kept.some(item=>item.column===column))).map(([c,n,d,f])=>[...map([c,n,d]),f]),subtotal:policy.subtotal,summaryColumns:table.dataset.koraReportSummaryColumns?.split(',').map(Number)};
      // Una tabla sin datos ni cierre declarado puede estar en error: no inventar
      // cero registros ni importes cero. Las búsquedas vacías válidas traen su cierre.
      return rows.length||totalRows.length?completeTable(result):result;
    }).filter(table=>table.headers.length||table.rows.length);
  }
  function summaryTables(items) {
    // Solo agregados declarados o totales calculados por la pantalla. Nunca sumar saldos,
    // precios unitarios, porcentajes o resultados parciales para inventar un total.
    return items.flatMap(table=>table.kind==='summary'?[table]:table.totalRows?.length?[{...table,heading:`Totales · ${table.heading}`,kind:'summary',rows:table.totalRows,totalRows:[]}]:[]).map(table=>{
      const columns=table.summaryColumns||((table.sumColumns?.length||table.balanceColumns?.length||table.structured)&&table.kind==='summary'?table.headers.map((_,column)=>column).filter(column=>table.rows.some(row=>row[column]!==''&&row[column]!=null)):table.headers.map((_,column)=>column));
      const remap=indexes=>indexes?.map(column=>columns.indexOf(column)).filter(column=>column>=0);
      return {...table,notes:[],structured:false,headers:columns.map(column=>table.headers[column]),rows:table.rows.map(row=>columns.map(column=>row[column])),sumColumns:remap(table.sumColumns),currencyColumns:remap(table.currencyColumns),balanceColumns:remap(table.balanceColumns)};
    });
  }
  async function prepareReport(profile,{mode='detailed'}={}) {
    // Los adaptadores históricos se llaman prepareExcel, pero su contrato de datos
    // también alimenta PDF y el resumen. Proyectar totales solo después de cargarlos.
    let report=snapshot(profile,{mode:'detailed'});
    if(window.KoraReportData?.prepareExcel)report=await window.KoraReportData.prepareExcel(report);
    if(!report.tables.some(table=>table.rows?.length||table.totalRows?.length)&&!report.metrics.some(([,value])=>!/^\s*(?:—|-|No disponible|Sin dato)\s*$/i.test(String(value))))throw new Error('No hay datos consultados para generar este informe.');
    report.tables=report.tables.map(completeTable);
    if(mode==='summary')report.tables=summaryTables(report.tables);
    report.mode=mode==='summary'?'summary':'detailed';
    report.filters=report.filters.map(([label,value])=>[label,label==='Formato del informe'?(report.mode==='summary'?'Resumido · solo totales':'Detallado · datos y movimientos'):value]);
    if(!report.tables.some(table=>table.rows?.length||table.totalRows?.length)&&!report.metrics.some(([,value])=>!/^\s*(?:—|-|No disponible|Sin dato)\s*$/i.test(String(value))))throw new Error('No hay datos consultados para generar este informe.');
    return report;
  }
  function snapshot(profile,{mode='detailed'}={}) {
    const scope=reportScope(profile),appliedFilters=filters();
    mode=mode==='summary'?'summary':'detailed';
    appliedFilters.unshift(['Alcance del informe',scope.code?`${scope.label} · ${scope.code}`:scope.label]);
    appliedFilters.push(['Formato del informe',mode==='summary'?'Resumido · solo totales':'Detallado · datos y movimientos']);
    const sources=[...document.querySelectorAll('[data-kora-report-source]')].filter(visible).map(node=>node.koraReportData?.()).filter(Boolean);
    const allTables=[...tables(),...sources.flatMap(source=>(source.tables||[]).map(completeTable))],selectedTables=mode==='summary'?summaryTables(allTables):allTables,indicators=[...metrics(),...sources.flatMap(source=>source.metrics||[])];
    appliedFilters.push(...sources.flatMap(source=>source.filters||[]).map(([key,value])=>[clean(key),clean(value)]));
    if(!indicators.length&&!selectedTables.length&&!window.KoraReportData?.prepareExcel)throw new Error('Consulta los datos de esta pantalla antes de generar el informe. No se exportó un documento vacío.');
    const notes=[...new Set([...document.querySelectorAll('main [data-kora-report-note],.main-content [data-kora-report-note],main [role="alert"],.main-content [role="alert"]')].filter(visible).map(node=>clean(node.textContent)).filter(Boolean))];
    return { id:reportId(), title:pageTitle(), mode, route:location.pathname+location.search+location.hash, generated:nowBogota(), user:profile?.nombre||profile?.email||'Usuario KORA', role:profile?.rol||'', scope, filters:appliedFilters, metrics:indicators.map(([key,value])=>[clean(key),clean(value)]), tables:selectedTables, notes };
  }
  async function includeStoreNames(report,sb) {
    const {data,error}=await sb.from('origenes').select('codigo,nombre');
    if(error)throw new Error('No se pudieron verificar los nombres de las tiendas para el informe: '+error.message);
    const names=new Map((data||[]).map(store=>[store.codigo,clean(store.nombre)]));
    const label=value=>typeof value!=='string'?value:value.replace(/\bCK-\d+\b/g,code=>{
      const name=names.get(code);
      if(!name)throw new Error(`La tienda ${code} no tiene nombre registrado. Corrige el catálogo antes de exportar.`);
      return value.includes(name)?code:`${name} · ${code}`;
    });
    report.scope.label=label(report.scope.label);
    report.filters=report.filters.map(([key,value])=>[key,label(value)]);
    report.metrics=report.metrics.map(([key,value])=>[key,label(value)]);
    report.tables.forEach(table=>{table.rows=table.rows.map(row=>row.map(label));table.totalRows=table.totalRows?.map(row=>row.map(label));});
    report.notes=report.notes?.map(label);
    return report;
  }
  async function audit(sb, report, format) {
    if (!sb?.rpc) return;
    const records=report.recordCount??report.tables.reduce((n,t)=>n+t.rows.length,0);
    const { error } = await sb.rpc('kora_registrar_exportacion', { p_reporte_id:report.id, p_formato:format, p_ruta:report.route, p_titulo:report.title, p_filtros:Object.fromEntries(report.filters), p_registros:records });
    if (error) console.warn('[KORA Reportes] No se registró la exportación', error.message);
  }
  function loadScript(id,src,globalName){if(window[globalName])return Promise.resolve(window[globalName]);return new Promise((resolve,reject)=>{const prior=document.getElementById(id);if(prior){prior.addEventListener('load',()=>resolve(window[globalName]),{once:true});prior.addEventListener('error',reject,{once:true});return}const script=document.createElement('script');script.id=id;script.src=src;script.onload=()=>resolve(window[globalName]);script.onerror=()=>reject(new Error('No fue posible cargar el generador de Excel.'));document.head.appendChild(script)})}
  async function logoBase64(){const response=await fetch(LOGO);if(!response.ok)throw new Error('No fue posible cargar el logo Creditek.');const blob=await response.blob();return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)})}
  function filename(report,extension){return `${report.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'informe-kora'}-${report.mode==='summary'?'resumido':'detallado'}-${report.id}.${extension}`}
  function structuredSheet(workbook, table, index, report, imageId) {
    const lastColumn = excelColumn(table.headers.length - 1);
    const sheet = workbook.addWorksheet(`${String(index+1).padStart(2,'0')} ${table.heading}`.slice(0,31), {
      views: [{state:'frozen', ySplit:5, xSplit:3, showGridLines:false}]
    });
    sheet.columns = table.columns.map(([,width,format], i) => ({width, style:{numFmt:format || (i>=6 && i<=22 ? table.moneyFormat : 'General')}}));
    if(imageId!==null)sheet.addImage(imageId,{tl:{col:.15,row:.2},ext:{width:150,height:44}});
    sheet.getCell('D2').value = `${table.heading} · ${report.id}`;
    sheet.getCell('D2').font = {name:'Arial',size:14,bold:true,color:{argb:COLORS.navy}};
    sheet.getCell('D2').alignment = {vertical:'middle'};
    sheet.mergeCells(`D2:${lastColumn}2`);
    sheet.getCell('D3').value = table.note;
    sheet.mergeCells(`D3:${lastColumn}3`);
    sheet.getCell('D3').alignment = {wrapText:true,vertical:'middle'};
    sheet.getRow(2).height = 24;
    sheet.getRow(3).height = 34;
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
      const column=col.split('').reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1;
      const result=typedCell(table.totalRows?.[0]?.[column],table.headers[column]).value;
      sheet.getCell(`${col}${total}`).value=table.rows.length?{formula:`IF(COUNTIFS(F6:F${last},"Sí")<>COUNTIFS(F6:F${last},"Sí",${col}6:${col}${last},">=0")+COUNTIFS(F6:F${last},"Sí",${col}6:${col}${last},"<0"),"Faltan datos",SUMIFS(${col}6:${col}${last},F6:F${last},"Sí"))`,result}:result;
    });
    sheet.getRow(total).height=30;
    sheet.getRow(total).eachCell(cell=>{cell.font={name:'Arial',size:10,bold:true};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:COLORS.pale}};});
    sheet.autoFilter={from:'A5',to:`${lastColumn}${last}`};
    sheet.addConditionalFormatting({ref:`V6:W${last}`,rules:[{type:'expression',formulae:['AND(ISNUMBER(V6),ABS(V6)>0.01)'],style:{font:{bold:true,color:{argb:'B42318'}},fill:{type:'pattern',pattern:'solid',bgColor:{argb:'FFF1F2'}}}}]});
    sheet.addConditionalFormatting({ref:`X6:X${last}`,rules:[{type:'expression',formulae:['X6<>"Coincide"'],style:{font:{bold:true,color:{argb:'B42318'}}}}]});
    sheet.pageSetup={orientation:'portrait',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:5',printTitlesColumn:'A:C'};
    sheet.headerFooter.oddFooter=`Creditek S.A.S. · ${report.id} · Página &P de &N`;
  }
  async function exportExcel(report,sb){
    report=await includeStoreNames(report,sb);
    const ExcelJS=await loadScript('koraExcelJs',EXCELJS,'ExcelJS'),workbook=new ExcelJS.Workbook();workbook.creator='KORA · Creditek S.A.S.';workbook.created=new Date();workbook.subject=`${report.title} · ${report.id}`;workbook.calcProperties.fullCalcOnLoad=true;
    let imageId=null;try{imageId=workbook.addImage({base64:await logoBase64(),extension:'png'})}catch(error){console.warn('[KORA Reportes] Excel continuará sin imagen',error.message)}
    const summary=workbook.addWorksheet('Resumen',{views:[{showGridLines:false}]});summary.properties.defaultRowHeight=20;summary.columns=[{width:28},{width:42},{width:24},{width:24}];summary.mergeCells('A1:D3');if(imageId!==null)summary.addImage(imageId,{tl:{col:.15,row:.15},ext:{width:180,height:52}});summary.mergeCells('A5:D5');summary.getCell('A5').value=report.title;summary.getCell('A5').font={name:'Montserrat',size:20,bold:true,color:{argb:COLORS.navy}};summary.getCell('A6').value='Código de trazabilidad';summary.getCell('B6').value=report.id;summary.getCell('A7').value='Generado';summary.getCell('B7').value=report.generated;summary.getCell('A8').value='Responsable';summary.getCell('B8').value=`${report.user}${report.role?` · ${report.role}`:''}`;summary.getCell('A9').value='Alcance';summary.getCell('B9').value=report.scope?.code?`${report.scope.label} · ${report.scope.code}`:report.scope?.label||'Según permisos del usuario';summary.getCell('A10').value='Ruta de origen';summary.getCell('B10').value=report.route;
    let row=12;if(report.filters.length){summary.getCell(`A${row}`).value='Parámetros aplicados';summary.getCell(`A${row}`).font={bold:true,color:{argb:COLORS.white}};summary.getCell(`A${row}`).fill={type:'pattern',pattern:'solid',fgColor:{argb:COLORS.navy}};summary.mergeCells(`A${row}:D${row}`);row++;report.filters.forEach(([label,value])=>{summary.getCell(`A${row}`).value=label;summary.getCell(`B${row}`).value=value;row++});row++}if(report.metrics.length){summary.getCell(`A${row}`).value='Indicadores visibles';summary.getCell(`A${row}`).font={bold:true,color:{argb:COLORS.white}};summary.getCell(`A${row}`).fill={type:'pattern',pattern:'solid',fgColor:{argb:COLORS.navy}};summary.mergeCells(`A${row}:D${row}`);row++;report.metrics.forEach(([label,value])=>{summary.getCell(`A${row}`).value=label;summary.getCell(`B${row}`).value=value;row++})}
    summary.pageSetup={orientation:'portrait',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0};
    summary.headerFooter.oddFooter=`KORA · Creditek S.A.S. · ${report.id} · Página &P de &N`;
    if(report.notes?.length){row+=2;for(const note of report.notes){summary.mergeCells(`A${row}:D${row}`);summary.getCell(row,1).value=note;summary.getCell(row,1).alignment={wrapText:true,vertical:'middle'};summary.getRow(row).height=Math.max(30,Math.ceil(note.length/100)*15);row++;}}
    const controls=[];
    report.tables.forEach((table,index)=>{
      if(table.structured){structuredSheet(workbook,table,index,report,imageId);controls.push({sheet:workbook.worksheets.at(-1),heading:table.heading,last:table.rows.length+5,structured:true});return;}
      const sheet=workbook.addWorksheet(`${String(index+1).padStart(2,'0')} ${table.heading}`.slice(0,31),{views:[{state:'frozen',ySplit:5,xSplit:Math.min(2,table.headers.length),showGridLines:false}]});
      const columns=Math.max(table.headers.length,2);sheet.mergeCells(1,1,2,columns);if(imageId!==null)sheet.addImage(imageId,{tl:{col:.1,row:.1},ext:{width:150,height:44}});sheet.mergeCells(4,1,4,columns);sheet.getCell(4,1).value=`${table.heading} · ${report.id}`;sheet.getCell(4,1).font={bold:true,size:14,color:{argb:COLORS.navy}};
      const header=sheet.addRow(table.headers);header.height=34;header.eachCell(cell=>{cell.font={bold:true,color:{argb:COLORS.white}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:COLORS.navy}};cell.alignment={horizontal:'center',vertical:'middle',wrapText:true}});
      const kinds=table.headers.map(()=>new Set()),numericTotals=table.headers.map(()=>0);
      table.rows.forEach(values=>{const converted=table.headers.map((title,column)=>{const parsed=typedCell(values[column],title);kinds[column].add(parsed.kind);if((parsed.kind==='currency'||parsed.kind==='number')&&typeof parsed.value==='number')numericTotals[column]+=parsed.value;return parsed;});const row=sheet.addRow(converted.map(cell=>cell.value));converted.forEach((parsed,column)=>{row.getCell(column+1).numFmt=parsed.format;});});
      const last=Math.max(5,table.rows.length+5),totalRow=last+1;
      const declaredTotals=table.explicitTotals?table.totalRows||[]:[];
      const controlRow=totalRow+Math.max(1,declaredTotals.length);
      if(table.explicitTotals){
        declaredTotals.forEach((values,index)=>table.headers.forEach((title,column)=>{
          const parsed=typedCell(values[column],title),cell=sheet.getCell(totalRow+index,column+1);
          cell.value=parsed.value;cell.numFmt=parsed.format;
        }));
      }else sheet.getCell(totalRow,1).value=table.kind==='summary'?'Valores ya agregados':'Totales / promedios';
      sheet.getCell(controlRow,1).value='Registros';sheet.getCell(controlRow,2).value=table.rows.length?{formula:`SUBTOTAL(103,A6:A${last})`,result:table.rows.length}:0;
      // Mismo cierre que en PDF: no inferir sumas ni promedios por encabezado.
      [...Array.from({length:Math.max(1,declaredTotals.length)},(_,index)=>totalRow+index),controlRow].forEach(rowNumber=>{const row=sheet.getRow(rowNumber);row.height=24;row.eachCell(cell=>{cell.font={bold:true,color:{argb:COLORS.navy}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:COLORS.pale}};});});
      if(table.rows.length)sheet.addTable({name:`KoraTabla${index+1}`,ref:'A5',headerRow:true,totalsRow:false,style:{theme:'TableStyleMedium2',showRowStripes:true},columns:table.headers.map(name=>({name})),rows:table.rows.map((values,rowIndex)=>table.headers.map((title,column)=>typedCell(values[column],title).value))});
      sheet.columns.forEach((column,columnIndex)=>{let width=Math.max(12,Math.min(28,clean(table.headers[columnIndex]).length+2));column.eachCell({includeEmpty:false},cell=>{const value=cell.value instanceof Date?'00/00/0000':clean(cell.value);width=Math.max(width,Math.min(columnIndex<2?38:24,value.length+2));});column.width=width;});
      sheet.eachRow((row,rowNumber)=>{if(rowNumber>5&&rowNumber<totalRow&&rowNumber%2===0)row.eachCell(cell=>cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'F5FAFC'}});row.eachCell(cell=>cell.alignment={vertical:'middle',wrapText:true,horizontal:typeof cell.value==='number'?'right':'left'});});
      if(table.rows.length)sheet.addConditionalFormatting({ref:`A6:${excelColumn(table.headers.length-1)}${last}`,rules:[{type:'containsText',operator:'containsText',text:'REVISAR',style:{font:{bold:true,color:{argb:'B42318'}},fill:{type:'pattern',pattern:'solid',fgColor:{argb:'FFF1F2'}}}},{type:'containsText',operator:'containsText',text:'Faltan datos',style:{font:{bold:true,color:{argb:'B42318'}},fill:{type:'pattern',pattern:'solid',fgColor:{argb:'FFF1F2'}}}}]});
      [table.policyNote,...(table.notes||[])].filter(Boolean).forEach((note,index)=>{
        const noteRow=controlRow+2+index;sheet.mergeCells(noteRow,1,noteRow,columns);
        sheet.getCell(noteRow,1).value=note;sheet.getCell(noteRow,1).alignment={wrapText:true,vertical:'middle'};
        sheet.getRow(noteRow).height=Math.max(30,Math.ceil(note.length/90)*15);
      });
      sheet.headerFooter.oddFooter=`Creditek S.A.S. · ${report.id} · Página &P de &N`;sheet.pageSetup={orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0,paperSize:9};controls.push({sheet,heading:table.heading,last,structured:false});
    });
    if(controls.length){
      row+=2;
      summary.getCell(`A${row}`).value='Control del archivo';summary.getCell(`A${row}`).font={bold:true,color:{argb:COLORS.white}};summary.getCell(`A${row}`).fill={type:'pattern',pattern:'solid',fgColor:{argb:COLORS.navy}};summary.mergeCells(`A${row}:D${row}`);row++;
      summary.getRow(row).values=['Hoja','Contenido','Registros','Control'];summary.getRow(row).eachCell(cell=>{cell.font={bold:true,color:{argb:COLORS.white}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:COLORS.navy}};});row++;
      for(const control of controls){summary.getCell(row,1).value=control.sheet.name;summary.getCell(row,2).value=control.heading;summary.getCell(row,3).value={formula:`COUNTA(${quoteSheet(control.sheet.name)}!A6:A${control.last})`,result:Math.max(0,control.last-5)};summary.getCell(row,4).value='Datos y fórmulas incluidos';row++;}
      summary.getCell(row,2).value='Total de registros';summary.getCell(row,3).value={formula:`SUM(C${row-controls.length}:C${row-1})`,result:controls.reduce((total,control)=>total+Math.max(0,control.last-5),0)};summary.getRow(row).eachCell(cell=>{cell.font={bold:true};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:COLORS.pale}};});
    }
    const buffer=await workbook.xlsx.writeBuffer(),url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})),link=document.createElement('a');link.href=url;link.download=filename(report,'xlsx');link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);await audit(sb,report,'xlsx');
  }
  function pdfTable(table){
    if(table.structured){
      const display=(value,column)=>{
        if(value&&typeof value==='object'&&'formula' in value)value=value.result;
        if(value instanceof Date)return new Intl.DateTimeFormat('es-CO',{timeZone:'UTC'}).format(value);
        if(typeof value==='number')return /%/.test(table.columns[column]?.[2]||'')?numberText(value*100)+' %':column>=6&&column<=22?money(value):numberText(value);
        return value??'Sin dato registrado';
      };
      table={...table,rows:table.rows.map(row=>row.map(display))};
    }
    const totals=table.totalRows||[];
    const notes=[table.policyNote,...(table.notes||[])].filter(Boolean);
    const notesHtml=notes.length?`<aside class="table-notes">${notes.map(note=>`<p>${esc(note)}</p>`).join('')}</aside>`:'';
    if(table.headers.length>5){
      const columns=Array.from({length:Math.min(4,table.headers.length)},()=>[]);
      table.headers.forEach((_,index)=>columns[index%columns.length].push(index));
      const rowHtml=row=>`<tr>${columns.map(indices=>`<td>${indices.map(column=>`<div class="compact-field"><small>${esc(table.headers[column])}</small><b>${esc(row[column]??'—')}</b></div>`).join('')}</td>`).join('')}</tr>`;
      return `<section><h2>${esc(table.heading)}</h2><table class="compact-detail"><thead><tr>${columns.map(indices=>`<th>${esc(table.headers[indices[0]])} / detalle</th>`).join('')}</tr></thead><tbody>${table.rows.map(rowHtml).join('')}</tbody>${totals.length?`<tfoot>${totals.map(rowHtml).join('')}</tfoot>`:''}</table>${notesHtml}</section>`;
    }
    const rowHtml=row=>`<tr>${table.headers.map((_,column)=>`<td>${esc(row[column])}</td>`).join('')}</tr>`;
    return `<section><h2>${esc(table.heading)}</h2><table><thead><tr>${table.headers.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${table.rows.map(rowHtml).join('')}</tbody>${totals.length?`<tfoot>${totals.map(rowHtml).join('')}</tfoot>`:''}</table>${notesHtml}</section>`;
  }
  function pdfDocument(report,logoUrl){
    logoUrl=logoUrl||(typeof location==='object'?new URL(LOGO,location.origin).href:LOGO);
    const filterText=report.filters.map(([key,value])=>`<span><b>${esc(key)}:</b> ${esc(value)}</span>`).join('');
    const metricText=report.metrics.map(([key,value])=>`<div><small>${esc(key)}</small><strong>${esc(value)}</strong></div>`).join('');
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(report.title)} · ${esc(report.id)}</title><style>
@page{size:A4 portrait;margin:12mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:Arial,sans-serif;color:#0B1E3D;margin:0;font-size:11px;line-height:1.4}h1,h2,h3{break-after:avoid}h1{font-size:23px;margin:5px 0}h2{font-size:14px;margin:0 0 7px}h3{font-size:11px;margin:0 0 6px}
.head{border-bottom:3px solid #00C4CC;padding-bottom:9px;break-inside:avoid}.brand{display:flex;align-items:center;justify-content:space-between}.brand img{width:150px;height:45px;object-fit:contain}.brand span{font-size:17px;font-weight:800;color:#008A96}.meta{color:#526075;font-size:9px;overflow-wrap:anywhere}
.filters{display:flex;flex-wrap:wrap;gap:5px;margin:10px 0}.filters span{background:#EAFBFC;border:1px solid #B7E8EB;border-radius:6px;padding:4px 6px;font-size:9px}
.metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:10px 0}.metrics>div{border:1px solid #D9E3EA;border-top:3px solid #00C4CC;border-radius:7px;padding:7px;break-inside:avoid}.metrics small{display:block;color:#64748B}.metrics strong{display:block;font-size:19px;overflow-wrap:anywhere;margin-top:2px}
section{margin:13px 0}table{width:100%;border-collapse:collapse;font-size:10px;table-layout:fixed}thead{display:table-header-group}tfoot{display:table-row-group;background:#EAFBFC;font-weight:bold}th{background:#0B1E3D;color:#fff;text-align:left;padding:7px}td{padding:6px;border-bottom:1px solid #DCE5EB;vertical-align:top;overflow-wrap:anywhere}tbody tr:nth-child(even){background:#F5FAFC}tr{break-inside:avoid}.compact-field{margin-bottom:4px}.compact-field:last-child{margin:0}.compact-field small{display:block;color:#64748B;font-size:8px}.compact-field b{display:block;font-size:10px;font-weight:500}
.record{border:1px solid #D9E3EA;border-top:2px solid #00C4CC;border-radius:7px;padding:10px;margin:9px 0;break-inside:avoid}.record.splittable{break-inside:auto}.record dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 16px;margin:0}.record dl>div{break-inside:avoid}.record dt{font-size:9px;color:#64748B}.record dd{margin:2px 0 0;font-weight:600;overflow-wrap:anywhere}
${report.scoped?'tfoot{display:table-row-group}':''}
.notes{border-left:3px solid #00C4CC;background:#F5FAFC;padding:7px 10px;font-size:10px;break-inside:avoid}.notes p{margin:3px 0}.table-notes{font-size:9px;color:#526075}.table-notes p{margin:4px 0;break-inside:avoid}.closing{break-inside:avoid;margin-top:13px;font-size:9px;color:#526075;border-top:1px solid #CAD7DF;padding-top:7px}.closing p{margin:3px 0}.tools{position:fixed;right:14px;bottom:14px}.tools button{background:#00C4CC;color:#0B1E3D;border:0;border-radius:10px;padding:12px 18px;font-weight:800}@media screen{body{max-width:186mm;margin:20px auto;padding:12px}}@media print{.tools{display:none}}
</style></head><body><header class="head"><div class="brand"><img src="${esc(logoUrl)}" alt="Creditek"><span>KORA</span></div><h1>${esc(report.title)}</h1><div class="meta"><b>${esc(report.id)}</b> · ${report.mode==='summary'?'Resumido · solo totales':'Detallado · datos y movimientos'}<br>Generado: ${esc(report.generated)} · Responsable: ${esc(report.user)}${report.role?` · ${esc(report.role)}`:''}<br>Origen: ${esc(report.route)}</div></header><div class="filters">${filterText}</div>${metricText?`<div class="metrics">${metricText}</div>`:''}${report.tables.map(pdfTable).join('')}${report.notes?.length?`<aside class="notes">${report.notes.map(note=>`<p>${esc(note)}</p>`).join('')}</aside>`:''}<footer class="closing"><p><b>Trazabilidad KORA</b> · ${esc(report.id)}. Información visible con los filtros y permisos al generar el informe; no acredita un pago ni un saldo bancario.</p><p><b>Creditek S.A.S. · NIT 901.259.859-0</b> · Valores en COP cuando aplique.</p></footer><div class="tools"><button onclick="window.print()">Imprimir / Guardar PDF</button></div></body></html>`;
  }
  async function exportPdf(report,sb,popup){
    if(!popup)throw new Error('Permite ventanas emergentes para generar el PDF.');
    popup.opener=null;const logo=await logoBase64();popup.document.write(pdfDocument(report,logo));popup.document.close();await audit(sb,report,'pdf');
  }
  // Informes de ventanas: datos explícitos, sin capturar la pantalla que queda detrás.
  const dataFormats={currency:'"$" #,##0.00;[Red]-"$" #,##0.00',number:'#,##0',datetime:'dd/mm/yyyy hh:mm',date:'dd/mm/yyyy',text:'@'};
  function dataDisplay(value,type){
    if(value==null||value==='')return '—';
    if(type==='datetime')return new Intl.DateTimeFormat('es-CO',{timeZone:'UTC',dateStyle:'short',timeStyle:'short'}).format(value);
    if(type==='date')return value instanceof Date?new Intl.DateTimeFormat('es-CO',{timeZone:'UTC',dateStyle:'short'}).format(value):String(value);
    if(type==='currency')return new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:2,maximumFractionDigits:2}).format(value);
    if(type==='number')return new Intl.NumberFormat('es-CO',{maximumFractionDigits:2}).format(value);
    return String(value);
  }
  async function exportDataExcel(report,sb){
    const ExcelJS=await loadScript('koraExcelJs',EXCELJS,'ExcelJS');
    // La marca es parte del contrato: no entregar silenciosamente un archivo sin logo.
    const logo=await logoBase64(),book=new ExcelJS.Workbook();
    book.creator='KORA · Creditek S.A.S.';book.created=new Date();book.subject=`${report.title} · ${report.id}`;
    const imageId=book.addImage({base64:logo,extension:'png'});
    const brand=(sheet,lastColumn)=>{
      sheet.properties.defaultRowHeight=24;
      sheet.mergeCells(1,1,3,lastColumn);
      sheet.addImage(imageId,{tl:{col:.12,row:.15},ext:{width:170,height:50}});
      sheet.getRow(1).height=22;sheet.getRow(2).height=22;sheet.getRow(3).height=18;
      sheet.mergeCells(4,1,4,lastColumn);sheet.getCell(4,1).value=`KORA · ${report.title}`;
      sheet.getCell(4,1).font={name:'Arial',bold:true,size:18,color:{argb:COLORS.navy}};sheet.getRow(4).height=30;
      sheet.mergeCells(5,1,5,lastColumn);sheet.getCell(5,1).value=`${report.id} · ${report.generated}`;
      sheet.getCell(5,1).font={name:'Arial',size:10,color:{argb:COLORS.gray}};
      sheet.headerFooter.oddFooter=`KORA · Creditek S.A.S. · ${report.id} · Página &P de &N`;
      sheet.pageSetup={orientation:'portrait',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:8'};
    };
    const styleHeader=row=>{row.height=36;row.eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:COLORS.navy}};cell.font={name:'Arial',bold:true,color:{argb:COLORS.white}};cell.alignment={vertical:'middle',wrapText:true};});};
    const cover=book.addWorksheet('Informe',{views:[{showGridLines:false}]});cover.columns=[{width:30},{width:45},{width:24},{width:24}];brand(cover,4);
    const info=[['Responsable',`${report.user}${report.role?` · ${report.role}`:''}`],['Alcance',report.scope.label],['Origen',report.route],...report.filters];
    info.forEach(([label,value],index)=>{const row=8+index;cover.getCell(row,1).value=label;cover.getCell(row,1).font={bold:true,color:{argb:COLORS.navy}};cover.mergeCells(row,2,row,4);cover.getCell(row,2).value=value;cover.getCell(row,2).alignment={wrapText:true,vertical:'middle'};cover.getRow(row).height=32;});
    const lastInfo=8+info.length;cover.mergeCells(lastInfo+1,1,lastInfo+1,4);cover.getCell(lastInfo+1,1).value='Creditek S.A.S. · NIT 901.259.859-0 · Valores en COP';
    report.tables.forEach((table,index)=>{
      const sheet=book.addWorksheet(`${String(index+1).padStart(2,'0')} ${table.heading}`.slice(0,31),{views:[{state:'frozen',ySplit:8,xSplit:1,showGridLines:false}]});
      brand(sheet,Math.max(2,table.headers.length));sheet.mergeCells(7,1,7,Math.max(2,table.headers.length));sheet.getCell(7,1).value=table.heading;sheet.getCell(7,1).font={bold:true,size:13,color:{argb:COLORS.navy}};
      sheet.getRow(8).values=table.headers;styleHeader(sheet.getRow(8));
      const records=[...table.rows,...(table.totalRows||[])];
      records.forEach((values,position)=>{
        const row=sheet.getRow(position+9);row.values=values.map(value=>value===''||value==null?null:value);row.height=32;
        table.headers.forEach((_,column)=>{const cell=row.getCell(column+1);cell.numFmt=cell.value==null?'General':dataFormats[table.columnTypes?.[column]]||'@';cell.font={name:'Arial',size:11,color:{argb:COLORS.navy},bold:position>=table.rows.length};cell.alignment={vertical:'middle',wrapText:true,horizontal:['currency','number'].includes(table.columnTypes?.[column])?'right':'left'};if(position>=table.rows.length||position%2===0)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:position>=table.rows.length?COLORS.pale:'F5FAFC'}};});
      });
      table.headers.forEach((header,column)=>{sheet.getColumn(column+1).width=table.columnTypes?.[column]==='datetime'?24:/ID corte/.test(header)?40:column===0?26:/Estado/.test(header)?32:22;});
      sheet.autoFilter={from:{row:8,column:1},to:{row:Math.max(8,table.rows.length+8),column:table.headers.length}};
    });
    const buffer=await book.xlsx.writeBuffer(),url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    const link=document.createElement('a');link.href=url;link.download=filename(report,'xlsx');link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    await audit(sb,report,'xlsx');
  }
  async function exportData(data,{format='xlsx',sb,profile,popup=null}={}){
    if(!['xlsx','pdf'].includes(format))throw new Error('Selecciona Excel o PDF.');
    if(format==='pdf'&&!popup)throw new Error('Permite ventanas emergentes para generar el PDF.');
    if(!profile?.nombre&&!profile?.email)throw new Error('No se pudo verificar el responsable del informe. Actualiza la sesión.');
    if(!data.tables?.some(table=>table.rows?.length))throw new Error('No hay datos para generar el informe.');
    const report={...data,scoped:true,id:reportId(),generated:nowBogota(),user:profile.nombre||profile.email,role:profile.rol||'',
      recordCount:data.tables.reduce((count,table)=>count+table.rows.length,0),
      route:data.route||location.pathname+'#conteos',filters:[...data.filters,['Formato del informe',data.mode==='summary'?'Resumido':'Completo']],metrics:[],notes:data.notes||[]};
    if(format==='xlsx')await exportDataExcel(report,sb);
    else {
      const tables=(data.pdfTables||data.tables).map(table=>({...table,
        rows:table.rows.map(row=>row.map((value,col)=>dataDisplay(value,table.columnTypes?.[col]))),
        totalRows:table.totalRows?.map(row=>row.map((value,col)=>dataDisplay(value,table.columnTypes?.[col])))}));
      await exportPdf({...report,tables},sb,popup);
    }
    return report.id;
  }
  function toast(message,error=false){let node=document.getElementById('koraReportToast');if(!node){node=document.createElement('div');node.id='koraReportToast';node.style.cssText='position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:360px;padding:12px 16px;border-radius:10px;color:#fff;font:600 13px Montserrat,Arial,sans-serif;box-shadow:0 8px 24px rgba(11,30,61,.25)';document.body.appendChild(node)}node.textContent=message;node.style.background=error?'#B42318':'#0B1E3D';node.hidden=false;setTimeout(()=>node.hidden=true,4500)}
  function mount({profile,sb}={}){
    if(mounted)return;
    const actions=document.querySelector('.kora-topbar__actions');if(!actions)return;
    mounted=true;
    const wrap=document.createElement('div');
    wrap.style.cssText='position:relative';
    wrap.innerHTML='<button class="kora-icon-button ghost" type="button" data-kora-report-toggle aria-label="Generar informe" title="Generar informe"><i data-lucide="file-down"></i></button><div data-kora-report-menu hidden style="position:absolute;right:0;top:calc(100% + 8px);z-index:2000;width:270px;max-width:90vw;background:#fff;border:1px solid #DCE5EB;border-radius:12px;padding:10px;box-shadow:0 14px 34px rgba(11,30,61,.18)"><label style="display:flex;align-items:center;gap:8px;font:700 12px Arial;color:#0B1E3D;padding:9px 0;cursor:pointer"><input type="checkbox" data-kora-report-summary aria-label="Resumido" aria-describedby="koraReportModeHelp" style="width:18px;min-width:18px;height:18px;margin:0"><span>Resumido · solo totales</span></label><small id="koraReportModeHelp" style="display:block;color:#64748B;font:11px Arial;margin:8px 0">Sin marcar: informe completo. Formato vertical; conserva los filtros de esta pantalla.</small><button type="button" data-format="xlsx" style="display:block;width:100%;padding:10px;border:0;border-radius:8px;background:#fff;text-align:left;font:700 12px Arial;color:#0B1E3D;cursor:pointer">Descargar Excel</button><button type="button" data-format="pdf" style="display:block;width:100%;padding:10px;border:0;border-radius:8px;background:#fff;text-align:left;font:700 12px Arial;color:#0B1E3D;cursor:pointer">Generar PDF</button></div>';
    actions.insertBefore(wrap,actions.querySelector('[data-kora-help]'));
    const menu=wrap.querySelector('[data-kora-report-menu]');
    wrap.querySelector('[data-kora-report-toggle]').onclick=()=>menu.hidden=!menu.hidden;
    wrap.querySelectorAll('[data-format]').forEach(button=>button.onclick=async()=>{
      menu.hidden=true;button.disabled=true;
      // Abrir en el gesto del usuario, antes de consultar nombres: evita el bloqueo del navegador.
      const popup=button.dataset.format==='pdf'?window.open('','_blank'):null;
      if(popup)popup.opener=null;
      try{
        const report=await prepareReport(profile,{mode:wrap.querySelector('[data-kora-report-summary]').checked?'summary':'detailed'});
        if(button.dataset.format==='xlsx')await exportExcel(report,sb);
        else await exportPdf(await includeStoreNames(report,sb),sb,popup);
        toast(`Informe ${button.dataset.format.toUpperCase()} generado · ${report.id}`);
      }catch(error){popup?.close();toast(error.message||'No fue posible generar el informe.',true)}
      finally{button.disabled=false}
    });
    document.addEventListener('click',event=>{if(!wrap.contains(event.target))menu.hidden=true});
    window.lucide?.createIcons();
  }
  window.KoraReportExport={mount,snapshot,prepareReport,typedCell,excelColumn,reportScope,summaryTables,pdfDocument,completeTable,totalValue,cellText,tablePolicy,exportData};
  document.dispatchEvent(new CustomEvent('kora-report-export-ready'));
})();
