import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const target=new URL('./package-integration.test.mjs',import.meta.url);
const result=spawnSync(process.execPath,['--experimental-vm-modules','--test','--test-reporter=tap',fileURLToPath(target)],{encoding:'utf8'});
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
const count=label=>Number((result.stdout||'').match(new RegExp('^# '+label+' (\\d+)$','m'))?.[1]||0);
const runtime=JSON.parse(readFileSync(new URL('./package-integration-runtime.json',import.meta.url)));
const receipt={...runtime,checkedAt:new Date().toISOString(),status:result.status===0&&count('tests')===15&&count('fail')===0?'PASS':'FAIL',exitCode:result.status,tests:count('tests'),passed:count('pass'),failed:count('fail'),testSha256:createHash('sha256').update(readFileSync(target)).digest('hex')};
writeFileSync(new URL('./package-integration-receipt.json',import.meta.url),JSON.stringify(receipt,null,2)+'\n');
writeFileSync(new URL('./package-integration-results.tap',import.meta.url),result.stdout||'');
if(receipt.status!=='PASS')process.exitCode=1;
