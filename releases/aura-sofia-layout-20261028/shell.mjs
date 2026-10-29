import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
export const SHELL_MODULES={
 'entry.js':'1d861112a997fa6dd1a92d063fdf58acad671909a983706cba3f870d9a7aa991',
 './4faa85bcc6ea69ce8fa4a5e6861e171e48dccd3f-navigation.js.txt':'1df482d91cecba9362396f466f987cbb40a13273ab5eab00014071ba42e34113',
 './07f587f94f163f8da5d7b52258e477f142f99052-navigation.css.txt':'593c26323272a618f0ddc9cb143136d41a8b1d250206afa8ece7ecaa8c28842d'
};
export function assertShellModules(modules){if(modules.size!==3)throw Error('Shell module count changed');for(const [name,expected]of Object.entries(SHELL_MODULES)){const body=modules.get(name);if(typeof body!=='string'||createHash('sha256').update(body).digest('hex')!==expected)throw Error('Shell module changed: '+name);}}
export async function shellEntry(){
 const css=await readFile(new URL('./sofia-layout.css',import.meta.url),'utf8');
 const visual=(await readFile(new URL('./overlay.mjs',import.meta.url),'utf8')).replace(/^export /gm,'');
 const off=(await readFile(new URL('../aura-dictation-off-20261028/overlay.mjs',import.meta.url),'utf8')).replace(/^export /gm,'');
 return "import legacy from './entry.js';\n"+visual+'\n'+off+'\nexport default withoutAuraDictation(sofiaVisualOverlay(legacy,'+JSON.stringify(css)+'));\n';
}
