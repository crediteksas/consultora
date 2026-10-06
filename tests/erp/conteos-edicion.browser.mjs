// UI y Excel aislados: no sesiones, endpoints ni datos de producción.
import {chromium} from '@playwright/test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,channel:'chrome'});
try {
 for(const width of [1280,390]) {
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const style=readFileSync('creditek/erp/inventario.html','utf8').match(/<style>([\s\S]*?)<\/style>/)[1];
  await page.setContent(`<html><head><style>${style}</style></head><body></body></html>`);
  for(const path of ['node_modules/xlsx/dist/xlsx.full.min.js','creditek/erp/conteos-domain.js','creditek/erp/conteos-ui.js'])
   await page.addScriptTag({content:readFileSync(path,'utf8')});
  await page.evaluate(async()=>{
   window.calls=[];window.downloads=[];window.auditHistory=[];window.bajas=[];window.demoFailure=null;
   window.cut={id:'11111111-1111-4111-8111-111111111111',tienda_codigo:'A',tienda_nombre:'Tienda de prueba',
    corte_at:'2026-10-06T14:00:00Z',contado_at:'2026-10-06T14:00:00Z',recibido_at:'2026-10-06T15:00:00Z',
    contado_nombre:'Administradora',estado:'pendiente',base_conteo:'corte_fijo',conteo_version:0,
    archivo_nombre:'Conteo original.xlsx',archivo_sha256:'a'.repeat(64)};
   window.lines=[
    {codigo:'VID',nombre:'Vidrio',imei:'',tipo:'cantidad',cantidad_corte:100,cantidad_fisica:98,diferencia:-2,actual:97,costo_tienda:1000,nota:'Malos'},
    {codigo:'CEL',nombre:'Celular',imei:'000000000000001',tipo:'serializado',cantidad_corte:1,cantidad_fisica:1,diferencia:0,actual:1,costo_tienda:100000,nota:''},
    {codigo:'SIN',nombre:'Sin diferencia',imei:'',tipo:'cantidad',cantidad_corte:5,cantidad_fisica:5,diferencia:0,actual:5,costo_tienda:500,nota:''},
    {codigo:'SOB',nombre:'Sobrante',imei:'',tipo:'cantidad',cantidad_corte:1,cantidad_fisica:2,diferencia:1,actual:1,costo_tienda:300,nota:''}
   ];
   XLSX.writeFile=(book,name)=>downloads.push({name,names:book.SheetNames,
    sheets:Object.fromEntries(book.SheetNames.map(s=>[s,XLSX.utils.sheet_to_json(book.Sheets[s],{defval:''})]))});
   const sb={rpc:async(name,{p_accion:a,p_datos:d})=>{
    calls.push({name,a,d});
    if(a==='config')return {data:{autoriza:true,central:true,tiendas:[{codigo:'A',nombre:cut.tienda_nombre}]}};
    if(a==='informe')return {data:{cortes:[structuredClone(cut)]}};
    if(a==='listar')return {data:{registros:structuredClone(bajas)}};
    if(a==='tareas_fotos')return {data:{tareas:[]}};
    if(a==='resumen')return {data:{filas:[]}};
    if(name==='inventario_conteo_correcciones'){
     if(a==='guardar'){
      if(demoFailure)return {error:{message:demoFailure}};
      if(d.conteo_version!==cut.conteo_version)return {error:{message:'El conteo cambió. Vuelve a consultar'}};
      const changes=[];
      for(const f of d.filas){
       const l=lines.find(l=>l.codigo===f.codigo&&l.imei===(f.imei||''));
       changes.push({codigo:l.codigo,nombre:l.nombre,imei:l.imei,cantidad_corte:l.cantidad_corte,
        cantidad_anterior:l.cantidad_fisica,cantidad_nueva:f.cantidad,diferencia_anterior:l.diferencia,
        diferencia_nueva:f.cantidad-l.cantidad_corte,nota_anterior:l.nota,nota_nueva:f.nota});
       l.cantidad_fisica=f.cantidad;l.diferencia=f.cantidad-l.cantidad_corte;l.nota=f.nota;
      }
      cut.conteo_version++;
      auditHistory.push({version:cut.conteo_version,creado_at:'2026-10-06T16:00:00Z',creado_nombre:'Mayte',
       motivo:d.motivo,cambios:changes,archivo_nombre:cut.archivo_nombre,archivo_sha256:cut.archivo_sha256});
     }
     return {data:structuredClone({corte:cut,lineas:lines,correcciones:auditHistory,stock_modificado:false})};
    }
    if(name==='cierre_utilidad_retail')return {data:{listo:false,cerrado:false,inicio_at:cut.corte_at,fin_at:cut.corte_at,
     ventas_totales:0,costo_vendido:0,gastos_totales:0,perdidas_ajustes:2000,ganancias_ajustes:300,
     ajuste_conciliacion:0,utilidad_neta:-1700,bloqueos:['Pendiente de ajuste']}};
    if(name==='inventario_ajuste_documento')return a==='aplicar'?{error:{message:'Prueba aislada: no aplicar existencias'}}:
     {data:{documento:null,puede_cerrar_utilidad:true}};
    return {data:structuredClone({corte:cut,lineas:lines})};
   }};
   window.ui=KoraConteosUI.init({sb,XLSX,tiendaActual:()=> 'A',refrescar:async()=>{throw new Error('La edición no refresca existencias');}});
   await ui.abrir();
  });
  await page.locator('[data-conteo-id]').click();
  await page.waitForFunction(()=>document.getElementById('conteos-editar'));
  assert.equal(await page.locator('#conteos-lineas tr').count(),2);
  await page.locator('#conteos-diferencias-excel').click();
  await page.waitForFunction(()=>downloads.length===1);
  const initial=await page.evaluate(()=>downloads.at(-1));
  assert.equal(initial.sheets.Diferencias.length,2);
  assert.equal(initial.sheets.Diferencias[0]['Reconteo reportado al corte'],'');
  assert.equal(initial.sheets.Resumen[0]['Impacto neto al costo'],-1700);
  assert.equal(initial.sheets.Resumen[0].Marca,'Creditek · KORA');
  assert.equal(initial.sheets['Control de bajas'][0].Cantidad,2,'También controla faltantes sin solicitud de no conforme');
  await page.locator('#conteos-editar').click();
  assert.equal(await page.locator('#conteos-lineas tr').count(),4,'Incluye referencias sin diferencias para corregirlas');
  assert.equal(await page.locator('#conteos-form-decidir').isVisible(),false);
  assert.equal(await page.locator('#conteos-diferencias-excel').isDisabled(),true);
  await page.locator('[data-sumar="0"][data-delta="1"]').click();
  assert.equal(await page.locator('[data-cantidad="0"]').inputValue(),'99');
  assert.match(await page.locator('#conteos-lineas tr').first().innerText(),/-1/);
  await page.locator('[data-nota="0"]').fill('Reconteo confirmado');
  await page.locator('#conteos-buscar-linea').fill('CEL');
  await page.locator('[data-sumar="1"][data-delta="1"]').click();
  assert.equal(await page.locator('[data-cantidad="1"]').inputValue(),'1','IMEI no admite dos unidades');
  await page.locator('#conteos-buscar-linea').fill('VID');
  assert.equal(await page.locator('[data-cantidad="0"]').inputValue(),'99','El filtro conserva el borrador');
  await page.locator('[data-cantidad="0"]').fill('');
  await page.locator('#conteos-edicion-motivo').fill('Validación por reconteo');
  await page.locator('#conteos-edicion button[type=submit]').click();
  await page.waitForFunction(()=>document.getElementById('conteos-edicion-mensaje').textContent.includes('vacío'));
  assert.equal(await page.evaluate(()=>calls.filter(c=>c.a==='guardar').length),0);
  await page.locator('[data-cantidad="0"]').fill('99');
  await page.evaluate(()=>window.demoFailure='Error de prueba: el conteo cambió');
  await page.locator('#conteos-edicion button[type=submit]').click();
  await page.waitForFunction(()=>document.getElementById('conteos-edicion-mensaje').textContent.includes('Error de prueba'));
  assert.equal(await page.locator('[data-cantidad="0"]').inputValue(),'99');
  assert.equal(await page.locator('#conteos-edicion-motivo').inputValue(),'Validación por reconteo');
  await page.evaluate(()=>window.demoFailure=null);
  await page.locator('#conteos-edicion button[type=submit]').click();
  await page.waitForFunction(()=>document.getElementById('conteos-detalle').textContent.includes('Versión del conteo: 1'));
  assert.equal(await page.evaluate(()=>cut.estado),'pendiente');
  assert.equal(await page.evaluate(()=>lines[0].actual),97);
  assert.equal(await page.locator('#conteos-edicion').isVisible(),false);
  assert.equal(await page.locator('#conteos-tienda').isDisabled(),false);
  assert.equal(await page.locator('#conteos-form-decidir').isVisible(),true);
  assert.equal(await page.evaluate(()=>calls.some(c=>['aplicar','cerrar','aplicar_conteo','solicitar'].includes(c.a))),false);
  await page.evaluate(()=>window.bajas=[{id:'baja-1',corte_id:cut.id,tienda_codigo:'A',codigo:'VID',
   producto_nombre:'Vidrio',imei:'',cantidad:1,categoria_gasto:'imperfecto',estado:'solicitado',
   motivo:'Vidrio roto',soporte:'Conteo original.xlsx',foto_path:null,costo_tienda:null}]);
  await page.locator('#conteos-buscar-linea').fill('SOB');
  await page.locator('#conteos-diferencias-excel').click();
  await page.waitForFunction(()=>downloads.length===2);
  const report=await page.evaluate(()=>downloads.at(-1));
  assert.deepEqual(report.names,['Resumen','Diferencias','Control de bajas','Correcciones']);
  assert.equal(report.sheets.Diferencias.length,2,'El informe incluye todas las diferencias, no solo la búsqueda visible');
  assert.equal(report.sheets.Resumen[0]['Impacto neto al costo'],-700);
  assert.equal(report.sheets.Resumen[0]['Versión del conteo'],1);
  assert.equal(report.sheets.Diferencias[0]['Reportado al corte'],99);
  assert.equal(report.sheets.Correcciones[0]['Cantidad anterior'],98);
  assert.equal(report.sheets['Control de bajas'][0]['ID solicitud'],'baja-1');
  assert.equal(report.sheets['Control de bajas'][0]['Valor baja al costo'],1000);
  assert.match(report.name,/-v1.xlsx$/);
  await page.locator('#conteos-editar').click();
  await page.locator('[data-cantidad="0"]').fill('100');
  await page.locator('#conteos-edicion-cancelar').click();
  assert.equal(await page.evaluate(()=>cut.conteo_version),1);
  assert.equal(await page.locator('#conteos-form-decidir').isVisible(),true);
  await page.locator('[data-decision-codigo="VID"]').selectOption('no_conforme');
  await page.locator('#conteos-buscar-linea').fill('SOB');
  await page.locator('[data-decision-codigo="SOB"]').selectOption('sobrante');
  await page.locator('#conteos-buscar-linea').fill('VID');
  assert.equal(await page.locator('[data-decision-codigo="VID"]').inputValue(),'no_conforme','La búsqueda conserva las clasificaciones');
  await page.locator('#conteos-diferencias-excel').click();
  await page.waitForFunction(()=>downloads.length===3);
  assert.equal(await page.locator('[data-decision-codigo="VID"]').inputValue(),'no_conforme','La descarga no pierde la revisión de esta versión');
  await page.locator('#conteos-motivo').fill('Revisión de diferencias de prueba');
  await page.locator('#conteos-clasificacion').selectOption('mixto');
  await page.locator('#conteos-buscar-linea').fill('SOB');
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#conteos-form-decidir button[type=submit]').click();
  await page.waitForFunction(()=>document.getElementById('conteos-decision-mensaje').textContent.includes('Prueba aislada'));
  const revision=await page.evaluate(()=>calls.find(c=>c.name==='inventario_ajuste_documento'&&c.a==='aplicar'));
  assert.deepEqual(revision.d.decisiones.map(d=>d.clasificacion),['no_conforme','sobrante'],'La revisión incluye también las referencias ocultas por la búsqueda');
  assert.equal(revision.d.conteo_version,1);
  assert.equal(await page.evaluate(()=>lines[0].actual),97,'La prueba no aplica stock');
  await page.screenshot({path:`/tmp/kora-conteos-edicion-${width}.png`});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.evaluate(()=>cut.estado='aplicado');
  await page.locator('[data-conteo-id]').click();
  await page.waitForFunction(()=>!document.getElementById('conteos-editar'));
  assert.equal(await page.locator('#conteos-diferencias-excel').count(),1);
  assert.deepEqual(errors,[]);
  await page.close();
 }
 console.log('Edición y diferencias: escritorio/móvil, sumas, filtros, cancelación, errores, historial, Excel y control de bajas OK.');
} finally {await browser.close();}
