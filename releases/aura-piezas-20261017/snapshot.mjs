import{readFile,writeFile}from'node:fs/promises';
const token=(await readFile('/Users/oscarm/.wrangler/config/default.toml','utf8')).match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
const base='https://api.cloudflare.com/client/v4', account='/accounts/853eee9e3d80f805fee58f4f99507e8a/workers';
async function get(p){const r=await fetch(base+p,{headers:{Authorization:`Bearer ${token}`}});if(!r.ok)throw Error('HTTP '+r.status);return r;}
const parts=await(await get(account+'/services/creditek-aura-shell/environments/production/content')).formData();
for(const[name,part]of parts){if(name.includes('/')||name.includes('..'))throw Error('Unexpected module');await writeFile('releases/aura-piezas-20261017/baseline-'+name,typeof part==='string'?part:await part.text());}
for(const[name,path]of [['settings',account+'/scripts/creditek-aura-shell/settings'],['routes','/zones/4117c7a89e988ae0869c02755ffa77ab/workers/routes'],['deployments',account+'/scripts/creditek-aura-shell/deployments']])await writeFile('/tmp/aura-'+name+'.json',JSON.stringify(await(await get(path)).json()));
console.log('Saved current shell modules', [...parts.keys()]);
