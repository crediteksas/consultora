// Prepare an unpublished version to validate asset config without replacing live assets.
import {readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {qualityCloudflare,qualityMetadata} from '/Users/oscarm/Creditek/creditek-bot-real/recovery/sofia-learning-20261028/release.mjs';
const cf=await qualityCloudflare(),source=await cf.source('creditek-aura');
if(createHash('sha256').update(source).digest('hex')!=='f7e26f54cfb5223c29ecbd358118c7b3f3a193eee6789daeb603b2314a45691c')throw Error('Source changed');
const settings=await cf.get('/workers/services/creditek-aura/environments/production/settings'),meta=qualityMetadata(settings);
meta.keep_bindings=['secret_text'];meta.bindings=settings.bindings.filter(b=>b.type!=='secret_text');
meta.assets={config:{base_path:'/',_headers:'/creditek/agentes/*\n  Cache-Control: no-cache, max-age=0, must-revalidate\n',run_worker_first:['/creditek/agentes/creditek-agente-respuestas','/creditek/agentes/creditek-agente-respuestas.html','/creditek/agentes/aura-dictation.mjs']}};
meta.keep_assets=true;meta.assets.config.serve_directly=false;
meta.annotations={'workers/message':'Validate approved Sofia asset routing; not deployed'};
const config=await readFile('/Users/oscarm/.wrangler/config/default.toml','utf8'),token=config.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];if(!token)throw Error('Session unavailable');
const form=new FormData();form.set('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}));form.set('runtime.js',new Blob([source],{type:'application/javascript+module'}),'runtime.js');
const r=await fetch('https://api.cloudflare.com/client/v4/accounts/853eee9e3d80f805fee58f4f99507e8a/workers/scripts/creditek-aura/versions',{method:'POST',headers:{Authorization:'Bearer '+token},body:form});const j=await r.json();if(!r.ok||!j.success){console.log(JSON.stringify({ok:false,status:r.status,errors:j.errors}));process.exit(1);}
const version=await cf.get('/workers/scripts/creditek-aura/versions/'+j.result.id);await writeFile('/private/tmp/aura-approved-release-aLLk4J/routing-version.json',JSON.stringify(version,null,2),{mode:0o600});console.log(JSON.stringify({ok:true,version:version.id,assets:version.resources.script_runtime.assets,activeUnchanged:true}));
