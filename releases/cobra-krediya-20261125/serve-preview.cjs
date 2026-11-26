// Local-only review server: no database credentials, writes or proxy endpoints.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=__dirname, port=Number(process.argv[2]||8789), reference=process.argv[3];
const allowed=new Set(['index.html','quality.css','quality-domain.js','quality-app.js']);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
const server=http.createServer((req,res)=>{
 const reply=(code,body,type='text/plain; charset=utf-8')=>{res.writeHead(code,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"});res.end(req.method==='HEAD'?undefined:body);};
 if(req.headers.host!==`127.0.0.1:${port}`||!['GET','HEAD'].includes(req.method))return reply(403,'Not allowed');
 const pathname=new URL(req.url,`http://127.0.0.1:${port}`).pathname;
 try{
  if(pathname==='/reference.json')return reference?reply(200,fs.readFileSync(reference),'application/json'):reply(404,'Reference unavailable');
  if(pathname==='/vendor/xlsx.js')return reply(200,fs.readFileSync(path.join(root,'vendor/xlsx-0.20.3.full.min.js')),'text/javascript; charset=utf-8');
  const name=pathname==='/'?'index.html':pathname.slice(1);
  if(!allowed.has(name))return reply(404,'Not found');
  return reply(200,fs.readFileSync(path.join(root,name)),types[path.extname(name)]);
 }catch{return reply(404,'Not available');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Local preview http://127.0.0.1:${port}`));
