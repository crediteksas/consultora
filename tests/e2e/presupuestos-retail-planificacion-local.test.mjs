import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium,webkit} from '@playwright/test';
import XLSX from 'xlsx';
import {createRequire} from 'node:module';

const qa=process.env.KORA_PLAN_QA_DIR,excelPath=process.env.KORA_REPORT_EXCELJS_PATH;
async function setup(browser,role='gerencia'){
 const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.href.includes('exceljs@4.4.0'))return excelPath?route.fulfill({contentType:'text/javascript',body:await readFile(excelPath)}):route.abort();
  if(u.hostname!=='cierre-kora.test')return route.abort();
  if(/sidebar\.js|kora-access-control\.js|kora-environment|supabase-js/.test(u.pathname))return route.fulfill({contentType:'text/javascript',body:''});
  const file=resolve(process.cwd(),'.'+u.pathname);
  if(!file.startsWith(process.cwd()+'/'))return route.abort();
  try{return route.fulfill({contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[extname(file)]||'application/octet-stream',body:await readFile(file)});}catch{return route.fulfill({status:404,body:''});}
 });
 await page.addInitScript(({role})=>{
  const stores=[{codigo:'CK-01',nombre:'Punto Norte',tipo:'propia',activo:true},{codigo:'CK-02',nombre:'Punto Sur',tipo:'propia',activo:true}];
  const saved=stores.flatMap(t=>Array.from({length:31},(_,i)=>({id:t.codigo+i,tienda_codigo:t.codigo,fecha:'2026-10-'+String(i+1).padStart(2,'0'),meta_venta_total:'1000.25',meta_creditos:1,meta_uds_cel:2,meta_uds_acc:3})));
  const sales=[{id:'sale1',fecha:'2026-10-05',tienda_codigo:'CK-01',tipo:'contado',total:'1200.75',anulada:false},{id:'sale2',fecha:'2026-10-06',tienda_codigo:'CK-02',tipo:'contado',total:'8888.25',anulada:false}];
  const data={origenes:stores,presupuestos:saved,ventas:sales,venta_items_lectura:[{id:'item1',venta_id:'sale1',producto_id:'phone',cantidad:1},{id:'item2',venta_id:'sale1',producto_id:'case',cantidad:3},{id:'item3',venta_id:'sale2',producto_id:'phone',cantidad:9}],productos:[{id:'phone',tipo:'serializado'},{id:'case',tipo:'cantidad'}],liquidation_operations:[{id:'credit1',plataforma:'payjoy',external_id:'credit1',operation_at:'2026-10-08T15:00:00Z',origen_codigo:'CK-01',tipo_establecimiento:'propia',reconocida:true,utilidad_creditek:0}],aliados_reversiones:[],historico_mensual:[{id:'h1',tienda_codigo:'CK-01',anio:2025,mes:10,venta_total:960.60,cred_uds:2,cel_uds:1,acc_uds:2,cel_venta:100,acc_venta:50},{id:'h2',tienda_codigo:'CK-02',anio:2025,mes:10,venta_total:4444,cred_uds:1,cel_uds:3,acc_uds:0,cel_venta:200,acc_venta:30}]};
  window.__fixture={data,failTable:null,calls:[],writes:[],rpcCalls:[],failMetric:null,pause:false,release:[],allowSave:false};
  window.__KORA_ENV__={KORA_ERP_SUPABASE_URL:'https://fixture.invalid',KORA_ERP_SUPABASE_ANON_KEY:'synthetic-not-a-key'};
  window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{user:{id:'fixture-user'}}}})},from(table){
   const predicates=[];let key='id',start=0,end=Infinity;
   const result=()=>table===window.__fixture.failTable?{error:{message:'Fallo ficticio de la fuente'},data:null}:{data:(data[table]||[]).filter(r=>predicates.every(p=>p(r))).sort((a,b)=>String(a[key]).localeCompare(String(b[key]))).slice(start,end+1),error:null};
   const q={select(columns){window.__fixture.calls.push({table,columns});return this;},eq(c,v){predicates.push(r=>r[c]===v);return this;},gte(c,v){predicates.push(r=>r[c]>=v);return this;},lt(c,v){predicates.push(r=>r[c]<v);return this;},in(c,v){predicates.push(r=>v.includes(r[c]));return this;},order(k){key=k;return this;},range(a,b){start=a;end=b;return this;},maybeSingle:async()=>({data:{id:'fixture-user',nombre:'Revisor de prueba',rol:role,activo:true},error:null}),then(ok,no){return Promise.resolve(result()).then(ok,no);}};return q;
  },async rpc(name,params){
    window.__fixture.rpcCalls.push({name,params});
    if(name!=='proponer_presupuesto_operativo'){window.__fixture.writes.push({name,params});if(name==='guardar_presupuesto_operativo_general'&&window.__fixture.allowSave)return {data:null,error:null};throw Error('Escritura denegada en el ensayo.');}
    if(window.__fixture.pause)await new Promise(resolve=>window.__fixture.release.push(resolve));
    if(window.__fixture.failMetric===params.p_metrica)return {data:null,error:{message:'Histórico de prueba no disponible'}};
    const mes=params.p_mes.slice(0,7),[y,m]=mes.split('-').map(Number),days=new Date(Date.UTC(y,m,0)).getUTCDate();
    const bases=params.p_tienda==='CK-01'?{meta_venta_total:101,meta_creditos:8,meta_uds_cel:3,meta_uds_acc:75}:{meta_venta_total:202,meta_creditos:4,meta_uds_cel:7,meta_uds_acc:0};
    const base=bases[params.p_metrica],total=Math.round(base*(1+params.p_pct_crecimiento/100));
    return {error:null,data:Array.from({length:days},(_,i)=>({fecha:mes+'-'+String(i+1).padStart(2,'0'),base_anterior:String(Math.round(base*(i+1)/days)-Math.round(base*i/days)),meta_propuesta:String(Math.round(total*(i+1)/days)-Math.round(total*i/days)),fuente:params.p_metrica==='meta_uds_acc'&&params.p_tienda==='CK-01'?'estimación por valor de accesorios y precio promedio propio de 2025':'histórico mensual uniforme por tienda_codigo'}))};
   }})};
 },{role});
 await page.goto('https://cierre-kora.test/creditek/erp/presupuestos.html');
 return {page,errors};
}
for(const [name,engine]of [['chromium',chromium],['webkit',webkit]])test('Planificación: histórico y propuesta por tienda, invalidación y solo lectura · '+name,async()=>{
 const browser=await engine.launch(name==='chromium'?{channel:'chrome',headless:true}:{headless:true});
 try{
  const {page,errors}=await setup(browser);
  await page.getByRole('heading',{name:'Presupuesto de Retail',exact:true}).waitFor();
  await page.locator('#genTienda').selectOption('__todas__');await page.locator('#genMes').fill('2026-10');await page.locator('#genMes').dispatchEvent('change');
  await page.locator('.pct-metrica[data-metrica="meta_venta_total"]').fill('50');
  await page.getByRole('button',{name:'Calcular propuesta',exact:true}).click();
  const status=page.locator('[data-plan-status]'),first=page.locator('[data-plan-tienda="CK-01"]');
  await page.getByText('Comparativo preparado para 2 tienda(s). Propuestas sin guardar.',{exact:true}).waitFor();
  assert.equal(await page.locator('[data-plan-tienda]').count(),2);assert.equal(await first.locator('table').count(),1);assert.equal(await first.locator('tbody tr').count(),4);assert.equal(await first.locator('thead th').count(),6);
  const sales=first.locator('[data-plan-metrica="meta_venta_total"]');
  assert.match(await sales.innerText(),/101/);assert.match(await sales.innerText(),/50%/);assert.equal((await sales.locator('td.plan-propuesta').innerText()).replace(/[^0-9]/g,''),'152');
  assert.match(await first.innerText(),/2025-10|2025/);assert.match(await first.innerText(),/2026-10/);assert.match(await first.innerText(),/Base estimada/);assert.doesNotMatch(await first.innerText(),/Punto Sur/);
  assert.match(await page.locator('[data-plan-tienda="CK-02"]').innerText(),/Base cero: revisa el histórico/);
  assert.equal(await page.locator('.pct-metrica').count(),4,'Se conservan los cuatro campos originales.');
  const adjustment=first.getByRole('spinbutton',{name:'Crecimiento de Ventas para Punto Norte (%)'});
  await adjustment.fill('25');await page.waitForFunction(()=>document.querySelector('[data-plan-tienda="CK-01"] [data-plan-metrica="meta_venta_total"] .plan-propuesta').textContent.includes('126'));
  assert.equal((await page.locator('[data-plan-tienda="CK-02"] [data-plan-metrica="meta_venta_total"] .plan-propuesta').innerText()).replace(/[^0-9]/g,''),'303');
  assert.equal(await page.locator('#btnAprobarTodo').isDisabled(),true);assert.deepEqual(await page.evaluate(()=>window.__fixture.writes),[]);
  await adjustment.fill('1001');assert.equal(await first.getByRole('button',{name:'Aprobar presupuesto · Punto Norte'}).isDisabled(),true);
  await adjustment.fill('25');await page.waitForFunction(()=>!document.querySelector('[data-plan-tienda="CK-01"] button').disabled);
  await page.evaluate(()=>window.__fixture.allowSave=true);await first.getByRole('button',{name:'Aprobar presupuesto · Punto Norte'}).click();
  await first.getByText('Presupuesto aprobado y guardado para Punto Norte.').waitFor();
  const writes=await page.evaluate(()=>window.__fixture.writes);assert.equal(writes.length,1);assert.equal(writes[0].params.p_tienda,'CK-01');assert.equal(writes[0].params.p_pct_ventas,25);
  await page.evaluate(()=>{window.__fixture.writes=[];window.__fixture.rpcCalls=[];window.__fixture.allowSave=false;});
  if(qa&&name==='chromium'){await mkdir(qa,{recursive:true});await first.screenshot({path:resolve(qa,'planificacion-cuadro-ficticio.png')});}
  await page.locator('.pct-metrica[data-metrica="meta_venta_total"]').fill('100');assert.equal(await page.locator('[data-plan-tienda]').count(),0);assert.match(await status.innerText(),/actualizar/);
  await page.getByRole('button',{name:'Calcular propuesta',exact:true}).click();await first.waitFor();assert.equal((await sales.locator('td.plan-propuesta').innerText()).replace(/[^0-9]/g,''),'202');
  await page.evaluate(()=>window.__fixture.failMetric='meta_uds_acc');await page.getByRole('button',{name:'Calcular propuesta',exact:true}).click();await page.getByText('Comparativo preparado con 2 indicador(es) pendientes. Revisa los avisos antes de aprobar.',{exact:true}).waitFor();
  assert.match(await first.locator('[data-plan-metrica="meta_uds_acc"]').innerText(),/Pendiente.*Histórico de prueba no disponible/s);assert.match(await sales.innerText(),/202/);
  await page.locator('.pct-metrica[data-metrica="meta_uds_acc"]').fill('1001');await page.getByRole('button',{name:'Calcular propuesta',exact:true}).click();await page.getByText('Todos los porcentajes deben estar entre 0% y 1000%.',{exact:true}).waitFor();assert.equal(await page.locator('[data-plan-tienda]').count(),0);
  await page.locator('.pct-metrica[data-metrica="meta_uds_acc"]').fill('0');await page.evaluate(()=>{window.__fixture.pause=true;window.__fixture.failMetric=null;});
  await page.getByRole('button',{name:'Calcular propuesta',exact:true}).click();await page.getByText('Consultando la base anterior y las cuatro propuestas, sin guardar…',{exact:true}).waitFor();
  await page.locator('#genTienda').selectOption('CK-02');await page.locator('#genMes').fill('2026-11');await page.locator('#genMes').dispatchEvent('change');
  await page.evaluate(()=>{window.__fixture.pause=false;window.__fixture.release.splice(0).forEach(resolve=>resolve());});
  await page.waitForFunction(()=>!document.querySelector('#btnGenerar').disabled);assert.equal(await page.locator('[data-plan-tienda]').count(),0,'Una respuesta tardía no revive la tienda ni el mes anteriores.');
  await page.getByRole('button',{name:'Calcular propuesta',exact:true}).click();await page.getByText('Comparativo preparado para 1 tienda(s). Propuestas sin guardar.',{exact:true}).waitFor();assert.equal(await page.locator('[data-plan-tienda]').count(),1);assert.match(await page.locator('[data-plan-tienda]').innerText(),/2025-11/);assert.doesNotMatch(await page.locator('[data-plan-tienda]').innerText(),/Punto Norte/);
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=392),'Solo el cuadro desplaza horizontalmente en móvil.');
  assert.deepEqual(await page.evaluate(()=>window.__fixture.writes),[]);assert.ok((await page.evaluate(()=>window.__fixture.rpcCalls)).every(c=>c.name==='proponer_presupuesto_operativo'));assert.deepEqual(errors,[]);
  const denied=await setup(browser,'admin_tienda');await denied.page.getByRole('heading',{name:'Solo gerencia o auditoría'}).waitFor();assert.equal(await denied.page.locator('#comparativoPlanificacion').count(),0);assert.equal((await denied.page.evaluate(()=>window.__fixture.rpcCalls)).length,0);await denied.page.close();
  const auditor=await setup(browser,'auditoria');await auditor.page.getByRole('heading',{name:'Presupuesto de Retail',exact:true}).waitFor();await auditor.page.locator('#genTienda').selectOption('CK-01');await auditor.page.locator('#genMes').fill('2026-10');await auditor.page.getByRole('button',{name:'Calcular propuesta',exact:true}).click();await auditor.page.locator('[data-plan-tienda="CK-01"]').waitFor();assert.deepEqual(await auditor.page.evaluate(()=>window.__fixture.writes),[]);await auditor.page.close();
 }finally{await browser.close();}
});
