import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { candidate, baseline } from './form-harness.mjs';

const testFile=fileURLToPath(new URL('./flow-repair.test.mjs',import.meta.url));
const result=spawnSync(process.execPath,['--test','--test-reporter=tap',testFile],{encoding:'utf8'});
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
const count=label=>Number((result.stdout||'').match(new RegExp('^# '+label+' (\\d+)$','m'))?.[1]||0);
const sha=content=>createHash('sha256').update(content).digest('hex');
const files=['../ui-transform.mjs','./form-harness.mjs','./flow-repair.test.mjs','./run-tests.mjs'];
const receipt={
  checkedAt:new Date().toISOString(),node:process.version,exitCode:result.status,
  tests:count('tests'),passed:count('pass'),failed:count('fail'),
  baselineSha256:sha(baseline),candidateFormSha256:sha(candidate),
  files:Object.fromEntries(files.map(file=>[file,sha(readFileSync(new URL(file,import.meta.url)))])),
  environment:'Node VM executing actual inline form script with real File objects and closed fetch mocks',
  baselineNegativeControls:['PHOTO01','PHOTO02','OTP01','OTP02','OTP-L01'],
  productionWrites:false,realOtpSends:false,realOcr:false,browserTestPerformed:false,
};
writeFileSync(new URL('./receipt.json',import.meta.url),JSON.stringify(receipt,null,2)+'\n');
if(result.status!==0||receipt.failed!==0||receipt.tests!==33)process.exitCode=1;
