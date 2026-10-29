// Read-only by default. Only --apply updates the AURA shell UI.
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chatFitEntry} from './build.mjs';
import {qualityCloudflare,qualityMetadata,qualitySettingsEqual} from '/Users/oscarm/Creditek/creditek-bot-real/recovery/sofia-learning-20261028/release.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const ensure=(ok,message)=>{if(!ok)throw Error(message);};
const apply=process.argv.slice(2);ensure(apply.length===0||(apply.length===1&&apply[0]==='--apply'),'Unknown argument');
const expected={
 'entry.js':'1d861112a997fa6dd1a92d063fdf58acad671909a983706cba3f870d9a7aa991',
 'sofia-ui.mjs':'b3328fc1e61cfd2e573c89b39e5c7da3c88466a30ce716dd5d85ea4d06c980b1',
 'visibility-ui.mjs':'49a396408a81736a4553f6c2cc45c37f9a793e66668ff2abd240dcc725a47f81',
 './07f587f94f163f8da5d7b52258e477f142f99052-navigation.css.txt':'593c26323272a618f0ddc9cb143136d41a8b1d250206afa8ece7ecaa8c28842d',
 './4faa85bcc6ea69ce8fa4a5e6861e171e48dccd3f-navigation.js.txt':'1df482d91cecba9362396f466f987cbb40a13273ab5eab00014071ba42e34113'
};
const cf=await qualityCloudflare();
const config=await readFile('/Users/oscarm/.wrangler/config/default.toml','utf8');
const token=config.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];ensure(token,'Existing session unavailable');
const root='https://api.cloudflare.com/client/v4/accounts/853eee9e3d80f805fee58f4f99507e8a';
const headers={Authorization:'Bearer '+token};
async function modules(){
 const r=await fetch(root+'/workers/services/creditek-aura-shell/environments/production/content',{headers,signal:AbortSignal.timeout(20000)});
 ensure(r.ok,'Cannot inspect shell source: '+r.status);const data=await r.formData(),result=new Map();
 for(const [name,body]of data)result.set(name,typeof body==='string'?body:await body.text());return result;
}
function predecessor(m){ensure(m.size===5,'Shell changed concurrently');for(const [name,digest]of Object.entries(expected))ensure(hash(m.get(name)||'')===digest,'Changed module: '+name);}
async function page(path){const r=await fetch('https://aura.crediteksas.com'+path,{signal:AbortSignal.timeout(20000)});const body=await r.text();return {status:r.status,headers:Object.fromEntries(r.headers),body,sha256:hash(body)};}
const initial=await modules();predecessor(initial);
const settingsPath='/workers/services/creditek-aura-shell/environments/production/settings';
const settings=await cf.get(settingsPath);
const workerNames=['creditek-aura','creditek-bot','creditek-nova'];
const workerHashes=Object.fromEntries(await Promise.all(workerNames.map(async name=>[name,hash(await cf.source(name))])));
const otherPaths=['/creditek/agentes/','/creditek/agentes/index.html','/creditek/agentes/aura-auto-navigation.js','/creditek/agentes/aura-auto-navigation.css','/creditek/agentes/aura-auth.js','/creditek/agentes/aura-responsive.css','/design-system/components/kora-product.css','/creditek/shared/branding/creditek-logo.png','/creditek/agentes/aura-dictation.mjs?v=20261028','/api/sofia/tiendas'];
const targetPaths=['/creditek/agentes/creditek-agente-respuestas?embedded=1','/creditek/agentes/creditek-agente-respuestas.html'];
const [before,targets]=await Promise.all([Promise.all(otherPaths.map(page)),Promise.all(targetPaths.map(page))]);
ensure(targets.every(x=>x.status===200&&x.headers['x-sofia-visual-release']==='20261028-1'),'Current Sofia UI differs');
const css=await readFile(new URL('./chat-fit.css',import.meta.url),'utf8');
const addition='<style id="sofia-chat-fit-20261028">'+css+'</style>';
const candidate=await chatFitEntry();const dir=await mkdtemp('/private/tmp/aura-chat-fit-release-');
for(const [name,body]of initial)await writeFile(dir+'/'+name.replace(/^\.\//,''),body,{mode:0o600});
await writeFile(dir+'/chat-fit.mjs',candidate,{mode:0o600});
await writeFile(dir+'/before.html',targets[0].body,{mode:0o600});
await writeFile(dir+'/backup.json',JSON.stringify({settings,modules:expected,workerHashes},null,2),{mode:0o600});
console.log(JSON.stringify({phase:'validated',apply:apply.length===1,dir,candidateSha256:hash(candidate)}));
if(!apply.length)process.exit(0);
predecessor(await modules());qualitySettingsEqual(settings,await cf.get(settingsPath));
for(let i=0;i<targets.length;i++)ensure((await page(targetPaths[i])).sha256===targets[i].sha256,'Sofia HTML changed concurrently');
const metadata=qualityMetadata(settings);metadata.main_module='chat-fit.mjs';
metadata.annotations={'workers/message':'Fit Sofia chat history and reply controls within embedded workspace; CSS only'};
const form=new FormData();form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
for(const [name,body]of initial)form.set(name,new Blob([body],{type:/\.(mjs|js)$/.test(name)?'application/javascript+module':'text/plain'}),name);
form.set('chat-fit.mjs',new Blob([candidate],{type:'application/javascript+module'}),'chat-fit.mjs');
const r=await fetch(root+'/workers/scripts/creditek-aura-shell',{method:'PUT',headers,body:form,signal:AbortSignal.timeout(60000)});
const data=await r.json();ensure(r.ok&&data.success,'Upload uncertain or rejected; inspect before retry: '+JSON.stringify(data.errors||r.status));
const final=await modules();ensure(final.size===6&&final.get('chat-fit.mjs')===candidate,'New module mismatch');
for(const [name,body]of initial)ensure(final.get(name)===body,'Previous module changed: '+name);
qualitySettingsEqual(settings,await cf.get(settingsPath));
for(let i=0;i<targets.length;i++){
 const target=await page(targetPaths[i]);ensure(target.status===200&&target.headers['x-sofia-chat-fit']==='20261028-1','New style not served');
 ensure(target.body.replace(addition,'')===targets[i].body,'HTML changed beyond the approved style');
}
const after=await Promise.all(otherPaths.map(page));
for(let i=0;i<before.length;i++)ensure(before[i].status===after[i].status&&before[i].sha256===after[i].sha256,'Unrelated route changed: '+otherPaths[i]);
for(const name of workerNames)ensure(hash(await cf.source(name))===workerHashes[name],'Unrelated Worker changed: '+name);
const deployments=await cf.get('/workers/scripts/creditek-aura-shell/deployments');
const version=deployments.deployments[0].versions;ensure(version.length===1&&version[0].percentage===100,'Unexpected deployment allocation');
const result={ok:true,at:new Date().toISOString(),version:version[0],candidateSha256:hash(candidate),originalModulesPreserved:Object.keys(expected),settingsPreserved:true,unrelatedWorkersPreserved:workerNames,otherRoutesPreserved:otherPaths,operationalHtmlAndScriptsPreserved:true,liveVisual:'pending_reload',noTestMessages:true};
await writeFile(new URL('./verification.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
await writeFile(dir+'/verification.json',JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify(result));
