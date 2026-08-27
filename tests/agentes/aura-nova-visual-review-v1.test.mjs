import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=name=>readFile(new URL(`../../creditek/agentes/${name}`,import.meta.url),'utf8');
test('vista web contiene exactamente los ocho escenarios certificados',async()=>{const js=await read('aura-nova-scenarios.js');for(const id of ['retail-clean','retail-yellow','retail-red','ally','unauthorized','new-customer','payjoy-offline','human-review'])assert.match(js,new RegExp(`id:'${id}'`));assert.equal((js.match(/\{id:'/g)||[]).length,8);});
test('vista muestra conversación pasos señal recomendación motivo y siguiente acción',async()=>{const [html,js]=await Promise.all([read('aura-nova-scenarios.html'),read('aura-nova-scenarios.js')]);for(const text of ['Conversación NOVA','Pasos','SEÑAL','RECOMENDACIÓN','MOTIVO','SIGUIENTE ACCIÓN'])assert.match(`${html}\n${js}`,new RegExp(text));});
test('vista visual no conecta servicios externos ni contiene PII real',async()=>{const source=(await Promise.all(['aura-nova-scenarios.html','aura-nova-scenarios.js','aura-nova-scenarios.css'].map(read))).join('\n');assert.doesNotMatch(source,/fetch\s*\(|graph\.facebook\.com|supabase|WHATSAPP_TOKEN|PHONE_NUMBER_ID|record-customer-payment/i);assert.match(source,/cero PII real/i);});
