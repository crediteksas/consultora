import {readFile} from 'node:fs/promises';
import {OLD_LOAD,NEW_LOAD,OPEN_ANCHOR,SCROLL_ANCHOR,HELPER,OLD_RENDER} from './policy.mjs';
export async function liveChatEntry(){
  const constants=Object.entries({OLD_LOAD,NEW_LOAD,OPEN_ANCHOR,SCROLL_ANCHOR,HELPER,OLD_RENDER}).map(([k,v])=>'const '+k+'='+JSON.stringify(v)+';').join('\n');
  const policy=(await readFile(new URL('./policy.mjs',import.meta.url),'utf8')).slice((await readFile(new URL('./policy.mjs',import.meta.url),'utf8')).indexOf('export function patchLiveChat')).replace('export function','function');
  const overlay=(await readFile(new URL('./overlay.mjs',import.meta.url),'utf8')).replace(/^import .*\n/,'').replace(/^export /gm,'');
  return "import legacy from './intervention-ui.mjs';\n"+constants+'\n'+policy+'\n'+overlay+'\nexport default liveChatOverlay(legacy);\n';
}
