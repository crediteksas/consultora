import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))),results=[];
const env={...process.env,PGLITE_MODULE:process.env.PGLITE_MODULE||'/Users/oscarm/Creditek/baseline/consultora/node_modules/@electric-sql/pglite/dist/index.js',NOVA_REPAIR_CLIENTES_CANDIDATE:path.join(root,'deploy/clientes/index.mjs'),NOVA_REPAIR_CANDIDATE:path.join(root,'deploy/nova/index.mjs')};
assert.ok(fs.existsSync(env.PGLITE_MODULE),'Set PGLITE_MODULE to an existing local installation; never install or use a remote database.');
delete env.NOVA_SQL_NATIVE_CONTAINER;
const suites=[
 ['package',15,['--experimental-vm-modules','--test','--test-reporter=tap','tests/package-integration.test.mjs']],
 ['ui',33,['--test','--test-reporter=tap','clientes/ui-tests/flow-repair.test.mjs']],
 ['otp',20,['--test','--test-reporter=tap','clientes/otp-repair.test.mjs']],
 ['references',22,['--test','--test-reporter=tap','referencias/repair.test.mjs']],
 ['platforms',18,['--test','--test-reporter=tap','plataformas/flow-repair.test.mjs']],
 ['sql',10,['--test','--test-reporter=tap','plataformas/sql.test.mjs']],
];
const verify=spawnSync(process.execPath,['verify-package.mjs'],{cwd:root,env,encoding:'utf8'});
assert.equal(verify.status,0,verify.stderr||verify.stdout);
for(const [name,expected,args]of suites){
 const r=spawnSync(process.execPath,args,{cwd:root,env,encoding:'utf8',maxBuffer:8*1024*1024});
 fs.writeFileSync(path.join(root,'tests/final-'+name+'.tap'),r.stdout||'');
 const count=k=>Number((r.stdout||'').match(new RegExp('^# '+k+' (\\d+)$','m'))?.[1]||0);
 const result={name,expected,tests:count('tests'),passed:count('pass'),failed:count('fail'),skipped:count('skipped'),exitCode:r.status};
 results.push(result);console.log(JSON.stringify(result));
 if(r.status!==0||result.tests!==expected||result.passed!==expected||result.failed||result.skipped){
  fs.writeFileSync(path.join(root,'tests/final-verification-receipt.json'),JSON.stringify({status:'FAIL',results,stderr:r.stderr},null,2)+'\n');
  process.exit(1);
 }
}
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p)));
const chrome=read('clientes/ui-tests/browser/evidence/receipt.json');assert.equal(chrome.failed,0);assert.equal(chrome.passed,4);assert.equal(chrome.candidateFormSha256,manifest.artifacts['clientes/form.html'].sha256);
const otp=read('clientes/otp-native-concurrency-receipt.json'),consent=read('plataformas/native-concurrency-receipt.json');
assert.equal(otp.passed,3);assert.equal(consent.pass,4);assert.equal(otp.sqlSha256,manifest.migrations[0].sha256);assert.equal(consent.sqlSha256,manifest.migrations[1].sha256);
for(const [file,expect]of Object.entries(manifest.artifacts))assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root,'deploy',file))).digest('hex'),expect.sha256);
const receipt={checkedAtUTC:new Date().toISOString(),status:'PASS',results,totalLocalTests:results.reduce((n,r)=>n+r.tests,0),artifacts:manifest.artifacts,migrations:manifest.migrations,previousVerifiedSeparateExecutions:{chrome:4,nativePostgresRaces:7,nativePostgresFunctionalSql:10},productionWrites:0,realMessages:0,realCreditQueries:0,smsEnabled:false};
fs.writeFileSync(path.join(root,'tests/final-verification-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({final:'PASS',tests:receipt.totalLocalTests,chrome:4,nativeRaces:7,smsEnabled:false}));
