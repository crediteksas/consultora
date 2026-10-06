// Prueba de navegador aislada: sin sesiones ni datos de producción.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
const browser=await chromium.launch({headless:true,channel:'chrome'});
try {
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const source=readFileSync('creditek/erp/inventario.html','utf8');
 await page.setContent('<html><head><style>'+source.match(/<style>([\s\S]*?)<\/style>/)[1]+'</style></head><body></body></html>');
 await page.addScriptTag({content:readFileSync('node_modules/xlsx/dist/xlsx.full.min.js','utf8')});
 await page.addScriptTag({content:readFileSync('creditek/erp/conteos-domain.js','utf8')});
 await page.addScriptTag({content:readFileSync('creditek/erp/conteos-ui.js','utf8')});
 await page.evaluate(async()=>{
   window.calls=[];window.downloads=[];
   XLSX.writeFile=(book,name)=>downloads.push({names:book.SheetNames,rows:XLSX.utils.sheet_to_json(book.Sheets.Conteo||book.Sheets.Comparativo||book.Sheets['Conteos y ajustes'],{defval:''}),sheets:Object.fromEntries(book.SheetNames.map(sheet=>[sheet,XLSX.utils.sheet_to_json(book.Sheets[sheet],{defval:''})])),name});
   const c={id:'11111111-1111-4111-8111-111111111111',tienda_codigo:'A',tienda_nombre:'Tienda de prueba',corte_at:new Date(Date.now()-60000).toISOString(),creado_nombre:'Operadora',estado:'abierto',base_conteo:'corte_fijo'};
   window.demoCorte=c;window.demoCortes=[c];window.demoDetails={};
   window.demoCuenta=[
    {id:'1',tienda_codigo:'A',tipo:'cargo',monto:1000000,created_at:'2026-09-01T10:00:00Z'},
    {id:'2',tienda_codigo:'A',tipo:'abono',monto:100000,created_at:'2026-09-02T10:00:00Z'},
    {id:'3',tienda_codigo:'B',tipo:'cargo',monto:500000,created_at:'2026-10-01T10:00:00Z'},
    {id:'4',tienda_codigo:'A',tipo:'cargo',monto:200000,created_at:'2026-12-01T10:00:00Z'},
   ];
   const lines=[{producto_id:'a',codigo:'VID',nombre:'Vidrio',tipo:'cantidad',imei:'',cantidad_corte:250,costo_tienda:1500,cantidad_fisica:null,esperado_conteo:null,diferencia:null,actual:233},
    {producto_id:'b',codigo:'CEL',nombre:'Equipo',tipo:'serializado',imei:'000000000000001',cantidad_corte:1,costo_tienda:400000,cantidad_fisica:null,esperado_conteo:null,diferencia:null,actual:1}];
   const sb={from:name=>{
     if(name!=='cuenta_corriente')throw new Error('Tabla no prevista: '+name);
     const query={store:null,before:null,select(){return this;},eq(_field,value){this.store=value;return this;},lt(_field,value){this.before=value;return this;},order(){return this;},async range(start,end){return {data:demoCuenta.filter(row=>row.tienda_codigo===this.store&&row.created_at<this.before).slice(start,end+1),error:null};}};
     return query;
   },rpc:async(name,{p_accion:a,p_datos:d,p_corte_id:corteId})=>{
     calls.push({a,d,name});
     if(name==='cierre_utilidad_retail'){
       if(a==='cerrar')window.demoClosed=true;
       return {data:{cerrado:!!window.demoClosed,cierre_id:'cierre-1',cerrado_at:new Date().toISOString(),huella:'actual',listo:c.estado==='aplicado',inicio_at:'2026-09-01T08:00:00Z',fin_at:c.corte_at,ventas_totales:2000000,costo_vendido:1000000,gastos_totales:200000,perdidas_ajustes:100000,ganancias_ajustes:100000,ajuste_conciliacion:0,utilidad_neta:800000,bloqueos:c.estado==='aplicado'?[]:['Pendiente de aprobación']}};
     }
     if(name==='inventario_ajuste_documento'){
       if(a==='aplicar'&&window.demoApplyError)return {error:{message:window.demoApplyError}};
       if(a==='aplicar'){c.estado='aplicado';c.autorizado_nombre='Maite';c.autorizado_at=new Date().toISOString();for(const l of lines)l.posterior=l.actual+l.diferencia;}
       return {data:structuredClone({corte:c,lineas:lines,puede_cerrar_utilidad:true,documento:c.estado==='aplicado'?{
         numero:'AJ-A-000001',corte_id:c.id,documento_id:'doc-1',tienda_nombre:c.tienda_nombre,tienda_codigo:'A',corte_at:c.corte_at,
         autorizado_nombre:'Maite',autorizado_at:c.autorizado_at,motivo:'Conteo verificado',soporte:'Acta',
         totales:{referencias:1,unidades_faltantes:0,unidades_sobrantes:249,faltantes:0,sobrantes:373500,impacto_neto:373500},
         lineas:lines.filter(l=>l.diferencia).map(l=>({...l,anterior:l.actual,valor_ajuste:l.diferencia*l.costo_tienda,clasificacion:'sobrante',movimientos:[1]}))}:null})};
     }
     if(a==='config')return {data:{autoriza:true,central:true,tiendas:[{codigo:'A',nombre:'Tienda de prueba'},{codigo:'B',nombre:'Otra tienda'},{codigo:'C',nombre:'Tienda sin corte'}]}};
     if(a==='listar')return {data:{registros:[]}};
     if(a==='resumen')return {data:{anio:2026,filas:[]}};
     if(a==='informe')return {data:{cortes:demoCortes.filter(cut=>!d.tienda||cut.tienda_codigo===d.tienda)}};
     if(a==='ver'&&demoDetails[d.id])return {data:structuredClone(demoDetails[d.id])};
     if(a==='subir'){c.estado='pendiente';c.contado_at=d.contado_at;c.contado_nombre='Operadora';c.archivo_nombre=d.archivo;c.archivo_sha256=d.sha256;for(const l of lines){const f=d.filas.find(f=>f.codigo===l.codigo);l.cantidad_fisica=f.cantidad;l.esperado_conteo=l.cantidad_corte;l.diferencia=f.cantidad-l.cantidad_corte;}}
     if(a==='aplicar_conteo'){c.estado='aplicado';c.autorizado_nombre='Maite';c.autorizado_at=new Date().toISOString();for(const l of lines)l.posterior=l.actual+l.diferencia;}
     return {data:structuredClone({corte:c,lineas:lines})};
   }};
   window.ui=KoraConteosUI.init({sb,XLSX,tiendaActual:()=> 'A',refrescar:async()=>{}});await ui.abrir();
 });
 await page.locator('#conteos-crear').click();
 await page.waitForFunction(()=>downloads.length===1);
 assert.equal(await page.evaluate(()=>calls.some(c=>c.a==='crear')),false,'Un corte abierto de hoy se reutiliza sin duplicarlo');
 const out=await page.evaluate(()=>downloads[0]);assert.equal(out.rows.length,2);assert.equal(out.rows[1]['IMEI / serial'],'000000000000001');assert.deepEqual(out.names,['Conteo','Resumen']);
 const id='11111111-1111-4111-8111-111111111111';
 const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Formato','KORA-CONTEO-2'],['ID',id]]),'Resumen');
 XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet([{'Código producto':'VID','IMEI / serial':'','Cantidad reportada al corte':499},{'Código producto':'CEL','IMEI / serial':'000000000000001','Cantidad reportada al corte':1}]),'Conteo');
 await page.locator('#conteos-archivo').setInputFiles({name:'conteo.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:XLSX.write(book,{type:'buffer',bookType:'xlsx'})});
 assert.equal(await page.locator('#conteos-fecha-modo').count(),0);
 await page.locator('#conteos-confirmar-corte').check();
 // setContent has an opaque origin; install the digest only for this isolated harness.
 await page.evaluate(()=>{if(!crypto.subtle)Object.defineProperty(crypto,'subtle',{value:{digest:async()=>new Uint8Array(32).buffer}});});
 await page.locator('#conteos-form-subir button').click();
 await page.waitForFunction(()=>calls.some(c=>c.a==='subir'));
 await page.waitForFunction(()=>document.getElementById('conteos-utilidad-cerrar'));
 assert.equal(await page.locator('#conteos-utilidad-cerrar').isDisabled(),true,'No cierra utilidad antes del ajuste');
 assert.match(await page.locator('#conteos-form-decidir button[type=submit]').innerText(),/Aplicar ajuste de inventario/);
 assert.equal(await page.evaluate(()=>calls.find(c=>c.a==='subir').d.base_conteo),'corte_fijo');
 assert.match(await page.locator('#conteos-archivo-soporte').innerText(),/conteo.xlsx/);
 assert.match(await page.locator('#conteos-form-decidir').innerText(),/Referencia adicional \(opcional\)/);
 await page.locator('#conteos-form-decidir button[type=submit]').click();
 await page.waitForFunction(()=>document.getElementById('conteos-decision-mensaje').textContent.includes('Explica el motivo'));
 assert.equal(await page.locator('#conteos-decision-mensaje').isVisible(),true,'El motivo vacío ya no bloquea silenciosamente el submit');
 assert.equal(await page.evaluate(()=>calls.some(c=>c.a==='aplicar')),false);
 await page.locator('#conteos-motivo').fill('Conteo verificado');
 await page.locator('#conteos-form-decidir button[type=submit]').click();
 await page.waitForFunction(()=>document.getElementById('conteos-decision-mensaje').textContent.includes('clasificación general'));
 await page.locator('#conteos-clasificacion').selectOption('sobrante_por_aclarar');
 await page.locator('#conteos-form-decidir button[type=submit]').click();
 await page.waitForFunction(()=>document.getElementById('conteos-decision-mensaje').textContent.includes('Clasifica cada diferencia'));
 assert.equal(await page.evaluate(()=>calls.some(c=>c.a==='aplicar')),false);
 await page.locator('[data-decision-codigo="VID"]').selectOption('sobrante');
 await page.locator('#conteos-adjuntar-fotos').click();
 assert.equal(await page.locator('#conteos-fotos-panel').evaluate(e=>e.open),true);
 assert.equal(await page.locator('#conteos-nc-foto').isVisible(),true,'La opción de adjuntar foto está accesible desde el ajuste');
 assert.equal(await page.locator('#conteos-nc-corte').inputValue(),id);
 assert.match(await page.locator('#conteos-nc-soporte').inputValue(),/Archivo de conteo: conteo.xlsx · SHA256: [a-f0-9]{64}/);
 assert.equal(await page.locator('[data-decision-codigo="VID"]').inputValue(),'sobrante','Abrir fotos no borra clasificaciones');
 assert.equal(await page.evaluate(()=>calls.some(c=>c.a==='solicitar')),false,'Abrir el adjunto no solicita ni aplica nada');
 page.on('dialog',d=>d.accept());
 await page.evaluate(()=>{window.demoApplyError='Falta solicitud con foto para el no conforme VID';});
 await page.locator('#conteos-form-decidir button[type=submit]').click();
 await page.waitForFunction(()=>document.getElementById('conteos-decision-mensaje').textContent.includes('Falta solicitud con foto'));
 assert.equal(await page.locator('#conteos-decision-mensaje').isVisible(),true,'Los errores del servidor se muestran junto al botón');
 assert.equal(await page.locator('#conteos-motivo').inputValue(),'Conteo verificado');
 assert.equal(await page.locator('[data-decision-codigo="VID"]').inputValue(),'sobrante');
 assert.equal(await page.evaluate(()=>demoCorte.estado),'pendiente');
 await page.evaluate(()=>{window.demoApplyError=null;});
 // Un nombre sin SHA válido no sustituye un soporte: sigue siendo obligatorio.
 const attempted=await page.evaluate(()=>calls.filter(c=>c.a==='aplicar').length);
 await page.evaluate(async()=>{demoCorte.archivo_sha256='incompleto';await ui.abrir();});
 await page.locator(`[data-conteo-id="${id}"]`).click();
 await page.waitForFunction(()=>document.getElementById('conteos-form-decidir'));
 assert.equal(await page.locator('#conteos-archivo-soporte').count(),0);
 await page.locator('#conteos-motivo').fill('Conteo verificado');
 await page.locator('#conteos-clasificacion').selectOption('sobrante_por_aclarar');
 await page.locator('#conteos-form-decidir button[type=submit]').click();
 await page.waitForFunction(()=>document.getElementById('conteos-decision-mensaje').textContent.includes('Completa la referencia'));
 assert.equal(await page.evaluate(()=>calls.filter(c=>c.a==='aplicar').length),attempted);
 await page.evaluate(async()=>{demoCorte.archivo_sha256=calls.find(c=>c.a==='subir').d.sha256;await ui.abrir();});
 await page.locator(`[data-conteo-id="${id}"]`).click();
 await page.waitForFunction(()=>document.getElementById('conteos-archivo-soporte'));
 await page.locator('#conteos-motivo').fill('Conteo verificado');
 await page.locator('#conteos-clasificacion').selectOption('sobrante_por_aclarar');
 await page.locator('[data-decision-codigo="VID"]').selectOption('sobrante');
 assert.match(await page.locator('#conteos-lineas').innerText(),/482/);
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'/tmp/kora-conteos-mobile.png'});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.locator('#conteos-form-decidir button[type=submit]').click();
 await page.waitForFunction(()=>document.getElementById('conteos-documento-excel'));
 assert.match(await page.evaluate(()=>calls.filter(c=>c.name==='inventario_ajuste_documento'&&c.a==='aplicar').at(-1).d.soporte),/Archivo de conteo: conteo.xlsx · SHA256: [a-f0-9]{64}/,'El Excel ya cargado es el soporte aun con referencia adicional vacía');
 assert.match(await page.locator('#conteos-detalle').innerText(),/Ajuste aplicado/);
 assert.match(await page.locator('#conteos-cierre').innerText(),/AJ-A-000001/);
 await page.locator('#conteos-utilidad-cerrar').click();
 await page.waitForFunction(()=>document.getElementById('conteos-cierre').textContent.includes('Resultado guardado'));
 assert.equal(await page.locator('#conteos-utilidad-cerrar').count(),0);
 await page.locator('#conteos-documento-excel').click();
 await page.waitForFunction(()=>downloads.at(-1).name==='AJ-A-000001.xlsx');
 assert.deepEqual(await page.evaluate(()=>downloads.at(-1).names),['Documento','Movimientos','Utilidad neta']);
 assert.equal(await page.evaluate(()=>downloads.at(-1).sheets.Movimientos[0]['Después del ajuste']),482);
 await page.evaluate(async()=>{demoCorte.estado='pendiente';demoCorte.revision_fuente={solo_comparativo:true,fecha_confirmada:'2026-09-06',nota:'Fecha confirmada por Óscar. Fuentes con fecha impresa del día 7.',fuentes:[{nombre:'Archivo.xlsx',sha256:'a'.repeat(64),fecha_impresa:'2026-09-07 09:11:32'}],pendientes:[{nombre:'SIM TIGO PAQUETE',fila:361,base:42,conteo:42,motivo:'Código por aclarar',archivo:'Archivo.xlsx'}]};await ui.abrir();});
 await page.locator('[data-conteo-id]').click();
 await page.waitForFunction(()=>document.getElementById('conteos-detalle').textContent.includes('Comparativo histórico'));
 assert.match(await page.locator('#conteos-detalle').innerText(),/SIM TIGO PAQUETE/);
 assert.equal(await page.locator('#conteos-form-decidir').count(),0);
 assert.equal(await page.locator('#conteos-form-subir').count(),0);
 await page.locator('#conteos-redescargar').click();
 assert.deepEqual(await page.evaluate(()=>downloads.at(-1).names),['Comparativo','Por aclarar','Fuentes']);
 await page.locator('#conteos-informe').click();
 await page.waitForFunction(()=>downloads.at(-1).names.includes('Conteos y ajustes'));
 assert.deepEqual(await page.evaluate(()=>downloads.at(-1).names),['Conteos y ajustes','Por aclarar']);
 await page.evaluate(()=>{
   delete demoCorte.revision_fuente;
   demoCorte.estado='aplicado';
   const old={id:'22222222-2222-4222-8222-222222222222',tienda_codigo:'A',tienda_nombre:'Tienda de prueba',corte_at:'2026-09-01T13:00:00Z',estado:'aplicado',contado_at:'2026-09-01T13:00:00Z'};
   const other={id:'33333333-3333-4333-8333-333333333333',tienda_codigo:'B',tienda_nombre:'Otra tienda',corte_at:'2026-10-04T13:00:00Z',estado:'pendiente',contado_at:'2026-10-04T13:00:00Z'};
   demoCortes=[old,demoCorte,other];
   demoDetails[old.id]={corte:old,lineas:[{codigo:'OLD',nombre:'Producto antiguo',imei:'',cantidad_corte:1,cantidad_fisica:0,diferencia:-1,costo_tienda:10}]};
   demoDetails[other.id]={corte:other,lineas:[{codigo:'B01',nombre:'Vidrio B',imei:'',cantidad_corte:2,cantidad_fisica:1,diferencia:-1,costo_tienda:100,actual:2}]};
 });
 await page.locator('#conteos-desde').fill('2026-12-01');
 await page.locator('#conteos-hasta').fill('2026-12-31');
 await page.locator('#conteos-responsable').fill('Otra persona');
 await page.locator('#conteos-ultimos').click();
 await page.waitForFunction(()=>downloads.at(-1).name.startsWith('ultimos-cortes-tiendas-'));
 const latest=await page.evaluate(()=>downloads.at(-1));
 assert.deepEqual(latest.names,['Resumen tiendas','Resultado del corte','Control de cortes','Diferencias','Detalle inventario']);
 assert.equal(latest.sheets['Resumen tiendas'].length,3);
 assert.equal(latest.sheets['Control de cortes'].find(r=>r['Código tienda']==='A')['ID corte'],id);
 assert.equal(latest.sheets['Resumen tiendas'].find(r=>r['Código tienda']==='A')['Deuda con B2B al corte'],900000);
 assert.equal(latest.sheets['Resumen tiendas'].find(r=>r['Código tienda']==='A')['Utilidad o pérdida del corte'],800000);
 assert.equal(latest.sheets['Resumen tiendas'].find(r=>r['Código tienda']==='A').Resultado,'Utilidad');
 assert.equal(latest.sheets['Resultado del corte'].find(r=>r['Código tienda']==='A')['Costo vendido'],1000000);
 assert.equal(latest.sheets['Resumen tiendas'].find(r=>r['Código tienda']==='B')['Estado del corte'],'Pendiente de Mayte / Óscar');
 assert.equal(latest.sheets['Resumen tiendas'].find(r=>r['Código tienda']==='B')['Ajuste físico neto al costo'],-100);
 assert.equal(latest.sheets['Resumen tiendas'].find(r=>r['Código tienda']==='B')['Utilidad o pérdida del corte'],800000);
 assert.equal(latest.sheets['Resumen tiendas'].find(r=>r['Código tienda']==='C')['Estado del corte'],'Sin corte');
 assert.equal(latest.sheets['Detalle inventario'].some(r=>r.Código==='OLD'),false);
 assert.equal(latest.sheets.Diferencias.length,2);
 const latestQuery=await page.evaluate(()=>calls.filter(c=>c.a==='informe').at(-1).d);
 assert.equal(latestQuery.desde,'2000-01-01');assert.equal(latestQuery.tienda,'');assert.equal(latestQuery.responsable,'');
 const tiendaPage=await browser.newPage();
 await tiendaPage.setContent('<html><body></body></html>');
 await tiendaPage.addScriptTag({content:readFileSync('creditek/erp/conteos-ui.js','utf8')});
 await tiendaPage.evaluate(async()=>{
   const sb={rpc:async(_,{p_accion:a})=>({data:a==='config'?{autoriza:false,central:false,tiendas:[{codigo:'A',nombre:'Tienda de prueba'}]}:a==='informe'?{cortes:[]}:a==='listar'?{registros:[]}:{filas:[]}})};
   await KoraConteosUI.init({sb,XLSX:{},tiendaActual:()=> 'A',refrescar:async()=>{}}).abrir();
 });
 assert.equal(await tiendaPage.locator('#conteos-ultimos').isVisible(),false);
 await tiendaPage.evaluate(()=>document.getElementById('conteos-ultimos').click());
 await tiendaPage.waitForFunction(()=>document.getElementById('conteos-mensaje').textContent.includes('Solo Gestión o Gerencia'));
 await tiendaPage.close();
 assert.deepEqual(errors,[]);console.log('Navegador: Excel como soporte, adjuntar fotos, errores visibles, archivo mixto, ceros IMEI, carga, 482, autorización, escritorio y móvil OK.');
} finally {await browser.close();}
