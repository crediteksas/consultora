import {readFile,mkdir,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('.',import.meta.url));process.chdir(root);
const repo=path.resolve(root,'../..');const require=createRequire(path.join(repo,'package.json'));
const pkg=require('wrangler/package.json');if(pkg.version!=='4.114.0')throw Error('Wrangler version changed; review before continuing');
const pins=JSON.parse(await readFile('inputs.sha256.json','utf8'));
for(const [name,expected]of Object.entries(pins)){if(path.isAbsolute(name)||name.split('/').includes('..'))throw Error('Invalid input path');const bytes=await readFile(name);if(createHash('sha256').update(bytes).digest('hex')!==expected)throw Error('Release input changed: '+name);}
await mkdir('package',{recursive:true});
const env={...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:path.join(root,'package/wrangler.log')};
function run(command,args,log){const r=spawnSync(command,args,{cwd:root,env,encoding:'utf8',maxBuffer:16*1024*1024});if(log) return writeFile(log,(r.stdout||'')+(r.stderr||'')).then(()=>{if(r.status!==0)throw Error('Check failed: '+args.join(' '));});if(r.status!==0)throw Error(r.stderr||'Check failed');}
const tests=(await readdir(root)).filter(f=>f.endsWith('.test.mjs')).sort();
await run(process.execPath,['--test',...tests],'package/tests.txt');
await run(process.execPath,['build-worker-package.mjs'],'package/backend-build.txt');
await run(process.execPath,['build-routed-package.mjs'],'package/ui-build.txt');
const cli=path.resolve(path.dirname(require.resolve('wrangler/package.json')),pkg.bin.wrangler);
for(const [worker,label]of [['creditek-aura-shell','shell'],['aura-campaign-view','campaign'],['aura-meta-ads-api','api']])await run(process.execPath,[cli,'deploy','--config',`deployment-review/${worker}.json`,'--dry-run','--outfile',`deployment-review/${label}-upload.multipart`],`deployment-review/${label}-dry-run.txt`);
await run(process.execPath,['verify-dry-payload.mjs'],'package/payload-check.txt');
console.log('Release inputs, fictional tests, 3 builds and 3 dry-run payloads passed. No deployment performed.');
