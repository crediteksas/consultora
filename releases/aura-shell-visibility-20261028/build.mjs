import {readFile} from 'node:fs/promises';
export async function visibilityEntry(){const css=await readFile(new URL('./visibility.css',import.meta.url),'utf8'),patch=(await readFile(new URL('./patch.mjs',import.meta.url),'utf8')).replace(/^export /gm,'');return "import legacy from './sofia-ui.mjs';\n"+patch+'\nexport default shellVisibilityOverlay(legacy,'+JSON.stringify(css)+');\n';}
