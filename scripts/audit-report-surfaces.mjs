import {readFile,readdir} from 'node:fs/promises';
import vm from 'node:vm';
const base='creditek/erp/';
const context=vm.createContext({window:{},document:{dispatchEvent(){}},CustomEvent:function(){},location:{pathname:''}});
vm.runInContext(await readFile(base+'kora-report-export.js','utf8'),context);
const clean=s=>s.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const inventory=[];
for(const file of (await readdir(base)).sort()){
 if(!/\.(html|js)$/.test(file)||/supabase-js|sidebar|kora-report-export/.test(file))continue;
 const source=await readFile(base+file,'utf8');
 for(const match of source.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/g)){
  const markup=match[0],headers=[...(markup.match(/<thead[^>]*>([\s\S]*?)<\/thead>/)?.[1]||'').matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map(m=>clean(m[1]));
  if(!headers.length)continue;
  const sourceId=markup.match(/<tbody[^>]*id=["']([^"']+)/)?.[1]||'';
  context.location.pathname='/creditek/erp/'+file.replace(/-app\.js$/,'.html');
  const policy=context.window.KoraReportExport.tablePolicy(sourceId,headers);
  inventory.push({file,line:source.slice(0,match.index).split('\n').length,sourceId,headers,policy:JSON.parse(JSON.stringify(policy)),footer:markup.includes('<tfoot'),declaration:/data-kora-report-(sums|totals|kind)/.test(markup)});
 }
}
if(process.argv.includes('--json'))console.log(JSON.stringify(inventory,null,2));
else{
 for(const row of inventory){
  const status=row.footer?'FOOTER':row.declaration?'DECLARED':row.policy.sums||row.policy.balances?'POLICY':row.policy.kind==='summary'?'SUMMARY':row.policy.note?'NON_ADDITIVE':'REVIEW';
  console.log(`${row.file}:${row.line} ${row.sourceId} ${status} | ${row.headers.join(' | ')}`);
 }
 console.log(`TOTAL ${inventory.length} table templates (inventory, not certification of live downloads)`);
}
