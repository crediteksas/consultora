import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
const read=p=>readFile(new URL('../../'+p,import.meta.url),'utf8');
test('acabado: todas las páginas publicables se incluyen una sola vez y AURA queda aislada',async()=>{
 const names=(await readdir(new URL('../../creditek/erp/',import.meta.url))).filter(x=>x.endsWith('.html')&&x!=='registro.html');
 assert.ok(names.length>=51);
 for(const name of names){const html=await read('creditek/erp/'+name);assert.equal((html.match(/<body\b[^>]*data-kora-finish="2026\.11"/g)||[]).length,1,name);assert.equal((html.match(/href="kora-finish\.css\?v=1\.0\.0" media="screen"/g)||[]).length,1,name);}
 for(const name of (await readdir(new URL('../../creditek/agentes/',import.meta.url))).filter(x=>x.endsWith('.html')))assert.doesNotMatch(await read('creditek/agentes/'+name),/kora-finish/);
});
test('acabado: la hoja no revela pantallas ni intercepta acciones, y conserva impresión',async()=>{
 const css=await read('creditek/erp/kora-finish.css');assert.match(css,/@media screen/);assert.match(css,/body\[data-kora-finish\]/);
 assert.doesNotMatch(css,/(?:^|[;{\n])\s*(display|visibility|pointer-events|z-index|position|content|filter|opacity)\s*:/);
 assert.match(css,/prefers-reduced-motion:reduce/);assert.match(css,/:focus-visible/);
 assert.match(css,/not\(\.danger\):not\(\.btn-danger\):not\(\.success\)/);
});
test('acabado: los encabezados de tabla tienen contraste AA y las cifras usan ancho tabular',async()=>{
 const css=await read('creditek/erp/kora-finish.css');assert.match(css,/font-variant-numeric: tabular-nums/);assert.doesNotMatch(css,/border-collapse:|border-spacing:|id\*=\"cancel|aria-label\^=/);assert.doesNotMatch(css,/background: #f1f4f7/);
 const luminance=hex=>{const rgb=hex.match(/\w\w/g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
 assert.ok((luminance('ffffff')+.05)/(luminance('0b1f3a')+.05)>=4.5);
 assert.ok((luminance('ffffff')+.05)/(luminance('086c75')+.05)>=4.5);
});

test('ventanas: las acciones secundarias se marcan explícitamente sin cambiar acciones de negocio',async()=>{
 const names=(await readdir(new URL('../../creditek/erp/',import.meta.url))).filter(x=>x.endsWith('.html'));
 let marked=0;
 for(const name of names){
  const html=await read('creditek/erp/'+name);
  for(const button of html.matchAll(/<button\b[^>]*data-kora-finish-role="dismiss"[^>]*>([\s\S]*?)<\/button>/g)){
   const label=button[1].replace(/<[^>]+>/g,'').trim();
   assert.ok(['Cancelar','Cerrar','Cerrar informe','Volver sin anular'].includes(label)||/aria-label="Cerrar"/.test(button[0]),name+': '+label);marked++;
  }
 }
 assert.ok(marked>=40);
 const css=await read('creditek/erp/kora-finish.css');
 assert.match(css,/--kora-field-font-size:\s*16px/);
 assert.match(css,/not\(\[aria-invalid="true"\]\)/);
 assert.match(css,/not\(\.has-error \*\)/);
});
