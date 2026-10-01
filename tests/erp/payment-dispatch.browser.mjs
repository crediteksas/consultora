import {chromium} from '@playwright/test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const source=readFileSync('creditek/erp/aliados-tesoreria-app.js','utf8');
const helpers=source.slice(source.indexOf('  function dispatchItem('),source.indexOf('  async function changeMovement'));
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://kora.test/**',route=>route.fulfill({contentType:'text/html',body:'<div id="paymentDispatchHistory"></div>'}));
 await page.goto('https://kora.test/creditek/erp/aliados-tesoreria.html');
 await page.addScriptTag({content:readFileSync('creditek/erp/tesoreria-pagos-unificados.js','utf8')});
 await page.addScriptTag({content:`
 window.crypto.randomUUID=()=> 'test-request';
 window.esc=x=>String(x??'');window.cop=x=>String(x);window.date=String;window.shortId=String;window.platformName=String;window.bogotaDateTime=String;
 window.profile={nombre:'Oscar'};window.paymentBusinessName=()=>'';window.missingPaymentData=()=>[];
 window.CreditekTesoreriaTercerizacion={paymentReadiness:()=>({ready:true})};window.financialAccessError=false;
 window.$=s=>document.querySelector(s);window.notice=()=>{};window.rpcCalls=0;
 window.data={dispatches:[],payments:[],movements:[],financialEntries:[{id:'expense',status:'aprobado',approved_by:'oscar',approved_at:'now',beneficiary:'Claudia',beneficiary_document:'12345678',destination_account:'Nequi · Ahorros · 3001234567',amount:550000,category:'nomina',concept:'QUINCENA CLAUDIA',due_date:'2026-09-30',business_unit:'aliados'}]};
 window.saved=null;window.load=async()=>{if(saved)data.dispatches=[saved];};
 window.sb={rpc:async(name,args)=>{rpcCalls++;if(name!=='payment_dispatch_create')throw Error('Unexpected RPC');
 saved={id:'order',request_id:args.p_request,consecutive:7,created_at:'2026-09-30T20:00:00Z',issued_by_name:'Oscar',payment_dispatch_items:args.p_rows.map((snapshot,index)=>({snapshot,report_ref:snapshot.report_ref,position:index+1}))};return {data:saved};}};
 ${helpers}
 `});
 await page.evaluate(()=>openPaymentSelection(authorizedReportRows()));
 await page.locator('[data-report-ref]').check();
 await page.evaluate(()=>{const b=document.querySelector('[data-generate-selected]');b.click();b.click();});
 await page.waitForSelector('#treasuryPaymentReportDialog');
 assert.equal(await page.evaluate(()=>rpcCalls),1);
 assert.equal(await page.evaluate(()=>authorizedReportRows().length),0);
 const frame=page.frameLocator('#treasuryPaymentReportDialog iframe');assert.match(await frame.locator('body').innerText(),/OP-000007/);assert.match(await frame.locator('body').innerText(),/QUINCENA CLAUDIA/);
 await page.locator('[data-close-report]').click();await page.evaluate(()=>renderDispatchHistory());
 await page.locator('[data-open-dispatch]').click();assert.match(await page.frameLocator('#treasuryPaymentReportDialog iframe').locator('body').innerText(),/OP-000007/);assert.equal(await page.evaluate(()=>rpcCalls),1);
 assert.deepEqual(errors,[]);console.log('PASS: emisión única, doble clic protegido, nómina incluida, consulta con mismo consecutivo sin RPC nuevo.');
}finally{await browser.close();}
