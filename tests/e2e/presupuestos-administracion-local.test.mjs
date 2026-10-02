import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from '@playwright/test';

const erp = 'creditek/erp/';
const baseCSS = fs.readFileSync(erp+'presupuestos.html','utf8').match(/<style>([\s\S]*?)<\/style>/)[1];
const sharedCSS = fs.readFileSync(erp+'presupuestos-negocios.css','utf8');

async function fixture(browser, {role='gerencia',width=1100,error=null}={}) {
  const page=await browser.newPage({viewport:{width,height:1000}});
  const html=`<html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${baseCSS}${sharedCSS}</style><body><main class="page"><nav data-presupuestos-negocios></nav><section id="budget"></section></main></body></html>`;
  await page.route('**/*',route=>route.request().resourceType()==='document'
    ?route.fulfill({contentType:'text/html',body:html}):route.abort());
  await page.goto('http://kora-local.test/creditek/erp/presupuestos.html?negocio=b2b');
  await page.addScriptTag({path:erp+'presupuestos-negocios.js'});
  await page.addScriptTag({path:erp+'presupuestos-b2b.js'});
  page.on('dialog',dialog=>dialog.accept());
  await page.evaluate(async ({role,error})=>{
    const perfil={id:'local-fixture',activo:true,rol:role};
    window.saved=[];window.goals={};window.readError=error;window.writeError=null;window.delays={};
    const sb={
      from(table){
        if(table!=='b2b_presupuestos')throw Error('No se permite acceder a otros negocios');
        let month;
        return {select(){return this;},eq(key,value){month=value;return this;},async maybeSingle(){
          await new Promise(resolve=>setTimeout(resolve,window.delays[month]||0));
          return {data:window.goals[month]||null,error:window.readError?{message:window.readError}:null};
        }};
      },
      async rpc(name,p){
        if(name!=='guardar_presupuesto_b2b')throw Error('No se permite otra escritura');
        window.saved.push({name,...p});
        if(window.writeError)return {data:null,error:{message:window.writeError}};
        const data={mes:p.p_mes,meta_ventas:p.p_meta_ventas,meta_utilidad_neta:p.p_meta_utilidad_neta,
          meta_unidades:p.p_meta_unidades,notas:p.p_notas,revision:p.p_revision+1};
        window.goals[data.mes]=data;return {data,error:null};
      }
    };
    window.KoraPresupuestosNav.montar(document.querySelector('nav'),perfil);
    await window.KoraPresupuestoB2B.montar(document.querySelector('#budget'),{sb,perfil});
  },{role,error});
  return page;
}

test('presupuestos: navegación unificada, metas B2B separadas y sin movimientos al consultar',async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const page=await fixture(browser);
    assert.deepEqual(await page.locator('nav a').allTextContents(),['Retail','B2B','Aliados']);
    assert.equal(await page.locator('nav [aria-current="page"]').innerText(),'B2B');
    assert.equal(await page.getByRole('link',{name:'B2B',exact:true}).getAttribute('href'),'presupuestos.html?negocio=b2b');
    assert.equal(await page.getByRole('link',{name:'Aliados',exact:true}).getAttribute('href'),'aliados-presupuesto.html');
    assert.deepEqual(await page.evaluate(()=>window.saved),[]);
    assert.equal(await page.locator('#b2bVentas').inputValue(),'');
    assert.match(await page.locator('#b2bEstado').innerText(),/No hay presupuesto/);
    const month=await page.locator('#b2bMes').inputValue();
    await page.locator('#b2bVentas').fill('85000000');
    await page.locator('#b2bUtilidad').fill('12000000');
    await page.locator('#b2bNotas').fill('Meta mensual de prueba local');
    await page.getByRole('button',{name:'Guardar presupuesto B2B'}).click();
    await page.waitForFunction(()=>document.querySelector('#b2bEstado').textContent.includes('guardado para'));
    const calls=await page.evaluate(()=>window.saved);
    assert.deepEqual(calls,[{name:'guardar_presupuesto_b2b',p_mes:month+'-01',p_meta_ventas:85000000,
      p_meta_utilidad_neta:12000000,p_meta_unidades:null,p_notas:'Meta mensual de prueba local',p_revision:0}]);
    assert.match(await page.locator('#b2bResumen').innerText(),/85\.000\.000/);
    await page.locator('#b2bMes').fill('2027-01');
    await page.locator('#b2bMes').dispatchEvent('change');
    await page.waitForFunction(()=>document.querySelector('#b2bEstado').textContent.includes('No hay presupuesto B2B programado para 2027-01'));
    assert.equal(await page.locator('#b2bVentas').inputValue(),'');
    assert.equal(await page.evaluate(()=>window.saved.length),1);
    await page.locator('#b2bMes').fill(month);
    await page.locator('#b2bMes').dispatchEvent('change');
    await page.waitForFunction(()=>document.querySelector('#b2bVentas').value==='85000000');
    for(const width of [1100,390]){
      await page.setViewportSize({width,height:width<500?1600:1000});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`sin desbordar a ${width}px`);
      for(const tab of ['Retail','B2B','Aliados'])assert.ok(await page.getByRole('link',{name:tab,exact:true}).isVisible());
      await page.screenshot({path:`/tmp/kora-presupuestos-admin-${width}.png`});
    }
    await page.close();
  } finally {await browser.close();}
});

