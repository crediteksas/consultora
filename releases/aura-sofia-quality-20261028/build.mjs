import {readFile} from 'node:fs/promises';import {integrateQualityPanel} from './panel.mjs';
export async function auraQualityEntry(){
 const [original,css,client,overlay]=await Promise.all(['quality-original.html','layout.css','client.js','overlay.mjs'].map(name=>readFile(new URL('./'+name,import.meta.url),'utf8')));
 const html=integrateQualityPanel(original);
 return "import legacy from './chat-fit.mjs';\n"+overlay.replace(/^export /gm,'')+'\nexport default auraQualityOverlay(legacy,'+JSON.stringify({html,css,client})+');\n';
}
