import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {NativePostgres} from './native-postgres.mjs';
const root=new URL('./',import.meta.url);
const sha=async path=>createHash('sha256').update(await readFile(new URL(path,root))).digest('hex');
const native=process.env.NOVA_SQL_NATIVE_CONTAINER;
const {PGlite}=native?{}:await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=native?new NativePostgres(native):new PGlite();let engine;
try{engine=(await db.query('select version() as version')).rows[0].version;}finally{await db.close();}
const sqlSha256=await sha('../../../supabase/migrations/20261030165534_nova_client_sms_otp_budget.sql');
const result=spawnSync(process.execPath,['--test','--test-reporter=tap','sql.test.mjs'],{cwd:fileURLToPath(root),encoding:'utf8',env:process.env});
const output=(result.stdout||'')+(result.stderr||'');
await writeFile(new URL(native?'./native-tests.tap':'./sql-tests.tap',root),output);
const count=field=>Number(output.match(new RegExp('^# '+field+' (\\d+)$','m'))?.[1]??-1);
const receipt={timestampUTC:new Date().toISOString(),engine,sqlSha256,sqlUnchanged:sqlSha256===await sha('../../../supabase/migrations/20261030165534_nova_client_sms_otp_budget.sql'),
 tests:count('tests'),pass:count('pass'),fail:count('fail'),skipped:count('skipped'),exitCode:result.status,
 fixtureSha256:await sha('fixture.sql'),currentDefinitionsSha256:await sha('./current-otp-definitions.json'),testSha256:await sha('sql.test.mjs'),
 concurrency:native?'Native PostgreSQL; additional two-session contention cases have separate receipt':'Single PostgreSQL WASM session; true multi-connection lock contention NOT certified',productionDDL:false,providerCalls:false};
receipt.passed=receipt.exitCode===0&&receipt.tests===28&&receipt.tests===receipt.pass&&receipt.fail===0&&receipt.skipped===0&&receipt.sqlUnchanged;
await writeFile(new URL(native?'./native-test-receipt.json':'./sql-test-receipt.json',root),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt,null,2));
if(!receipt.passed){console.log(output);process.exitCode=1;}
