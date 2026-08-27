import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {NOVA_FEATURES,NOVA_PLATFORM_CHECKS} from '../../src/nova/domain/module.mjs';
import {NOVA_PERMISSIONS} from '../../src/nova/domain/permissions.mjs';
import {CARTERA_FEATURES} from '../../src/cartera/domain/module.mjs';
import {CARTERA_PERMISSIONS} from '../../src/cartera/domain/permissions.mjs';
import {NOVA_ROUTES} from '../../src/nova/ui/routes.mjs';
import {CARTERA_ROUTES} from '../../src/cartera/ui/routes.mjs';
import {AuraChannelRouter} from '../../src/channel-router/aura-channel-router.mjs';
import {createSandboxIdentityDirectory} from '../../src/channel-router/identity-directory.mjs';
import {MemorySnapshotReader} from '../../src/cartera/repositories/memory-snapshot-reader.mjs';
import {ReadPlatformFinancialSnapshot} from '../../src/cartera/application/read-platform-financial-snapshot.mjs';
import {RunPreCreditPlatformCheck} from '../../src/nova/application/run-precredit-platform-check.mjs';
import {MemoryCustomerRepository,MemorySaleRepository,MemorySnapshotRepository} from '../../src/nova/repositories/memory-repositories.mjs';
import {MemoryAudit} from '../../src/nova/audit/memory-audit.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=relative=>readFile(path.join(root,relative),'utf8');
async function filesUnder(relative){const base=path.join(root,relative),out=[];for(const entry of await readdir(base,{withFileTypes:true})){const next=path.join(base,entry.name);if(entry.isDirectory())out.push(...await filesUnder(path.relative(root,next)));else if(/\.(?:m?js|ts|html)$/.test(entry.name))out.push(next);}return out;}
async function joined(relative){return(await Promise.all((await filesUnder(relative)).map(file=>readFile(file,'utf8')))).join('\n');}

