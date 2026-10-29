import {readFile} from 'node:fs/promises';
export async function chatFitEntry(){
  const css=await readFile(new URL('./chat-fit.css',import.meta.url),'utf8');
  const overlay=(await readFile(new URL('./overlay.mjs',import.meta.url),'utf8')).replace(/^export /gm,'');
  return "import legacy from './visibility-ui.mjs';\n"+overlay+'\nexport default chatFitOverlay(legacy,'+JSON.stringify(css)+');\n';
}
