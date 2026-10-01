// Isolated fixture. No production sessions, requests, accounts or payments.
import {chromium} from '@playwright/test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1200,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const html=readFileSync('creditek/erp/finanzas-programadas.html','utf8');
 const styles=html.match(/<style>([\s\S]*?)<\/style>/)[1];
 await page.setContent(`<style>${styles}</style><form><div id="picker"></div><button>Guardar</button></form>`);
 await page.evaluate(()=>{if(!crypto.randomUUID)crypto.randomUUID=()=> 'test-picker';});
 for(const f of ['payment-destination.js','financial-beneficiary-picker.js'])await page.addScriptTag({content:readFileSync('creditek/erp/'+f,'utf8')});
 await page.evaluate(async()=>{
  window.calls=[];window.people=[{key:'saved:account',beneficiaryId:'saved',accountId:'account',name:'Persona existente',document:'12345678',bank:'Bancolombia',accountType:'Ahorros',number:'0012345678',verified:true},
   {key:'legacy',templateId:'template',name:'Persona antigua',document:'23456789',destination:'3001234567',verified:true}];
  window.sb={rpc:async(name,args)=>{calls.push({name,args});return name.endsWith('list')?{data:people}:{data:{key:'saved:new',beneficiaryId:args.p_beneficiary_id||'new',accountId:args.p_account_id||'newaccount',name:args.p_name,document:args.p_document,bank:args.p_bank,accountType:args.p_account_type,number:args.p_number,verified:true}};}};
  window.picker=await KoraFinancialBeneficiary.mount(document.getElementById('picker'),sb);
 });
 const select=page.locator('#picker > select');
 // Identification search reuses an existing person without requesting fields.
 await page.locator('[data-person-search]').fill('12.345.678');
 await page.locator('[data-person-search]').press('Tab');
 assert.equal(await select.inputValue(),'0');assert.equal(await page.locator('[data-person]').count(),0);
 assert.equal((await page.evaluate(()=>picker.resolve())).beneficiaryId,'saved');
 await page.locator('[data-person-search]').fill('');await page.locator('[data-person-search]').press('Tab');
 await select.selectOption('new');await page.locator('[data-person="document"]').fill('12345678');
 await page.locator('[data-person="document"]').press('Tab');
 assert.equal(await select.inputValue(),'0');assert.equal(await page.locator('[data-person]').count(),0);

 await select.selectOption('0');assert.equal(await page.locator('[data-person]').count(),0);
 const existing=await page.evaluate(()=>picker.resolve());assert.equal(existing.number,'0012345678');
 await select.selectOption('1');assert.equal(await page.locator('[data-person="document"]').inputValue(),'23456789');
 assert.equal(await page.locator('[data-person="number"]').inputValue(),'3001234567');
 await page.locator('[data-person="bank"]').fill('Nequi');await page.locator('[data-person="accountType"]').selectOption('Billetera digital');
 await page.evaluate(()=>picker.resolve());assert.equal(await page.locator('[data-person]').count(),0);
 await select.selectOption('new');
 for(const [key,value] of Object.entries({name:'Persona nueva',document:'34567890',bank:'Bancolombia',number:'0098765432'}))await page.locator(`[data-person="${key}"]`).fill(value);
 await page.locator('[data-person="accountType"]').selectOption('Ahorros');
 assert.equal(await page.locator('form').evaluate(f=>f.checkValidity()),true);
 await page.evaluate(()=>picker.resolve());assert.equal(await page.locator('[data-person]').count(),0);
 await page.evaluate(()=>picker.resolve());
 const last=await page.evaluate(()=>calls.at(-1));assert.equal(last.args.p_beneficiary_id,'new');
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 // The complete expense form must hide and disable all old recipient inputs.
 await page.setContent(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''));
 await page.evaluate(()=>{
  window.calls=[];window.people=[{key:'saved:account',beneficiaryId:'saved',accountId:'account',name:'Persona existente',document:'12345678',bank:'Bancolombia',accountType:'Ahorros',number:'0012345678',verified:true}];
  window.creditekSidebar={perfil:{id:'test'},sb:{
   from:()=>{const query={select:()=>query,eq:()=>query,order:()=>query,then:r=>Promise.resolve({data:[]}).then(r)};return query;},
   rpc:async(name,args)=>{calls.push({name,args});if(name==='financial_beneficiaries_list')return {data:people};
    if(name==='financial_beneficiary_save')return {data:people[0]};return {data:true};}
  }};
 });
 for(const f of ['finanzas-programadas-domain.js','payment-destination.js','financial-beneficiary-picker.js','finanzas-programadas-app.js'])await page.addScriptTag({content:readFileSync('creditek/erp/'+f,'utf8')});
 await page.locator('#newExpense').click();
 await page.locator('#personPicker > select').selectOption('0');
 assert.equal(await page.locator('#f_document').isVisible(),false);
 assert.equal(await page.locator('#f_document').isDisabled(),true);
 await page.locator('#f_business').selectOption('b2b');await page.locator('#f_concept').fill('Gasto de prueba');await page.locator('#f_amount').fill('10000');
 await page.locator('#save').click();await page.waitForFunction(()=>calls.some(c=>c.name==='finanzas_registrar_movimiento'));
 const expense=await page.evaluate(()=>calls.find(c=>c.name==='finanzas_registrar_movimiento').args);
 assert.equal(expense.p_beneficiary_document,'12345678');assert.equal(expense.p_destination_account,'Bancolombia · Ahorros · 0012345678');assert.equal(expense.p_amount,10000);
 assert.deepEqual(errors,[]);console.log('PASS: persona existente sin repetir datos, ficha antigua, alta única, reintento y móvil.');
}finally{await browser.close();}
