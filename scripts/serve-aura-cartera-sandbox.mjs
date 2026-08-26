import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createPool, loadCustomers } from './aura-cartera-sandbox-db.mjs';

const pool=createPool();const root=join(process.cwd(),'creditek/agentes');const port=Number(process.env.PORT||4176);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'};
createServer(async(req,res)=>{try{
  if(req.url==='/api/cartera/customers'){const customers=await loadCustomers(pool);res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});return res.end(JSON.stringify({environment:'aura2-cartera-sandbox',customers}));}
  const requested=req.url==='/'?'aura-cartera.html':req.url.split('?')[0].replace(/^\//,'');const file=normalize(join(root,requested));if(!file.startsWith(root))throw new Error('invalid path');
  const body=await readFile(file);res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(body);
}catch(error){res.writeHead(404,{'content-type':'application/json'});res.end(JSON.stringify({error:'sandbox_resource_unavailable'}));}}).listen(port,'127.0.0.1',()=>console.log(`AURA Cartera sandbox local: http://127.0.0.1:${port}/#summary`));
