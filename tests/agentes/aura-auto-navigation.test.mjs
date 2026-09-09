import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL('../../'+p,import.meta.url),'utf8');
test('navigation starts compact, supports pointer and keyboard, and collapses on selection',async()=>{
 const html=await read('creditek/agentes/index.html');
 const js=await read('creditek/agentes/aura-auto-navigation.js');
 assert.match(html,/function restoreAuraSidebar\(\) \{\s*applyAuraSidebar\(true\)/);
 for(const event of ['pointerenter','pointerleave','focusin','focusout','keydown','click']) assert.ok(js.includes(`'${event}'`));
 assert.match(js,/aria-controls/);assert.match(js,/aria-expanded/);
 assert.match(js,/link.addEventListener\('click',[\s\S]*close\(\)/);
 assert.match(html,/retryModule, toggleAuraSidebar/);
});
test('video does not reserve an empty preview column and keeps generation approval intact',async()=>{
 const html=await read('creditek/agentes/creditek-estudio-video.html');
 assert.match(html,/\.layout:not\(:has\(\.result:not\(\[hidden\]\)\)\)\{grid-template-columns:minmax\(0,1fr\)\}/);
 assert.match(html,/id="resultPanel"[^>]*hidden/);
 assert.match(html,/@media\(max-width:560px\)/);
 assert.match(html,/Ningún video se publica sin tu aprobación/);
});
