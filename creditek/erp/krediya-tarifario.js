(function(root) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function numeric(value) {
    if(value==null || typeof value==='boolean' || String(value).trim()==='') return null;
    const parsed=Number(value);return Number.isFinite(parsed)?parsed:null;
  }
  function giro(context) {
    const pagamos=numeric(context.pagamos),inicial=numeric(context.inicial);
    return pagamos==null||inicial==null?null:Math.round((pagamos-inicial)*100)/100;
  }
  function impacto(rows) {
    const values=rows.map(r=>numeric(r.contexto?.impacto_neto)),known=values.filter(v=>v!=null);
    return {total:known.length?Math.round(known.reduce((sum,value)=>sum+value,0)*100)/100:rows.length?null:0,pendientes:values.length-known.length};
  }
  function tarifasVigentes(rows, now = new Date()) {
    const today = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Bogota'}).format(now);
    return rows.filter(r => r.activo !== false && r.vigente_desde && r.vigente_desde <= today && (!r.vigente_hasta || r.vigente_hasta >= today));
  }
  const tariffHeaders = [
    'Código', 'Referencia', 'PVP configurado', 'PAGAMOS antes de inicial', 'Vigente desde',
    'Costo proveedor', 'Ganancia bruta estimada', 'Ganancia / costo', 'Referencia proveedor',
    'Observación del cruce', 'Proveedor del costo', 'Fuente del costo', 'Código KrediYA',
    'PVP máximo portal', 'PVP NECESARIO', 'PAGAMOS NUEVO', 'Exceso sobre máximo',
    'Cruce PVP', 'UTILIDAD ESPERADA ', 'CREDITEK', 'Observación PVP'
  ];
  // Equivalencias revisadas en el tarifario de trabajo de noviembre de 2026.
  const b2bAliases = {
  "TECNO SPARK 50 256GB 4RAM": "TECNO Spark 50 4GB+256GB",
  "INFINIX SMART 20 128GB 4+4RAM": "INFINIX SMART 20 4GB+128GB",
  "INFINIX SMART 20 64GB 4+4RAM": "CEL INFINIX SMART 20 4/64",
  "REDMI A7 PRO 64GB 4RAM": "REDMI A7 PRO 64GB 4RAM",
  "HONOR PLAY 10 128GB 4RAM": "HONOR PLAY 10 128 4GB",
  "SAMSUNG GALAXY A17 256GB 8RAM": "SAMSUNG A17 256GB 8RAM",
  "XIAOMI REDMI NOTE 15 5G PRO 256GB 8RAM": "XIAOMI REDMI NOTE 15 PRO 5G 8GB+256GB",
  "REDMI A7 PRO 128GB 4+4RAM": "REDMI A7 PRO 128GB/4GB",
  "REDMI 15C 128GB 4RAM": "REDMI 15C 128GB/4RAM",
  "OPPO A5X 128GB 4+4RAM": "OPPO A5X 128/4",
  "INFINIX HOT 70 256GB 4+4RAM": "INFINIX HOT 70 4GB+256GB",
  "MOTOROLA G06 256GB 4RAM": "MOTO G06 256GB/4GB",
  "NUBIA V80 MAX 256GB 8+12 RAM": "ZTE NUBIA V80 MAX 8GB+256GB",
  "SAMSUNG A17 128GB 4 RAM": "SAMSUNG A17 4/128",
  "SAMSUNG GALAXY A17 128GB 4RAM": "SAMSUNG A17 4/128",
  "REDMI 15C 256GB 8RAM": "REDMI 15C 256 8GB",
  "SAMSUNG GALAXY A07 64GB 4RAM": "GALAXY A07 64 4GB",
  "MOTOROLA G05 128GB 4RAM": "MOTOROLA G05 4/128GB",
  "HONOR 400 SMART 256GB 6RAM": "HONOR 400 Smart 6GB+256GB",
  "TECNO SPARK GO 3 64GB 4RAM": "CEL TECNO GO 3 4/64",
  "REDMI 15C 256GB 4RAM": "REDMI 15C 256GB/4GB",
  "HONOR PLAY 10 64GB 3RAM": "HONOR PLAY 10 64GB/3GB",
  "TECNO SPARK GO 3 128GB 4RAM": "TECNO SPARK GO 3 128GB 4RAM",
  "HONOR X5D 128GB 4RAM": "HONOR X5D 128GB/4GB",
  "INFINIX SMART 20 256GB 4+4RAM": "INFINIX SMART 20 4/256GB",
  "MOTOROLA MOTO G17 POWER 256GB 4RAM": "MOTOROLA MOTO G17 POWER 4GB+256GB",
  "SAMSUNG GALAXY A07 128GB 4RAM": "SAMSUNG A07 4/128GB",
  "SAMSUNG GALAXY A07 128GB 6RAM": "SAMSUNG A07 128GB 6GB",
  "ZTE NUBIA V80 PRO 256GB 8+12RAM": "ZTE NUBIA V80 PRO 8GB+256GB",
  "SAMSUNG GALAXY A17 5G 256GB 8RAM": "SAMSUNG A17 5G 256GB 8GB",
  "TECNO SPARK 50 5G 256GB 8RAM": "TECNO SPARK 50 5G 256GB 8GB",
  "SAMSUNG GALAXY A37 5G 128GB 6RAM": "SM A37 5G 6+128GB (CM)",
  "XIAOMI POCO C71 128GB 4RAM": "POCO C71 4GB+128GB",
  "SAMSUNG A36 5G 256G 8RAM": "SAMSUNG A36 5G 8+256GB",
  "REDMI 15 256GB 8RAM": "REDMI 15 256GB 8RAM",
  "OPPO A6C 128GB 4RAM": "OPPO A6C 128GB/4GB",
  "HONOR X7D 256GB 8RAM": "HONOR X7D 256GB/8GB",
  "REDMI NOTE 17 256GB 6+6RAM": "REDMI NOTE 17 6+256GB",
  "REDMI 17 256GB 4+4RAM": "REDMI 17 256GB 4GB",
  "HONOR X5D 256GB 4RAM": "HONOR X5D 256GB/4GB",
  "REDMI 17 128GB 4+4RAM": "REDMI 17 4/128GB",
  "MOTOROLA G06 128GB 4RAM": "MOTO g06 de 128 y 4 ram",
  "ZTE NUBIA FOCUS 2 5G 256GB 8+12RAM": "ZTE NUBIA FOCUS 2 5G 8GB+256GB"
};
  const tariffKey = value => String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  function indexReference(rows, keys) {
    const index = new Map();
    for (const row of rows) {
      for (const key of new Set(keys(row).map(tariffKey).filter(Boolean))) {
        index.set(key, index.has(key) ? null : row);
      }
    }
    return index;
  }
  function tarifaRows(rows, referenceRows = []) {
    const references = indexReference(referenceRows, row => [row[1]]);
    const codes = indexReference(referenceRows, row => [row[0], row[12]]);
    return [tariffHeaders, ...rows.map(r => {
      const code = tariffKey(r.codigo);
      const byCode = codes.get(code);
      const name = tariffKey(r.referencia);
      const byName = references.get(name);
      const nameCodes = byName ? [byName[0], byName[12]].map(tariffKey).filter(Boolean) : [];
      const compatibleName = byName && (!code || !nameCodes.length || nameCodes.includes(code));
      const reference = byCode ?? (byCode === null ? null : compatibleName ? byName : null);
      const extra = tariffHeaders.slice(5).map((_, i) => reference?.[i + 5] ?? null);
      const pvp = numeric(r.precio_venta);
      const pagamos = numeric(r.pagamos);
      const cost = numeric(extra[0]);
      const cap = numeric(extra[8]);
      const proposedPayment = numeric(extra[10]);
      extra[1] = pagamos === null || cost === null ? null : pagamos - cost;
      extra[2] = cost > 0 && extra[1] !== null ? extra[1] / cost : null;
      extra[4] = reference
        ? [byCode ? 'Cruce por código' : 'Cruce por nombre exacto', extra[4]].filter(Boolean).join(' · ')
        : referenceRows.length ? (byCode === null || byName === null ? 'Cruce ambiguo' : 'Sin coincidencia') : null;
      extra[11] = pvp === null || cap === null ? null : Math.max(0, pvp - cap);
      extra[13] = proposedPayment === null || cost === null ? null : proposedPayment - cost;
      return [r.codigo || '', r.referencia, pvp, pagamos, r.vigente_desde, ...extra];
    })];
  }
  function readTariffReference(data) {
    const book = root.XLSX.read(data, {type:'array'});
    const matchingSheets = book.SheetNames.map(name => root.XLSX.utils.sheet_to_json(book.Sheets[name], {
      header:1, raw:true, defval:null, blankrows:false
    })).map(rows => {
      const start=rows.findIndex(headers=>headers && tariffHeaders.every((header,i)=>tariffKey(header)===tariffKey(headers[i])));
      return start<0?null:rows.slice(start);
    }).filter(Boolean);
    if (matchingSheets.length !== 1) {
      throw new Error('Selecciona un Excel con una hoja que tenga las 21 columnas del tarifario en el mismo orden.');
    }
    return matchingSheets[0].slice(1);
  }
  function addB2BCosts(matrix, products, offers, providers, aliases) {
    const supplier=new Map(providers.map(p=>[p.id,p.nombre]));
    const byName=new Map();
    for(const product of products){const key=tariffKey(product.nombre);if(!byName.has(key))byName.set(key,[]);byName.get(key).push(product);}
    for(const row of matrix.slice(1)){
      const exact=tariffKey(row[1]), alias=tariffKey(aliases[row[1]]), candidates=byName.get(exact)||byName.get(alias)||[];
      if(candidates.length!==1){if(candidates.length>1)row[9]='Cruce B2B ambiguo · requiere revisión';continue;}
      const product=candidates[0];
      const available=offers.filter(o=>o.producto_id===product.id && supplier.has(o.proveedor_id) && numeric(o.costo)>0).sort((a,b)=>numeric(a.costo)-numeric(b.costo)||String(a.id).localeCompare(String(b.id)));
      if(!available.length)continue;
      const best=available[0];row[5]=numeric(best.costo);row[6]=numeric(row[3])===null?null:numeric(row[3])-row[5];row[7]=row[6]===null?null:row[6]/row[5];
      row[8]=product.nombre;row[9]=exact===tariffKey(product.nombre)?'Coincidencia exacta B2B':'Equivalencia del archivo de trabajo';row[10]=supplier.get(best.proveedor_id);row[11]='Oferta vigente B2B · menor costo';
    }
    return matrix;
  }
  async function exportTariff(matrix) {
    if(!root.ExcelJS){await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';script.onload=resolve;script.onerror=()=>reject(new Error('No se pudo cargar el generador de Excel.'));document.head.appendChild(script);});}
    const response=await fetch('/creditek/shared/branding/creditek-logo.png');if(!response.ok)throw new Error('No se pudo cargar el logo de Creditek.');
    const logo=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;response.blob().then(blob=>reader.readAsDataURL(blob),reject);});
    const book=new root.ExcelJS.Workbook();book.creator='KORA · Creditek';book.calcProperties.fullCalcOnLoad=true;
    const sheet=book.addWorksheet('Tarifario',{views:[{state:'frozen',ySplit:6,xSplit:2,showGridLines:false}]});
    sheet.addImage(book.addImage({base64:logo,extension:'png'}),{tl:{col:0.1,row:0.15},ext:{width:150,height:150*825/1906}});
    sheet.mergeCells('D2:U2');sheet.getCell('D2').value='TARIFARIO KREDIYA · CREDITEK';sheet.getCell('D2').font={name:'Arial',size:17,bold:true,color:{argb:'FF0B1E3D'}};
    sheet.mergeCells('D3:U3');sheet.getCell('D3').value='Valores vigentes al descargar · COP · Costo: menor oferta B2B identificada';sheet.getCell('D3').font={name:'Arial',size:10,color:{argb:'FF5E6F88'}};
    sheet.getRow(6).values=matrix[0];sheet.getRow(6).height=38;
    sheet.getRow(6).eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF0B1E3D'}};cell.font={name:'Arial',bold:true,color:{argb:'FFFFFFFF'},size:10};cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};});
    matrix.slice(1).forEach((values,i)=>{const row=sheet.getRow(i+7);row.values=values;row.height=24;for(let c=1;c<=matrix[0].length;c++){const cell=row.getCell(c);cell.font={name:'Arial',size:10,color:{argb:'FF10213E'}};cell.alignment={vertical:'middle',horizontal:c===2||c===9||c===10||c===11||c===12?'left':'center',wrapText:true};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:(c===15||c===16)?'FFFFF2CC':i%2?'FFF1F9FA':'FFFFFFFF'}};if([3,4,6,7,14,15,16,17,19,20].includes(c))cell.numFmt='"$"#,##0';if(c===8)cell.numFmt='0.00%';}
      const n=i+7;row.getCell(15).value=null;row.getCell(16).value=null;
      row.getCell(7).value={formula:`IF(AND(ISNUMBER(D${n}),ISNUMBER(F${n})),D${n}-F${n},"")`};
      row.getCell(8).value={formula:`IF(AND(ISNUMBER(F${n}),F${n}>0,ISNUMBER(G${n})),G${n}/F${n},"")`};
      row.getCell(17).value={formula:`IF(AND(ISNUMBER(C${n}),ISNUMBER(N${n})),MAX(0,C${n}-N${n}),"")`};
      row.getCell(19).value={formula:`IF(AND(ISNUMBER(P${n}),ISNUMBER(F${n})),P${n}-F${n},"")`};
      row.getCell(20).value={formula:`IF(AND(ISNUMBER(O${n}),ISNUMBER(P${n})),O${n}-P${n}-55000,"")`};
    });
    sheet.columns.forEach((col,i)=>{col.width=i===1?39:[8,9,10,11,20].includes(i)?29:19;});sheet.autoFilter={from:'A6',to:`U${matrix.length+5}`};sheet.pageSetup={orientation:'portrait',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0};
    const buffer=await book.xlsx.writeBuffer(),url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})),link=document.createElement('a');link.href=url;link.download='Tarifario-Krediya.xlsx';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function diferenciasRows(rows) {
    const matrix=[['Referencia','Comercio','IMEI','Fecha venta','PVP configurado','PVP Krediya','Diferencia PVP','PAGAMOS pactado','Inicial','Giro al aliado','Bonos','Utilidad neta','Impacto neto','Responsables','Estado','Última gestión','Soporte','Gasto financiero','Provisión'],
      ...rows.map(r=>{const c=r.contexto||{},g=last(r);return [c.referencia,c.tienda,c.imei,c.fecha,numeric(c.pvp_guardado),numeric(c.pvp_liquidado),numeric(c.impacto_bruto),numeric(c.pagamos),numeric(c.inicial),giro(c),c.bono_ejecutivo_pendiente?'Parcial: falta ejecutivo':numeric(c.bonos),c.bono_ejecutivo_pendiente?null:numeric(c.utilidad_neta),numeric(c.impacto_neto),'Gestión y Gerencia',r.preliminar?'Preliminar · sin liquidar':r.estado,g?.comentario||'',g?.soporte||'',numeric(c.gasto_financiero),c.bono_ejecutivo_pendiente?null:numeric(c.provision)];})];
    // Una fila representa un crédito, no una tarifa. No mezclar simulaciones
    // preliminares con registros no preliminares, ni totalizar precios unitarios.
    for(const preliminary of [false,true]){
      const group=rows.flatMap((row,index)=>Boolean(row.preliminar)===preliminary?[matrix[index+1]]:[]);
      if(!group.length)continue;
      const total=matrix[0].map(()=> '');
      total[0]=`SUBTOTAL ${preliminary?'PRELIMINAR':'NO PRELIMINAR'} · ${group.length} registros`;
      total[14]='No acredita pago ni ingreso bancario';
      for(const column of [6,7,8,9,10,11,12,17,18]){
        const values=group.map(row=>numeric(row[column])),missing=values.filter(v=>v===null).length;
        const known=values.reduce((sum,value)=>sum+(value===null?0:Math.round(value*100)),0)/100;
        total[column]=missing?`Pendiente: ${missing} sin dato · subtotal conocido COP ${known.toLocaleString('es-CO',{minimumFractionDigits:0,maximumFractionDigits:0})}`:known;
      }
      matrix.push(total);
    }
    return matrix;
  }
  function last(row) {return [...(row.krediya_diferencias_gestiones||[])].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))[0];}
  function pvpSummary(contexts) {
    const groups=new Map();let missing=0,compared=0,affected=0,total=0;
    for(const c of contexts) {
      const saved=numeric(c.pvp_guardado),received=numeric(c.pvp_recibido);
      if(saved==null||received==null){missing++;continue;}
      compared++;
      const delta=Math.round((received-saved)*100)/100;
      if(delta===0)continue;
      affected++;total+=delta;
      // Never average different prices for the same model into a misleading unit price.
      const key=JSON.stringify([c.referencia||c.modelo||'Sin referencia',saved,received]);
      const group=groups.get(key)||{reference:c.referencia||c.modelo||'Sin referencia',saved,received,delta,count:0,total:0};
      group.count++;group.total=Math.round((group.total+delta)*100)/100;groups.set(key,group);
    }
    return {groups:[...groups.values()],missing,compared,affected,total:Math.round(total*100)/100,operations:contexts.length};
  }
  function compactPvpHtml(contexts,amount) {
    const s=pvpSummary(contexts);
    return `<section aria-label="Resumen PVP"><h3>Favor revisar estos PVP</h3><p>${s.operations} créditos · ${s.affected} con diferencias${s.missing?` · ${s.missing} sin datos para comparar`:''}.</p><p>PAGAMOS se respeta. Este informe no detiene la liquidación ni autoriza pagos.</p><div style="overflow-x:auto"><table><thead><tr><th>Equipo</th><th>Créditos</th><th>PVP KORA</th><th>PVP archivo</th><th>Diferencia por crédito</th><th>Diferencia total</th></tr></thead><tbody>${s.groups.map(g=>`<tr><td>${esc(g.reference)}</td><td>${g.count}</td><td>${amount(g.saved)}</td><td>${amount(g.received)}</td><td>${amount(g.delta)}</td><td>${amount(g.total)}</td></tr>`).join('')}</tbody></table></div><p>${s.affected?`Diferencia acumulada: ${amount(s.total)}.`:'No se encontraron diferencias entre los PVP comparables.'} Diferencia = PVP del archivo − PVP KORA vigente en la fecha de venta. No es una pérdida bancaria ni una modificación de PAGAMOS.</p>${s.missing?`<details><summary>Ver ${s.missing} créditos sin comparación completa</summary>${contexts.filter(c=>numeric(c.pvp_guardado)==null||numeric(c.pvp_recibido)==null).map(c=>`<p>${esc(c.referencia||c.modelo)} · Crédito ${esc(c.credito||c.operation_id)} · ${esc(c.tienda)} · PVP KORA: ${numeric(c.pvp_guardado)==null?'No disponible':amount(c.pvp_guardado)} · PVP archivo: ${numeric(c.pvp_recibido)==null?'No disponible':amount(c.pvp_recibido)}</p>`).join('')}</details>`:''}</section>`;
  }
  function download(rows,name,sheetName,context=[]) {
    const book=root.XLSX.utils.book_new(),sheet=root.XLSX.utils.aoa_to_sheet(rows);
    sheet['!cols']=rows[0].map((h,i)=>({wch:i===1?36:Math.min(26,Math.max(18,h.length+2))}));
    const firstSubtotal=rows.findIndex(row=>String(row[0]).startsWith('SUBTOTAL '));
    sheet['!autofilter']={ref:root.XLSX.utils.encode_range({s:{r:0,c:0},e:{r:firstSubtotal<0?rows.length-1:firstSubtotal-1,c:rows[0].length-1}})};
    // Text stays text; no user-supplied Excel formulas are created.
    for(let r=1;r<rows.length;r++) for(let c=0;c<rows[0].length;c++) {
      const cell=sheet[root.XLSX.utils.encode_cell({r,c})];
      if(cell?.t!=='n') continue;
      if(sheetName!=='Tarifario' || [2,3,5,6,13,14,15,16,18,19].includes(c)) cell.z='"$"#,##0';
      if(sheetName==='Tarifario' && c===7) cell.z='0.00%';
    }
    if(sheetName==='Tarifario' && context.length) {
      sheet.T1.c=[{a:'KORA',t:'Importe de la propuesta comercial del archivo de referencia: '+context[0]}];
    }
    root.XLSX.utils.book_append_sheet(book,sheet,sheetName);
    if(context.length && sheetName!=='Tarifario'){const metadata=root.XLSX.utils.aoa_to_sheet([['Parámetro','Valor'],...context]);metadata['!cols']=[{wch:32},{wch:80}];root.XLSX.utils.book_append_sheet(book,metadata,'Contexto');}
    root.XLSX.writeFile(book,name);
  }
  function create({sb,money}) {
    let modal;
    const amount=v=>numeric(v)==null?'No disponible':money(numeric(v));
    async function all(query) {
      const rows=[];
      for(let offset=0;;offset+=500) {
        const {data,error}=await query().range(offset,offset+499);if(error)throw error;
        if(!Array.isArray(data))throw new Error('La respuesta está incompleta. Vuelve a intentar.');
        rows.push(...data);if(data.length<500)return rows;
      }
    }
    async function openOperationTariff(operationId,onSaved) {
      const dialog=document.createElement('dialog');dialog.className='krediya-tariff-dialog';
      dialog.innerHTML='<header><h2>Datos de la referencia</h2><button class="btn secondary" data-close>Cerrar</button></header><div data-content>Cargando…</div>';
      document.body.append(dialog);dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
      const content=dialog.querySelector('[data-content]');
      try {
        const {data:c,error}=await sb.rpc('aliados_contexto_precio_krediya',{p_operation_id:operationId});if(error)throw error;
        let rule=null;
        if(c.regla_id){const result=await sb.from('krediya_price_rules').select('*').eq('id',c.regla_id).single();if(result.error)throw result.error;rule=result.data;}
        if(rule?.vigente_hasta){content.innerHTML=`<h3>${esc(c.referencia)}</h3><p>Esta venta usa la tarifa histórica vigente del ${esc(rule.vigente_desde)} al ${esc(rule.vigente_hasta)}: PVP KORA ${amount(rule.precio_venta)} y PAGAMOS ${amount(rule.pagamos)}.</p><p>Ya existe una vigencia posterior. Este formulario no sobrescribe el histórico ni aplica el precio de hoy a ventas anteriores. La corrección de esa vigencia requiere revisión específica.</p>`;return;}
        content.innerHTML=`<h3>${esc(c.referencia)}</h3><p>PVP del archivo Krediya: ${amount(c.pvp_recibido)}. Se conserva el archivo original.</p><form class="tariff-form"><label>PVP de KORA<input class="control" name="pvp" type="number" min="0.01" step="0.01" required value="${esc(c.pvp_guardado??'')}"></label><label>PAGAMOS pactado<input class="control" name="pagamos" type="number" min="0.01" step="0.01" required value="${esc(c.pagamos_guardado??'')}"></label><label>Aplicar a ventas desde<input class="control" name="desde" type="date" required value="${esc(c.fecha)}" ${rule?`min="${esc(rule.vigente_desde)}"`:''}></label><p>Se guarda para esta referencia y las ventas de su vigencia. No modifica liquidaciones aprobadas ni autoriza pagos.</p><p data-error role="alert"></p><button class="btn primary" type="submit">Guardar datos de la referencia</button></form>`;
        content.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button');b.disabled=true;
          try {const pvp=numeric(f.elements.pvp.value),pagamos=numeric(f.elements.pagamos.value);if(!(pvp>0&&pagamos>0))throw new Error('Completa PVP y PAGAMOS mayores que cero.');
            const args={p_pvp:pvp,p_pagamos:pagamos,p_desde:f.elements.desde.value};
            const result=rule?await sb.rpc('krediya_guardar_tarifa',{...args,p_id:rule.id,p_version:rule.updated_at,p_motivo:'Edición explícita desde transacción '+operationId}):await sb.rpc('krediya_crear_tarifa_operacion',{...args,p_operation_id:operationId});
            if(result.error)throw result.error;dialog.close();await onSaved?.();
          }catch(err){f.querySelector('[data-error]').textContent=err.message;b.disabled=false;}
        };
      }catch(error){content.textContent='No se pudieron cargar los datos: '+error.message;}
    }
    async function openTariff() {
      modal?.remove();modal=document.createElement('dialog');modal.className='krediya-tariff-dialog';
      modal.setAttribute('aria-labelledby','krediya-tariff-title');
      modal.innerHTML='<header><h2 id="krediya-tariff-title">Tarifario Krediya</h2><button class="btn secondary" data-close>Cerrar</button></header><p>PVP configurado y PAGAMOS pactado. Giro al aliado = PAGAMOS − inicial. Editar aquí no cambia precios en la plataforma de Krediya ni liquidaciones aprobadas.</p><div data-content>Cargando…</div>';
      const dialog=modal;
      document.body.append(dialog);dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
      const content=modal.querySelector('[data-content]');let rows=[];
      let referenceRows=[];
      let referenceName='';
      let readingReference=false;
      async function load() {
        try {rows=await all(()=>sb.from('krediya_price_rules').select('*').eq('activo',true).order('referencia').order('vigente_desde',{ascending:false}).order('id'));render();}
        catch(e){content.textContent='No se pudo cargar el tarifario: '+e.message;}
      }
      function render(search='') {
        const filtered=tarifasVigentes(rows).filter(r=>`${r.codigo||''} ${r.referencia}`.toLowerCase().includes(search.toLowerCase()));
        content.innerHTML=`<div class="tariff-controls"><label>Buscar código o referencia<input class="control" data-search value="${esc(search)}"></label><button class="btn primary" data-download ${readingReference?'disabled':''}>Descargar tarifario Excel</button><label>Excel de referencia<input class="control" type="file" accept=".xlsx" data-reference></label></div><p data-reference-status role="status">${esc(referenceName || 'Selecciona el Excel de referencia para incluir costos, topes y propuestas.')}</p><p>${filtered.length} tarifas vigentes hoy · Los precios anteriores se conservan para liquidar según la fecha de venta.</p><p data-export-error role="alert"></p><div class="tariff-list">${filtered.map(r=>`<article><div><h3>${esc(r.referencia)}</h3><p>${esc(r.codigo||'Sin código')} · Desde ${esc(r.vigente_desde)}${r.vigente_hasta?' hasta '+esc(r.vigente_hasta):''}</p></div><dl><div><dt>PVP configurado</dt><dd>${amount(r.precio_venta)}</dd></div><div><dt>PAGAMOS pactado</dt><dd>${amount(r.pagamos)}</dd></div></dl>${r.vigente_hasta?'':'<button class="btn secondary" data-edit="'+esc(r.id)+'">Editar precios</button>'}</article>`).join('')||'<p>No hay referencias con ese filtro.</p>'}</div>`;
        const searchInput=content.querySelector('[data-search]');
        searchInput.oninput=()=>{const pos=searchInput.selectionStart;render(searchInput.value);const input=content.querySelector('[data-search]');input.focus();input.setSelectionRange(pos,pos);};
        content.querySelector('[data-reference]').onchange=async event=>{
          const input=event.currentTarget;
          const file=input.files[0];
          if(!file)return;
          const downloadButton=content.querySelector('[data-download]');
          readingReference=true;
          downloadButton.disabled=true;
          try {
            const nextRows=readTariffReference(await file.arrayBuffer());
            referenceRows=nextRows;
            const matched=tarifaRows(tarifasVigentes(rows),nextRows).slice(1).filter(row=>row[9]?.startsWith('Cruce por')).length;
            referenceName=`${file.name} · ${matched} referencias cruzadas`;
            content.querySelector('[data-reference-status]').textContent=referenceName;
            content.querySelector('[data-export-error]').textContent='';
          }catch(error){
            content.querySelector('[data-export-error]').textContent=error.message;
          }finally{
            input.value='';
            readingReference=false;
            content.querySelector('[data-download]').disabled=false;
          }
        };
        content.querySelector('[data-download]').onclick=async event=>{const button=event.currentTarget;button.disabled=true;try{
          const [products,offers,providers]=await Promise.all([
            all(()=>sb.from('productos').select('id,nombre').eq('activo',true).order('id')),
            all(()=>sb.from('b2b_ofertas').select('id,producto_id,proveedor_id,costo').eq('vigente',true).order('id')),
            all(()=>sb.from('proveedores').select('id,nombre').eq('activo',true).order('id'))
          ]);
          const matrix=addB2BCosts(tarifaRows(filtered,referenceRows),products,offers,providers,b2bAliases);
          await exportTariff(matrix);
          content.querySelector('[data-export-error]').textContent=`Archivo generado · ${matrix.slice(1).filter(row=>row[11]==='Oferta vigente B2B · menor costo').length} costos B2B identificados. Las referencias sin coincidencia segura quedan sin costo.`;
        }catch(error){content.querySelector('[data-export-error]').textContent='No se pudo descargar el Excel: '+error.message;}finally{button.disabled=false;}};
        content.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>edit(rows.find(r=>r.id===b.dataset.edit)));
      }
      function edit(r) {
        const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota'}).format(new Date()),desde=today<r.vigente_desde?r.vigente_desde:today;
        content.innerHTML=`<h3>${esc(r.referencia)}</h3><p>PVP actual: ${amount(r.precio_venta)} · PAGAMOS actual: ${amount(r.pagamos)}</p><form class="tariff-form"><label>PVP configurado<input class="control" name="pvp" type="number" min="0.01" step="0.01" required value="${esc(numeric(r.precio_venta)??'')}"></label><label>PAGAMOS pactado antes de inicial<input class="control" name="pagamos" type="number" min="0.01" step="0.01" required value="${esc(numeric(r.pagamos)??'')}"></label><label>Aplicar a ventas desde<input class="control" name="desde" type="date" min="${esc(r.vigente_desde)}" value="${esc(desde)}" required></label><label>Motivo del cambio<textarea class="control" name="motivo" minlength="5" maxlength="2000" required></textarea></label><p>Se conservarán los valores anteriores en auditoría. Los lotes ya calculados no se actualizan solos; los aprobados no cambian.</p><p data-error role="alert"></p><div class="tariff-controls"><button class="btn secondary" type="button" data-back>Volver</button><button class="btn primary" type="submit">Guardar nueva vigencia</button></div></form>`;
        content.querySelector('[data-back]').onclick=()=>render();
        content.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,button=f.querySelector('[type=submit]');button.disabled=true;
          try {const pvp=numeric(f.elements.pvp.value),pagamos=numeric(f.elements.pagamos.value);if(pvp==null||pagamos==null||pvp<=0||pagamos<=0)throw new Error('Ingresa PVP y PAGAMOS válidos, mayores que cero.');const {error}=await sb.rpc('krediya_guardar_tarifa',{p_id:r.id,p_version:r.updated_at,p_pvp:pvp,p_pagamos:pagamos,p_desde:f.elements.desde.value,p_motivo:f.elements.motivo.value.trim()});if(error)throw error;await load();}
          catch(error){f.querySelector('[data-error]').textContent=error.message;button.disabled=false;}};
      }
      await load();
    }
    async function report(container,batch,focusOperationId) {
      container.textContent='Cargando diferencias de PVP…';
      let rows,preliminary=false,importReport=null;
      try {
        const snapshot=await sb.from('krediya_import_reports').select('contexts,operation_count,report_status,email_status').eq('liquidation_id',batch.id).maybeSingle();
        if(!snapshot.error)importReport=snapshot.data;
        rows=await all(()=>sb.from('krediya_diferencias').select('*,krediya_diferencias_gestiones(*)').eq('liquidation_id',batch.id).order('operation_id'));
        if (!batch.frozen_at && ['importada','validada','con_novedades'].includes(batch.estado)) {
          const operations=await all(()=>sb.from('liquidation_operations').select('id,reconocida,referencia,modelo,establishment_name,imei,operation_at,inicial').eq('liquidation_id',batch.id).order('id'));
          const {data:contexts,error}=await sb.rpc('aliados_contextos_precios_krediya',{p_liquidation_id:batch.id});
          if(error)throw error;
          if(!Array.isArray(contexts)||operations.some(o=>o.reconocida&&!contexts.some(c=>c.operation_id===o.id)))throw new Error('Faltan datos de comparación. Actualiza antes de descargar.');
          rows=root.CreditekKrediyaReview.previewDifferences(operations,contexts);preliminary=true;
        }
      }
      catch(error){container.textContent='No se pudo cargar el informe: '+error.message;return;}
      const summary=impacto(rows);
      const comparison=importReport?.report_status==='preparado'?importReport.contexts:rows.map(r=>({...r.contexto,pvp_recibido:r.contexto?.pvp_recibido??r.contexto?.pvp_liquidado}));
      const emailLabel={sin_configurar:'Correo automático pendiente de configurar; aún no enviado.',pendiente:'Correo pendiente de envío.',enviado:'Informe enviado por correo.',error:'El correo no pudo enviarse; no bloquea la liquidación.'};
      const due=rows.map(r=>r.vence_el).filter(Boolean).sort()[0];
      const states={pendiente:'Pendiente',en_gestion:'En gestión',resuelta:'Resuelta'};
      let page=0,search='';
      function render() {
      const detailsOpen=container.querySelector('[data-report-details]')?.open||Boolean(focusOperationId);
      const filtered=rows.filter(r=>(!focusOperationId||r.operation_id===focusOperationId)&&`${r.contexto?.referencia||''} ${r.contexto?.tienda||''} ${r.contexto?.imei||''}`.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')));
      const pages=Math.max(1,Math.ceil(filtered.length/8));page=Math.min(page,pages-1);
      container.innerHTML=`<section class="krediya-differences">
        <header><div><h3>Diferencias PVP · Gestión y Gerencia</h3><p>Krediya · Corte ${esc(batch.fecha_corte)}${due ? ` · Gestionar hasta ${esc(due)}` : ''}</p></div><button class="btn primary" data-export>Descargar ${preliminary?'vista previa':'informe'} Excel</button></header>
        ${compactPvpHtml(comparison,amount)}
        <p>${importReport?esc(importReport.report_status==='error'?'El informe de importación requiere revisión; se muestra la comparación disponible.':emailLabel[importReport.email_status]||'Estado del correo no disponible.'):'Comparación disponible del lote; no hay envío automático registrado para esta importación anterior.'}</p>
        <details data-report-details ${detailsOpen?'open':''}><summary>Consultar detalle y seguimiento</summary>
        <p>${preliminary?'Vista previa con los datos importados. Al liquidar se guardan el informe definitivo, los bonos y la utilidad.':'Informe consolidado del lote. Las correcciones se gestionan durante los 7 días siguientes.'} Las diferencias de PVP no bloquean el pago ni modifican PAGAMOS.</p>
        <div class="difference-summary"><strong>${rows.length} diferencias de PVP</strong><span>${rows.filter(r=>r.estado!=='resuelta').length} por gestionar</span><span>${preliminary?'Utilidad e impacto neto: pendientes de liquidar':`${summary.pendientes?'Impacto neto parcial':'Impacto neto cuantificado'}: ${amount(summary.total)}`}</span></div>
        <div class="krediya-review-controls"><label>Buscar referencia, tienda o IMEI<input class="control" data-search value="${esc(search)}"></label>${focusOperationId?'<button class="btn secondary" data-all>Ver todo el lote</button>':''}<span>${filtered.length} resultados</span></div>
        <p data-export-error role="alert"></p>
        ${filtered.length?'':'<p>No hay diferencias de PVP en esta vista.</p>'}
        ${filtered.slice(page*8,(page+1)*8).map(r=>{
          const c=r.contexto||{},g=last(r);
          const fields=[['PVP configurado',c.pvp_guardado],['PVP Krediya',c.pvp_liquidado],['Diferencia',c.impacto_bruto],['PAGAMOS pactado',c.pagamos]];
          const extra=[['Inicial',c.inicial],['PAGAMOS − inicial',giro(c)],['Bonos',c.bono_ejecutivo_pendiente?null:c.bonos],['Gasto financiero',c.gasto_financiero],['Provisión',c.bono_ejecutivo_pendiente?null:c.provision],['Utilidad neta',c.bono_ejecutivo_pendiente?null:c.utilidad_neta],['Impacto neto',c.impacto_neto]];
          return `<article class="difference-card">
            <header><div><h4>${esc(c.referencia||'Referencia no informada')}</h4><p>${esc(c.tienda||'Comercio no informado')} · IMEI ${esc(c.imei||'No informado')} · Venta ${esc(c.fecha||'No informada')}</p></div><span class="difference-status">${esc(states[r.estado]||'Estado no informado')}</span></header>
            <dl>${fields.map(([label,value])=>`<div><dt>${label}</dt><dd>${amount(value)}</dd></div>`).join('')}</dl>
            ${numeric(c.pvp_guardado)==null?'<p>Falta PVP de referencia para comparar; el cálculo usa el PVP recibido y respeta PAGAMOS.</p>':''}
            <details><summary>Ver desglose${preliminary?' preliminar':''}</summary><dl>${extra.map(([label,value])=>`<div><dt>${label}</dt><dd>${amount(value)}</dd></div>`).join('')}</dl></details>
            ${g?`<p>Última gestión: ${esc(g.comentario)} · ${esc(g.autor_nombre)}</p>`:''}
            ${preliminary?'<p>El seguimiento del informe se habilita al liquidar; no hay que aceptar esta diferencia.</p>':`<details><summary>Gestionar / ver historial</summary>
              <p>Deja la instrucción para Gestión y Gerencia. Guardarla no modifica el precio en la plataforma de Krediya ni registra un pago.</p>
              ${(r.krediya_diferencias_gestiones||[]).map(g=>`<p>${esc(g.created_at)} · ${esc(g.autor_nombre)} · ${esc(states[g.estado]||g.estado)}<br>${esc(g.comentario)}<br>${esc(g.soporte||'')}</p>`).join('')}
              <form data-followup="${esc(r.operation_id)}" class="tariff-form"><label>Estado<select class="control" name="estado"><option value="en_gestion">En gestión</option><option value="resuelta">Resuelta</option></select></label><label>Instrucción para Gestión y Gerencia<textarea class="control" name="comentario" minlength="5" maxlength="4000" required></textarea></label><label>Soporte (obligatorio al resolver)<input class="control" name="soporte" maxlength="2000"></label><p data-error role="alert"></p><button class="btn primary" type="submit">Guardar seguimiento</button></form>
            </details>`}</article>`;
        }).join('')}<div class="krediya-review-controls"><button class="btn secondary" data-prev ${page===0?'disabled':''}>Anterior</button><span>Página ${page+1} de ${pages}</span><button class="btn secondary" data-next ${page+1>=pages?'disabled':''}>Siguiente</button></div></details></section>`;
      container.querySelector('[data-search]').oninput=e=>{search=e.target.value;page=0;render();const input=container.querySelector('[data-search]');input.focus();input.setSelectionRange(search.length,search.length);};
      if(container.querySelector('[data-all]'))container.querySelector('[data-all]').onclick=()=>{focusOperationId=null;page=0;render();};
      for(const [key,delta] of [['prev',-1],['next',1]])container.querySelector(`[data-${key}]`).onclick=()=>{page+=delta;render();container.scrollIntoView({block:'start'});};
      container.querySelector('[data-export]').onclick=()=>{try{download(diferenciasRows(filtered),`${preliminary?'Preliminar-':''}Diferencias-Krediya-${batch.fecha_corte}.xlsx`,'Gestión y Gerencia',[['Corte del lote',batch.fecha_corte],['Lote',batch.id],['Búsqueda aplicada',search||'Todas'],['Operación seleccionada',focusOperationId||'Todas'],['Cobertura','Todas las páginas de los resultados filtrados'],['Registros exportados',filtered.length],['Fase',preliminary?'Preliminar · sin liquidar':'No preliminar'],['Advertencia','Importes registrados de la consulta. No acredita pago ni ingreso bancario.']]);}catch{container.querySelector('[data-export-error]').textContent='No se pudo descargar el Excel. Recarga la página y vuelve a intentar.';}};
      container.querySelectorAll('[data-followup]').forEach(f=>{
        f.elements.estado.onchange=()=>{f.elements.soporte.required=f.elements.estado.value==='resuelta';};
        f.onsubmit=async e=>{e.preventDefault();const button=f.querySelector('[type=submit]');button.disabled=true;
          try{const {error}=await sb.rpc('krediya_gestionar_diferencia',{p_operation_id:f.dataset.followup,p_estado:f.elements.estado.value,p_comentario:f.elements.comentario.value.trim(),p_soporte:f.elements.soporte.value.trim()||null});if(error)throw error;await report(container,batch);}
          catch(error){f.querySelector('[data-error]').textContent=error.message;button.disabled=false;}};
      });
      }
      render();
    }
    return {openTariff,openOperationTariff,report};
  }
  const api={create,tarifasVigentes,tarifaRows,readTariffReference,addB2BCosts,exportTariff,diferenciasRows,last,numeric,giro,impacto,pvpSummary,compactPvpHtml};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.CreditekKrediyaTarifario=api;
})(typeof window==='undefined'?globalThis:window);
