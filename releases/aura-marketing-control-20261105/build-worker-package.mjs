import{readFile,writeFile,mkdir}from'node:fs/promises';import{createHash}from'node:crypto';import{createRequire}from'node:module';
const require=createRequire(process.env.MARKETING_PACKAGE_JSON || new URL('../../package.json',import.meta.url));const esbuild=require('esbuild');
const raw=await readFile('worker-published-source.mjs','utf8'),source=await readFile('handle-source.js','utf8'),candidate=await readFile('handle-candidate.js','utf8');if(raw.split(source).length!==2)throw Error('Published handler changed; stop');
const marker='    if (request.method === "GET" && path === "/connection") return reply2(publicConnection(await connection(env), env), 200, origin);';
const readRoute=`    if (path === "/existing-posts") {
      if (request.method !== "GET") return reply2({error:"METHOD_NOT_ALLOWED"},405,origin);
      let stage='query';
      try {
        const opts=readOptions(request.url);stage='connection';const conn=await connection(env);stage='list';
        const data=await readExistingPosts({...opts,connection:conn,read:(path,params)=>metaRead(env,conn.token,path,params)});
        return reply2(data,200,origin);
      } catch(e) { return reply2(readFailure(e,stage),e.message==='INVALID_QUERY'?400:502,origin); }
    }
`;
if(raw.split(marker).length!==2)throw Error('Organic read insertion changed; stop');
const assembled="import {readExistingPosts,readOptions,metaRead,readFailure} from './meta-existing-posts.mjs';\nimport {readDashboardV2} from './dashboard-service-v2.mjs';\n"+raw.replace(source,candidate).replace(marker,readRoute+marker);await writeFile('worker-candidate.mjs',assembled);await mkdir('package',{recursive:true});
await esbuild.build({entryPoints:['worker-candidate.mjs'],outfile:'package/worker.mjs',bundle:true,format:'esm',platform:'neutral',target:'es2022',external:['cloudflare:*'],logLevel:'silent'});
const sha=s=>createHash('sha256').update(s).digest('hex');await writeFile('package/build.json',JSON.stringify({publishedSource:sha(raw),candidate:sha(assembled),bundle:sha(await readFile('package/worker.mjs')),deployed:false,preservedSourceOutsideHandle:true},null,2));console.log('Worker candidate bundle built; no deployment');