test('presupuestos: Auditoría solo consulta; errores y conflictos nunca se muestran como metas cero',async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const auditor=await fixture(browser,{role:'auditoria'});
    assert.ok(await auditor.locator('#b2bVentas').isDisabled());
    assert.ok(await auditor.locator('#b2bGuardar').isHidden());
    assert.deepEqual(await auditor.evaluate(()=>window.saved),[]);
    const page=await fixture(browser,{error:'Sin conexión'});
    assert.match(await page.locator('#b2bEstado').innerText(),/No se pudo consultar/);
    assert.ok(await page.locator('#b2bVentas').isDisabled());
    assert.equal(await page.locator('#b2bVentas').inputValue(),'');
    await page.evaluate(()=>{window.readError=null;});
    await page.locator('#b2bActualizar').click();
    await page.waitForFunction(()=>!document.querySelector('#b2bCampos').disabled);
    await page.locator('#b2bVentas').fill('80000000');await page.locator('#b2bUtilidad').fill('9000000');
    await page.evaluate(()=>{window.writeError='El presupuesto cambió desde que lo consultaste. Actualiza antes de guardar';});
    await page.locator('#b2bGuardar').click();
    await page.waitForFunction(()=>document.querySelector('#b2bEstado').textContent.includes('No se confirmó el guardado'));
    assert.equal(await page.locator('#b2bVentas').inputValue(),'80000000');
    assert.equal(await page.locator('#b2bResumen').innerText(),'');
    // Una respuesta lenta del mes anterior no reemplaza el mes seleccionado.
    await page.evaluate(()=>{
      window.delays['2027-02-01']=250;
      window.goals['2027-02-01']={mes:'2027-02-01',meta_ventas:123,meta_utilidad_neta:40,meta_unidades:null,revision:1};
    });
    await page.locator('#b2bMes').fill('2027-02');await page.locator('#b2bMes').dispatchEvent('change');
    await page.locator('#b2bMes').fill('2027-03');await page.locator('#b2bMes').dispatchEvent('change');
    await page.waitForFunction(()=>document.querySelector('#b2bEstado').textContent.includes('2027-03'));
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#b2bMes').inputValue(),'2027-03');
    assert.equal(await page.locator('#b2bVentas').inputValue(),'');
    await page.close();await auditor.close();
  } finally {await browser.close();}
});

test('presupuestos: la página real inicia Retail y B2B sin mezclar consultas ni controles',async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const source=fs.readFileSync(erp+'presupuestos.html','utf8');
  const inline=[...source.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
  const html=source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
  try {for(const business of ['retail','b2b']){
    const page=await browser.newPage();const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>route.request().resourceType()==='document'
      ?route.fulfill({contentType:'text/html',body:html}):route.abort());
    await page.goto('http://kora-local.test/creditek/erp/presupuestos.html?negocio='+business);
    await page.evaluate(()=>{
      window.reads=[];window.__KORA_ENV__={};
      window.CreditekTiendasCanonicas={cargar:async()=>[]};
      window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{user:{id:'test'}}}})},
        from(table){
          window.reads.push(table);
          return {select(){return this;},eq(){return this;},gte(){return this;},
            lt:async()=>({data:[],error:null}),maybeSingle:async()=>({error:null,
              data:table==='perfiles'?{id:'test',nombre:'Gerencia de prueba',rol:'gerencia',activo:true}:null})};
        },rpc(){throw Error('No debe escribir al abrir');}})};
    });
    await page.addScriptTag({path:erp+'presupuestos-negocios.js'});
    await page.addScriptTag({path:erp+'presupuestos-b2b.js'});
    await page.addScriptTag({content:inline});
    const b2b=business==='b2b';
    await page.getByRole('heading',{name:b2b?'Presupuesto de B2B':'Presupuesto de Retail',exact:true}).waitFor();
    await page.waitForFunction(()=>window.reads.length>=2);
    assert.deepEqual(errors,[]);
    assert.deepEqual(await page.evaluate(()=>window.reads),['perfiles',b2b?'b2b_presupuestos':'presupuestos']);
    assert.equal(await page.locator('nav [aria-current="page"]').innerText(),b2b?'B2B':'Retail');
    assert.equal(await page.locator('#genMes').count(),b2b?0:1);
    assert.equal(await page.locator('#b2bMes').count(),b2b?1:0);
    await page.close();
  }} finally {await browser.close();}
});
