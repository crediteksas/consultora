import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('.',import.meta.url),source=await readFile(new URL('current.mjs',root),'utf8'),html=await readFile(new URL('form.html',root),'utf8');
const marker='var pilot_form_default = ',start=source.indexOf(marker)+marker.length;
if(start<marker.length||source[start]!=='`')throw Error('Unexpected deployed form literal');
let end=start+1;while(end<source.length){if(source[end]==='\\'){end+=2;continue;}if(source[end]==='`')break;end++;}
if(end>=source.length)throw Error('Missing form literal end');
const output=source.slice(0,start)+JSON.stringify(html)+source.slice(end+1);
await writeFile(new URL('index.mjs',root),output);
console.log('Built current registration worker with form-only replacement');
