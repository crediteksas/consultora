import {readFile} from 'node:fs/promises';
import {patchSofiaVisual} from './patch.mjs';
export async function patchApprovedSofiaUI(source){
 const candidate=await patchSofiaVisual(source);
 const needle='  sofiaVisualDefault as default';
 if(candidate.split(needle).length!==2)throw Error('Visual export differs');
 const off=(await readFile(new URL('../aura-dictation-off-20261028/overlay.mjs',import.meta.url),'utf8')).replace(/^export /gm,'');
 return candidate.replace(needle,'  auraSofiaApprovedDefault as default')+'\n'+off+'\nconst auraSofiaApprovedDefault=withoutAuraDictation(sofiaVisualDefault);\n';
}
