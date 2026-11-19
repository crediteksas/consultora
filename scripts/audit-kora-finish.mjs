// Read-only local presentation audit. Business scripts and all backend traffic are disabled.
import {chromium} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),out=process.env.KORA_FINISH_AUDIT_DIR||'/tmp/kora-finish-audit';await mkdir(out,{recursive:true});
const pages=(await readdir(path.join(root,'creditek/erp'))).filter(n=>n.endsWith('.html')&&n!=='registro.html').sort();
const inventory=[];
for(const name of pages){const source=await readFile(path.join(root,'creditek/erp',name),'utf8');const previous=execFileSync('git',['show',`${process.env.KORA_FINISH_BASELINE||'9137b6c9'}:creditek/erp/${name}`],{encoding:'utf8'});
 const normalize=s=>s.replace(/ data-kora-finish-role="dismiss"/g,'').replace(/ data-kora-finish="2026\.11"/g,'').replace(/<link rel="stylesheet" href="kora-finish\.css\?v=1\.0\.0" media="screen">\n/g,'');
 assert.equal(normalize(source),previous,'Only presentation opt-in/link may change '+name);
 assert.equal((source.match(/data-kora-finish="2026\.11"/g)||[]).length,1,name);
 assert.equal((source.match(/href="kora-finish\.css\?v=1\.0\.0"/g)||[]).length,1,name);
 inventory.push({page:name,buttons:(source.match(/<button\b/g)||[]).length,fields:(source.match(/<(?:input|select|textarea)\b/g)||[]).length,dialogs:(source.match(/<dialog\b|role=["']dialog/g)||[]).length,sourceChecked:true,rendered:[]});
}
const type=p=>({'.css':'text/css','.js':'text/javascript','.png':'image/png','.woff2':'font/woff2','.svg':'image/svg+xml'}[path.extname(p)]||'application/octet-stream');
const server=createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');let relative=decodeURIComponent(u.pathname);if(relative.startsWith('/audit/')){
 const name=relative.slice(7);if(!pages.includes(name)){res.writeHead(404).end();return;}
 let html=await readFile(path.join(root,'creditek/erp',name),'utf8');
 html=html.replace(/<meta\b[^>]*http-equiv=["']refresh["'][^>]*>/gi,'');
 html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi,'');
 html=html.replace('<head>','<head><base href="/creditek/erp/">');
 html=html.replace('</head>','<script src="/design-system/components/kora-product.js" defer></script></head>');
 res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
 const file=path.resolve(root,'.'+relative);if(!file.startsWith(root+path.sep)||!/^\.(css|js|png|woff2|svg)$/.test(path.extname(file))){res.writeHead(404).end();return;}
 res.setHeader('Content-Type',type(file));res.end(await readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
let browser;try{browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({reducedMotion:'reduce'});
 await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin===url)return route.continue();if(u.href==='https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css')return route.fulfill({contentType:'text/css',body:await readFile('/tmp/kora-audit-tailwind.css')});if(u.href==='https://unpkg.com/lucide@1.27.0/dist/umd/lucide.min.js')return route.fulfill({contentType:'text/javascript',body:await readFile('/tmp/kora-audit-lucide.js')});return route.abort();});
 for(const item of inventory){for(const width of [390,768,1440]){await page.setViewportSize({width,height:1000});await page.goto(url+'/audit/'+item.page);
 await page.evaluate(()=>{document.body.classList.add('kora-product-page');for(const e of document.querySelectorAll('main'))e.classList.add('main-content');for(const e of document.querySelectorAll('main,.main-content,#pageContent,#app')){e.classList.remove('hidden');e.removeAttribute('hidden');if(getComputedStyle(e).display==='none')e.style.display='block';}document.getAnimations().forEach(a=>a.finish());});
 const result=await page.evaluate(()=>{const visible=e=>!!e.getBoundingClientRect().width&&getComputedStyle(e).visibility!=='hidden';const controls=[...document.querySelectorAll('button,input,select,textarea')].filter(visible);return {overflow:document.documentElement.scrollWidth>innerWidth+1,visibleControls:controls.length,clippedControls:controls.filter(e=>e.getBoundingClientRect().left< -1||e.getBoundingClientRect().right>innerWidth+1).map(e=>({id:e.id,text:e.textContent.trim().slice(0,50)})).slice(0,12),font:getComputedStyle(document.body).fontFamily,dynamicOnly:document.querySelectorAll('main h1,main h2,.main-content h1,.main-content h2').length===0};});
 item.rendered.push({width,...result});
 if(width===1440){item.dialogLayouts=[];const modals=page.locator('dialog,[role="dialog"]');const count=await modals.count();for(let index=0;index<count;index++){
 const modal=modals.nth(index);const shape=await modal.evaluate(e=>{const state={hidden:e.getAttribute('hidden'),className:e.className,style:e.getAttribute('style')};e.removeAttribute('hidden');e.classList.remove('hidden');if(e.tagName==='DIALOG')e.showModal();else e.style.setProperty('display','block','important');const box=e.getBoundingClientRect();const result={id:e.id||e.getAttribute('aria-label'),width:box.width,height:box.height,viewport:innerWidth,fields:e.querySelectorAll('input,select,textarea').length};if(e.tagName==='DIALOG')e.close();e.className=state.className;if(state.hidden!==null)e.setAttribute('hidden',state.hidden);if(state.style!==null)e.setAttribute('style',state.style);else e.removeAttribute('style');return result;});item.dialogLayouts.push(shape);
 }}if(width===1440||['proveedores.html','compra-proveedor.html','aliados-dashboard.html','inventario.html'].includes(item.page))await page.screenshot({path:path.join(out,item.page.replace('.html','')+'-'+width+'.png'),animations:'disabled'});
 }
 console.log(item.page+': source preserved, rendered 390/768/1440');}
 await writeFile(path.join(out,'coverage.json'),JSON.stringify({scope:'Local static layout, no business scripts or backend requests',pages:inventory},null,2));
 console.log(JSON.stringify({pages:inventory.length,views:inventory.length*3,sourceButtons:inventory.reduce((n,x)=>n+x.buttons,0),sourceDialogs:inventory.reduce((n,x)=>n+x.dialogs,0),overflows:inventory.flatMap(x=>x.rendered.filter(r=>r.overflow).map(r=>({page:x.page,width:r.width})))},null,2));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
