import {readFile} from 'node:fs/promises';import {patchApprovedSofiaUI} from './approved.mjs';
export async function patchApprovedEntry(source){
 const base=await patchApprovedSofiaUI(source),needle='  auraSofiaApprovedDefault as default';
 if(base.split(needle).length!==2)throw Error('Unexpected export');
 const overlay=(await readFile(new URL('./entry-overlay.mjs',import.meta.url),'utf8')).replace(/^export /gm,'');
 return base.replace(needle,'  approvedEntryDefault as default')+'\n'+overlay+'\nconst approvedEntryDefault=approvedEntryOverlay(entry_default,sofiaVisualDefault,auraSofiaApprovedDefault);\n';
}
