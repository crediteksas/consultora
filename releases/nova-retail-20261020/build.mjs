import {readFile,writeFile} from 'node:fs/promises';
import {build} from '/Users/oscarm/.npm/_npx/32026684e21afda6/node_modules/esbuild/lib/main.js';
const root=new URL('.',import.meta.url),html=await readFile(new URL('retail-portal.html',root),'utf8');
await writeFile(new URL('retail-portal.mjs',root),'export default '+JSON.stringify(html)+';\n');
const registration=new URL('../nova-registro-repair-20261020/registration.mjs',root),form=await readFile(new URL('form.html',root),'utf8');
const source=await readFile(registration,'utf8');await writeFile(registration,source.replace(/var pilot_form_default = "[^\n]*";/,()=> 'var pilot_form_default = '+JSON.stringify(form)+';'));
await build({entryPoints:[new URL('../nova-registro-repair-20261020/entry.mjs',root).pathname],outfile:new URL('../nova-registro-repair-20261020/index.mjs',root).pathname,bundle:true,format:'esm',platform:'browser',external:['node:*','cloudflare:*'],logLevel:'warning'});
console.log('Built registration worker and retail portal');
