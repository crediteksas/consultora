import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {sha} from '../transform.mjs';
const root=new URL('../',import.meta.url);const run=spawnSync(process.execPath,['--test','--test-concurrency=1','--test-reporter=tap',...['scope.test.mjs','managed.test.mjs','ui.test.mjs'].map(name=>fileURLToPath(new URL(name,import.meta.url)))],{encoding:'utf8'});
const output=(run.stdout||'')+(run.stderr||'');await writeFile(new URL('tests/results.tap',root),output);const count=field=>Number(output.match(new RegExp('^# '+field+' (\\d+)$','m'))?.[1]??-1);
const result={checkedAtUTC:new Date().toISOString(),engine:'Actual published/candidate functions and inline UI in closed VM + real local PGlite RPC/roles/triggers + actual WebCrypto HMAC/session',tests:count('tests'),passed:count('pass'),failed:count('fail'),skipped:count('skipped'),exitCode:run.status,candidateWorkerSha256:sha(await readFile(new URL('deploy/clientes/index.mjs',root))),candidateFormSha256:sha(await readFile(new URL('deploy/clientes/form.html',root))),realProviderCalls:0,productionReads:0,productionWrites:0,realMessages:0,localSyntheticSqlMutationsOnly:true,clock:'Synthetic time advances; no real30/90second sleeps',concurrency:'Client double-click and durable UUID replay tested; no native multi-session lock-race claim'};
await writeFile(new URL('tests/receipt.json',root),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));if(run.status!==0){console.log(output);process.exitCode=1;}else assert.ok(result.tests>0&&result.tests===result.passed&&result.failed===0&&result.skipped===0);
