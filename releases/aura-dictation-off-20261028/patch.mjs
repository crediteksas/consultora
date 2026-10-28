import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
export const DICTATION_PREDECESSOR='81dddfb9d550de148cffecd83d4524c12b3b32ff219c7b521525cdb8969a3b72';
export async function patchDictationOff(source){
 if(createHash('sha256').update(source).digest('hex')!==DICTATION_PREDECESSOR)throw Error('AURA predecessor changed');
 const needle='  entry_default as default';if(source.split(needle).length!==2)throw Error('Export changed');
 const overlay=(await readFile(new URL('./overlay.mjs',import.meta.url),'utf8')).replace(/^export /gm,'');
 return source.replace(needle,'  dictationDisabledDefault as default')+'\n'+overlay+'\nconst dictationDisabledDefault=withoutAuraDictation(entry_default);\n';
}
