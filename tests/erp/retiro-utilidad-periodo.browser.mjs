// Isolated UI fixture: no production account, payment, or database writes.
import {chromium} from '@playwright/test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.clock.setFixedTime(new Date('2026-10-03T20:00:00Z'));
  const html=readFileSync('creditek/erp/finanzas-programadas.html','utf8');
  await page.setContent(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''));
  await page.evaluate(()=>{
    if(!crypto.randomUUID)crypto.randomUUID=()=> 'test-withdrawal';
    window.calls=[];
    window.CreditekTableroUtilidad={load:async()=>({total:3000000,missing:0})};
    window.CreditekTableroEjecutivos={allRows:async()=>[{entry_type:'retiro_utilidad',business_unit:'aliados',status:'aprobado',amount:2225734,due_date:'2026-10-03'}]};
    window.creditekSidebar={perfil:{id:'6de0ad26-64af-4966-8cd9-d468880af627'},sb:{
      from:table=>{
        const pending={id:'00000000-0000-4000-8000-000000000001',entry_type:'gasto',business_unit:'aliados',scope:'business_general',status:'pendiente_aprobacion',amount:2225734,due_date:'2026-10-03',beneficiary:'SOCIO DE PRUEBA',concept:'Prueba de formato'};
        const query={select:()=>query,eq:()=>query,lt:()=>query,order:()=>query,limit:()=>Promise.resolve({data:table==='utilidades_cierres_negocio'?[{periodo:'2026-09-01',negocio:'aliados',disponible:'0.00'}]:[]}),then:resolve=>Promise.resolve({data:table==='financial_entries'?[pending]:[]}).then(resolve)};
        return query;
      },
      rpc:async(name,args)=>{calls.push({name,args});return {data:true};},
    }};
  });
  for(const file of ['finanzas-programadas-domain.js','payment-destination.js','finanzas-programadas-app.js'])
    await page.addScriptTag({content:readFileSync(`creditek/erp/${file}`,'utf8')});
  await page.locator('[data-action="decision"]').click();
  assert.equal((await page.locator('#f_amount').inputValue()).replace(/\s/g,''),'$2.225.734');
  await page.locator('#f_amount').fill('2.225.734');
  await page.locator('#save').click();
  await page.waitForFunction(()=>calls.some(call=>call.name==='finanzas_decidir_movimiento'));
  const decision=await page.evaluate(()=>calls.find(call=>call.name==='finanzas_decidir_movimiento').args);
  assert.equal(decision.p_amount,2225734);
  await page.locator('#newWithdrawal').click();
  await page.locator('#f_business').selectOption('aliados');
  await page.waitForFunction(()=>document.querySelector('#withdrawalQuote')?.textContent.includes('774.266'));
  assert.equal(await page.locator('#f_period_from').count(),0);
  assert.equal(await page.locator('#f_period_to').count(),0);
  for(const [key,value] of Object.entries({beneficiary:'SOCIO DE PRUEBA',document:'12345678',account:'1234567890',amount:'774266'}))await page.locator(`#f_${key}`).fill(value);
  await page.locator('#f_bank').selectOption('Bancolombia');
  await page.locator('#f_account_type').selectOption('Ahorros');
  await page.locator('#save').click();
  await page.waitForFunction(()=>calls.some(call=>call.name==='finanzas_registrar_movimiento'));
  const args=await page.evaluate(()=>calls.find(call=>call.name==='finanzas_registrar_movimiento').args);
  assert.equal(args.p_source_period_from,'2026-10-01');
  assert.equal(args.p_source_period_to,'2026-10-03');
  assert.equal(args.p_amount,774266);
  assert.deepEqual(errors,[]);
  console.log('PASS: importes con pesos; retiro usa último cierre, reserva aprobados y no pide fechas.');
}finally{await browser.close();}
