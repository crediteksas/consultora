import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
export const PREDECESSOR='81dddfb9d550de148cffecd83d4524c12b3b32ff219c7b521525cdb8969a3b72';
export async function patchSofiaVisual(source){
 if(createHash('sha256').update(source).digest('hex')!==PREDECESSOR)throw Error('AURA predecessor changed');
 const needle='  entry_default as default';if(source.split(needle).length!==2)throw Error('AURA export changed');
 const css=await readFile(new URL('./sofia-layout.css',import.meta.url),'utf8'),overlay=(await readFile(new URL('./overlay.mjs',import.meta.url),'utf8')).replace(/^export /gm,'');
 return source.replace(needle,'  sofiaVisualDefault as default')+'\n'+overlay+'\nconst sofiaVisualDefault=sofiaVisualOverlay(entry_default,'+JSON.stringify(css)+');\n';
}
