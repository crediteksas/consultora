import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {sha} from '../transform.mjs';
const root=new URL('../',import.meta.url),r=spawnSync(process.execPath,['--test','--test-concurrency=1','--test-reporter=tap',...['scope.test.mjs','source.test.mjs','signature.test.mjs'].map(n=>fileURLToPath(new URL(n,import.meta.url)))],{encoding:'utf8'});
const output=r.stdout+r.stderr,count=k=>Number(output.match(new RegExp('^# '+k+' (\\d+)$','m'))?.[1]??-1);await writeFile(new URL('tests/results.tap',root),output);
const receipt={checkedAtUTC:new Date().toISOString(),engine:'Actual CLIENTES source-proof function composed with actual NOVA verifyReferenceSource/context in closed VM',candidateWorkerSha256:sha(await readFile(new URL('deploy/clientes/index.mjs',root))),tests:count('tests'),passed:count('pass'),failed:count('fail'),skipped:count('skipped'),exitCode:r.status,realNetworkCalls:0,realMessages:0,productionWrites:0,productionReadsInTests:0,scope:'Local synthetic backend-only read mocks; no replay or recovery'};await writeFile(new URL('tests/receipt.json',root),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));if(r.status!==0){console.log(output);process.exitCode=1;}else assert.ok(receipt.tests>0&&receipt.tests===receipt.passed&&receipt.failed===0&&receipt.skipped===0);
