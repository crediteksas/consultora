import {readFile} from 'node:fs/promises';
export async function questionAlertEntry(){
  const policy=(await readFile(new URL('./policy.mjs',import.meta.url),'utf8')).replace(/^export /gm,'');
  const overlay=(await readFile(new URL('./overlay.mjs',import.meta.url),'utf8')).replace(/^import .*\n/,'').replace(/^export /gm,'');
  return "import legacy from './quality-ui.mjs';\n"+policy+'\n'+overlay+'\nexport default questionAlertOverlay(legacy);\n';
}