test('NOVA declara siete capacidades y cuatro verificaciones de plataforma',()=>{assert.equal(NOVA_FEATURES.length,7);assert.equal(NOVA_PLATFORM_CHECKS.PAYJOY,'REAL_READ_ONLY');assert.deepEqual(Object.keys(NOVA_PLATFORM_CHECKS),['PAYJOY','ALO','ADDI','KREDIYA']);});
test('Cartera conserva exactamente once capacidades y once rutas',()=>{assert.equal(CARTERA_FEATURES.length,11);assert.equal(CARTERA_ROUTES.length,11);});
test('NOVA conserva siete rutas operativas en su módulo independiente',()=>{assert.deepEqual(NOVA_ROUTES,['summary','requests','reviews','customers','validations','history','settings']);assert.notDeepEqual(NOVA_ROUTES,CARTERA_ROUTES);});
test('permisos NOVA y Cartera permanecen separados',()=>{assert.equal(NOVA_PERMISSIONS.length,4);assert.equal(CARTERA_PERMISSIONS.length,3);assert.deepEqual(NOVA_PERMISSIONS.filter(permission=>CARTERA_PERMISSIONS.includes(permission)),[]);});
test('Sofía no importa NOVA ni Cartera',async()=>{const source=await joined('creditek/agentes');const sofiaFiles=(await filesUnder('creditek/agentes')).filter(file=>/sofia|respuestas|redes|calendario/i.test(path.basename(file)));const sofia= (await Promise.all(sofiaFiles.map(file=>readFile(file,'utf8')))).join('\n');assert.doesNotMatch(sofia,/src\/(?:nova|cartera)|aura-(?:nova|cartera)\.(?:m?js)/);assert.ok(source.includes('Sofía'));});
test('NOVA no importa internals de Cartera',async()=>{assert.doesNotMatch(await joined('src/nova'),/(?:\.\.\/)+cartera\/|src\/cartera|lib\/cartera/);});
test('Cartera no importa internals de NOVA',async()=>{assert.doesNotMatch(await joined('src/cartera'),/(?:\.\.\/)+nova\/|src\/nova/);});
test('PayJoy es independiente de UI, NOVA y Cartera',async()=>{assert.doesNotMatch(await joined('src/integrations/payjoy'),/creditek\/agentes|src\/(?:nova|cartera)|document\.|window\./);});
test('shared contiene contratos comunes sin lógica específica de módulos',async()=>{assert.doesNotMatch(await joined('src/shared'),/src\/(?:nova|cartera)|PAYJOY_CHECK|PRE_CREDIT|DELINQUENCY|PROMISE/);});
test('router futuro no transporta mensajes y enruta por contrato',()=>{const router=new AuraChannelRouter({identities:createSandboxIdentityDirectory()});assert.equal(router.route({channel:'AURA_NOVA_CARTERA_SANDBOX',sender:'SANDBOX_RETAIL_01',text:'Solicitar autorización'}).destination,'NOVA');assert.equal(router.route({channel:'AURA_NOVA_CARTERA_SANDBOX',sender:'CUSTOMER',sender_type:'external_customer',text:'Ya pagué'}).destination,'CARTERA');assert.equal(router.route({channel:'SOFIA_CURRENT',text:'Ya pagué'}).destination,'UNKNOWN');assert.equal(router.route({channel:'AURA_NOVA_CARTERA_SANDBOX',sender:'UNKNOWN',text:'Hola'}).destination,'UNKNOWN');});
test('error NOVA no rompe lectura Cartera',async()=>{const useCase=new RunPreCreditPlatformCheck({customers:new MemoryCustomerRepository([{id:'C1'}]),sales:new MemorySaleRepository([{id:'S1',customer_id:'C1',platform:'PayJoy',imei_internal:'PRIVATE'}]),payjoyAdapter:{check:async()=>{throw new Error('offline');}},snapshotRepository:new MemorySnapshotRepository(),audit:new MemoryAudit()});const failed=await useCase.execute('C1');assert.equal(failed.available,false);const cartera=new ReadPlatformFinancialSnapshot({snapshots:new MemorySnapshotReader([{customer_id:'C2',platform:'PAYJOY',remaining_balance:1}])});assert.equal(cartera.execute('C2','PAYJOY').remaining_balance,1);});
test('error Cartera no rompe NOVA',()=>{const cartera=new ReadPlatformFinancialSnapshot({snapshots:{find(){throw new Error('cartera_offline');}}});assert.throws(()=>cartera.execute('C1','PAYJOY'),/cartera_offline/);const customers=new MemoryCustomerRepository([{id:'C1'}]);assert.equal(customers.findById('C1').id,'C1');});
test('grafo local src no tiene dependencias circulares',async()=>{const files=(await filesUnder('src')).filter(file=>file.endsWith('.mjs'));const graph=new Map(files.map(file=>[file,[]]));for(const file of files){const source=await readFile(file,'utf8');for(const match of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)){let target=path.resolve(path.dirname(file),match[1]);if(!path.extname(target))target+='.mjs';if(graph.has(target))graph.get(file).push(target);}}const visiting=new Set(),visited=new Set();function walk(file){if(visiting.has(file))throw new Error(`cycle:${path.relative(root,file)}`);if(visited.has(file))return;visiting.add(file);for(const next of graph.get(file)||[])walk(next);visiting.delete(file);visited.add(file);}for(const file of files)walk(file);assert.equal(visited.size,files.length);});
test('shell registra NOVA y Cartera como módulos distintos',async()=>{const [config,shell]=await Promise.all([read('creditek/agentes/aura-module-config.js'),read('creditek/agentes/index.html')]);assert.match(config,/nova: Object\.freeze/);assert.match(config,/cartera: Object\.freeze/);assert.match(shell,/NOVA Autorizaciones/);assert.match(shell,/openNovaModule/);assert.match(shell,/openCarteraModule/);assert.doesNotMatch(shell,/openClientesModule|aura-clientes/);});
