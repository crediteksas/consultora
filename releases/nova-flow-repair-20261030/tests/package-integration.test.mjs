import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash, webcrypto } from 'node:crypto';
import { createRequire, builtinModules } from 'node:module';
import { EventEmitter } from 'node:events';
import { transformForm } from '../clientes/ui-transform.mjs';

const root=new URL('../',import.meta.url);
const text=file=>fs.readFileSync(new URL(file,root),'utf8');
const sha=value=>createHash('sha256').update(value).digest('hex');
const manifest=JSON.parse(text('manifest.json'));
const pinned={
  'baseline/clientes/index.mjs':'9a9c81c37a504c12be12b9fcc9a681be7209d9556367d1bb2f517936640d56e1',
  'baseline/clientes/form.html':'0f95fd3046df2e74b607a6f5dd9182c02048a5571e26a2689e73d72e61379c2e',
  'baseline/nova/index.mjs':'232513ce40c043e43c530ebad9bb9b3dbfc7d8061cae109f07fd82f841c411fb',
  'deploy/clientes/index.mjs':'6a5d0d76296d91c44f22398823c54749b4a2ae30ec5923c27e47da254eac0c7d',
  'deploy/clientes/form.html':'ef6c89485e34b4b80f7df3e68f962c0ac66232d4a0e7ec8e3a06073554810b07',
  'deploy/nova/index.mjs':'3dc0b1d578bc5ebacccaae63310f8b11ca71c3e9a5a36b5e731f6a76a01ae355',
};
const modules=new Map(),audit={fetchAttempts:[],ioAttempts:[],requires:new Set(),evaluated:new Set(),deferred:0};

// Built-in-only imports. Network and file I/O APIs are closed even if a guard
// unexpectedly regresses; the test cannot open TCP/UDP/DNS or read credentials.
async function loadWorker(file){
  if(modules.has(file))return modules.get(file);
  const result=(async()=>{
    const identifier=new URL(file,root).href;
    const deny=kind=>(..._args)=>{audit.ioAttempts.push(kind);throw Error('I/O forbidden in package integration test: '+kind);};
    class ClosedSocket extends EventEmitter {connect=deny('socket.connect');setKeepAlive(){return this;}setNoDelay(){return this;}destroy(){return this;}end(){return this;}}
    const localRequire=createRequire(identifier);
    const safeRequire=specifier=>{
      audit.requires.add(specifier);
      if(specifier==='pg-native'){const error=Error('Optional native provider disabled');error.code='MODULE_NOT_FOUND';throw error;}
      assert.ok(builtinModules.includes(specifier)||builtinModules.includes(specifier.replace(/^node:/,'')),'Built-in imports only: '+specifier);
      const original=localRequire(specifier),name=specifier.replace(/^node:/,'');
      if(name==='net')return {...original,Socket:ClosedSocket,Stream:ClosedSocket,connect:deny('net.connect'),createConnection:deny('net.createConnection'),createServer:deny('net.createServer')};
      if(name==='tls')return {...original,TLSSocket:ClosedSocket,connect:deny('tls.connect'),createServer:deny('tls.createServer')};
      if(name==='dns')return {...original,lookup:deny('dns.lookup'),resolve:deny('dns.resolve'),Resolver:class {resolve=deny('dns.Resolver.resolve');}};
      if(name==='dgram')return {createSocket:deny('dgram.createSocket')};
      if(name==='fs')return new Proxy(original,{get(target,key){if(typeof target[key]==='function'&&!['constants'].includes(key))return deny('fs.'+String(key));return target[key];}});
      return original;
    };
    const sandboxProcess={env:{},versions:process.versions,version:process.version,platform:process.platform,arch:process.arch,features:{},nextTick:process.nextTick.bind(process),hrtime:process.hrtime.bind(process),on(){},once(){},removeListener(){},exit:deny('process.exit')};
    sandboxProcess.getBuiltinModule=specifier=>specifier==='node:process'?sandboxProcess:safeRequire(specifier);
    const context=vm.createContext({console:{log(){},warn(){},error(){}},
      process:sandboxProcess,
      Request,Response,Headers,URL,URLSearchParams,TextEncoder,TextDecoder,AbortSignal,AbortController,
      crypto:webcrypto,atob,btoa,setTimeout,clearTimeout,setInterval,clearInterval,setImmediate,clearImmediate,queueMicrotask,performance,Buffer,ReadableStream,WritableStream,TransformStream,structuredClone,
      fetch:(...args)=>{audit.fetchAttempts.push({module:file,url:String(args[0])});throw Error('External fetch forbidden in package integration test');},
    });
    const source=new vm.SourceTextModule(text(file),{context,identifier,initializeImportMeta(meta,module){meta.url=module.identifier;}});
    await source.link(async specifier=>{
      if(specifier==='cloudflare:workers')return new vm.SyntheticModule(['WorkerEntrypoint','DurableObject'],function(){
        class WorkerEntrypoint {constructor(ctx,env){this.ctx=ctx;this.env=env;}}
        class DurableObject extends WorkerEntrypoint {}
        this.setExport('WorkerEntrypoint',WorkerEntrypoint);this.setExport('DurableObject',DurableObject);
      },{context});
      if(specifier==='node:events')return new vm.SyntheticModule(['EventEmitter'],function(){this.setExport('EventEmitter',EventEmitter);},{context});
      if(specifier==='node:module')return new vm.SyntheticModule(['createRequire'],function(){this.setExport('createRequire',url=>{assert.ok(typeof url==='string');return safeRequire;});},{context});
      throw Error('Unexpected module import: '+specifier);
    });
    await source.evaluate();audit.evaluated.add(file);return source.namespace;
  })();
  modules.set(file,result);return result;
}
async function request(file,path,{method='GET',body,headers={},env={}}={}){
  const ns=await loadWorker(file),beforeFetch=audit.fetchAttempts.length,beforeIo=audit.ioAttempts.length;
  const response=await ns.default.fetch(new Request('https://'+(file.includes('/clientes/')?'registro':'aura')+'.crediteksas.com'+path,{method,headers,...body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)}}),env,{waitUntil(_promise){audit.deferred++;throw Error('Unexpected deferred job in read-only test');}});
  assert.equal(audit.fetchAttempts.length,beforeFetch,'No provider or database fetch');assert.equal(audit.ioAttempts.length,beforeIo,'No TCP/UDP/DNS/file I/O');
  return response;
}
const client='deploy/clientes/index.mjs',clientBase='baseline/clientes/index.mjs',nova='deploy/nova/index.mjs',novaBase='baseline/nova/index.mjs';
const jsonHeaders={'content-type':'application/json',origin:'https://registro.crediteksas.com'};
const safeBody={enlace_token:'t'.repeat(48),cedula:'12345678',celular:'3000000000',turnstile_token:'synthetic'};
function embeddedForm(source){
  const prefix='var pilot_form_default = ',start=source.indexOf(prefix);assert.ok(start>=0&&source.indexOf(prefix,start+prefix.length)<0);
  const from=start+prefix.length,quote=source[from];assert.ok(['"',"'",'`'].includes(quote));
  for(let i=from+1;i<source.length;i++){if(source[i]==='\\'){i++;continue;}if(source[i]===quote){assert.equal(source[i+1],';');return vm.runInNewContext(source.slice(from,i+1),Object.create(null),{timeout:1000});}}
  throw Error('Unclosed embedded form');
}

test('package artifacts and live predecessors match the frozen manifest and exact reviewed hashes',()=>{
  for(const [file,hash]of Object.entries(pinned))assert.equal(sha(text(file)),hash,file);
  for(const file of ['clientes/index.mjs','clientes/form.html','nova/index.mjs'])assert.equal(manifest.artifacts[file].sha256,pinned['deploy/'+file]);
  assert.equal(manifest.smsEnabled,false);assert.equal(JSON.parse(text('wrangler.clientes.jsonc')).vars.NOVA_SMS_ENABLED,'false');
});

test('complete CLIENTES and NOVA modules evaluate with identical public exports to their inspected predecessors',async()=>{
  for(const [before,after]of [[clientBase,client],[novaBase,nova]]){
    const [a,b]=await Promise.all([loadWorker(before),loadWorker(after)]);assert.deepEqual(Object.keys(a),Object.keys(b));
    assert.equal(typeof b.default.fetch,'function');assert.equal(typeof b.default.scheduled,'function');
  }
});

test('compiled CLIENTES embeds exactly the standalone tested form and serves the existing recovery-link wrapper',async()=>{
  const form=text('deploy/clientes/form.html');assert.equal(embeddedForm(text(client)),form);assert.equal(transformForm(text('baseline/clientes/form.html')),form);
  assert.equal(sha(form),pinned['deploy/clientes/form.html']);
  const r=await request(client,'/nova/registro');assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.match(r.headers.get('content-type'),/text\/html/);
  const html=await r.text(),wrappedStart=html.indexOf('<body>');assert.ok(wrappedStart>=0);
  assert.ok(html.includes('novaRecoverExisting'));assert.ok(html.includes('BEGIN NOVA FLOW REPAIR 20261030.1'));
  const wrapper=/^<aside[\s\S]*?<\/aside><script>[\s\S]*?<\/script>/;
  const servedUnwrapped=html.slice(0,wrappedStart+6)+html.slice(wrappedStart+6).replace(wrapper,'');assert.equal(servedUnwrapped,form);
  const inputs=s=>[...s.matchAll(/<input\b[^>]*type=["']file["'][^>]*>/g)].map(m=>m[0]);assert.deepEqual(inputs(form),inputs(text('baseline/clientes/form.html')));
});

test('CLIENTES routing classification is unchanged outside the patch, including registration aliases and internal gates',async()=>{
  const [a,b]=await Promise.all([loadWorker(clientBase),loadWorker(client)]);
  for(const path of ['/nova/registro','/nova/registro-recuperar','/creditek/erp/registro.html','/api/otp/opciones','/api/otp/estado','/api/otp/enviar','/api/otp/verificar','/api/documentos','/api/registro','/api/registro/nova-retomar','/api/admin/enlaces','/internal/nova-reference-source','/internal/kpis/inscritos','/unrelated','/api/unrelated'])assert.equal(a.useRegistration(path),b.useRegistration(path),path);
});

test('CLIENTES preflight keeps allowed-origin behavior, exposes no data and performs no fetch',async()=>{
  for(const origin of ['https://registro.crediteksas.com','https://untrusted.invalid']){
    const options={method:'OPTIONS',headers:{origin},env:{ALLOWED_ORIGIN:'https://registro.crediteksas.com'}};
    const a=await request(clientBase,'/api/otp/enviar',options),b=await request(client,'/api/otp/enviar',options);
    assert.equal(b.status,a.status);assert.equal(b.status,204);assert.equal(await b.text(),'');assert.equal(b.headers.get('access-control-allow-origin'),a.headers.get('access-control-allow-origin'));
  }
});

test('SMS disabled: options stays hidden/read-only and status cannot query a customer or reservation',async()=>{
  const env={NOVA_SMS_ENABLED:'false',ALLOWED_ORIGIN:'https://registro.crediteksas.com'};
  const r=await request(client,'/api/otp/opciones',{method:'POST',headers:jsonHeaders,body:{enlace_token:safeBody.enlace_token,celular:safeBody.celular},env});
  assert.equal(r.status,200);assert.deepEqual(await r.json(),{smsEnabled:false});assert.equal(r.headers.get('cache-control'),'no-store');
  const status=await request(client,'/api/otp/estado',{method:'POST',headers:jsonHeaders,body:{...safeBody,request_id:'11111111-1111-4111-8111-111111111111'},env});assert.equal(status.status,503);assert.equal((await status.json()).ok,false);
  assert.equal((await request(client,'/api/otp/opciones')).status,405);
});

test('SMS disabled: an explicit SMS request is rejected before provider/RPC and never falls back to WhatsApp',async()=>{
  const r=await request(client,'/api/otp/enviar',{method:'POST',headers:jsonHeaders,body:{...safeBody,channel:'sms',request_id:'11111111-1111-4111-8111-111111111111',sms_reason:'no_whatsapp'},env:{NOVA_SMS_ENABLED:'false'}});
  assert.equal(r.status,503);const body=await r.json();assert.equal(body.ok,false);assert.equal(body.state,'not_sent');assert.equal(body.channel,'sms');
});

test('malformed/oversized OTP input is rejected without a reservation or any paid operation',async()=>{
  for(const [path,body,env,status]of [['/api/otp/enviar','{',{NOVA_SMS_ENABLED:'false'},410],['/api/otp/enviar',JSON.stringify({extra:'x'.repeat(5000)}),{NOVA_SMS_ENABLED:'true'},400],['/api/otp/opciones','{',{NOVA_SMS_ENABLED:'false'},400]]){
    const options={method:'POST',headers:jsonHeaders,body,env},r=await request(client,path,options);assert.equal(r.status,status);assert.equal((await r.json()).ok,false);
    // Flag-off malformed/unbound input reaches the existing retired legacy
    // gate (410), not the secure JSON parser. Preserve that predecessor rule.
    if(status===410)assert.equal((await request(clientBase,path,options)).status,status);
  }
});

test('legacy WhatsApp invalid-input behavior remains unchanged with the SMS flag off',async()=>{
  for(const body of [{},{celular:'not-a-phone'},safeBody]){
    const options={method:'POST',headers:jsonHeaders,body,env:{NOVA_SMS_ENABLED:'false'}};
    const a=await request(clientBase,'/api/otp/enviar',options),b=await request(client,'/api/otp/enviar',options);assert.equal(b.status,a.status);assert.deepEqual(await b.json(),await a.json());
  }
});

test('CLIENTES document, registration, context and admin routes expose no customer data without credentials',async()=>{
  for(const [path,options]of [['/api/documentos',{method:'POST',headers:jsonHeaders,body:{}}],['/api/registro',{method:'POST',headers:jsonHeaders,body:{}}],['/api/registro/contexto',{}],['/api/admin/enlaces',{}],['/internal/nova-reference-source',{method:'POST',headers:jsonHeaders,body:{}}]]){
    const a=await request(clientBase,path,options),b=await request(client,path,options);assert.equal(b.status,a.status,path);assert.ok(b.status>=400,path);
    const actual=await b.text();assert.equal(actual,await a.text());assert.doesNotMatch(actual,/"(?:clientes|solicitudes|documentos|referencias)"\s*:/i);
  }
});

test('NOVA public health responses preserve safe predecessor semantics without a database or provider',async()=>{
  for(const path of ['/health','/pilot/health']){
    const a=await request(novaBase,path),b=await request(nova,path);assert.equal(b.status,a.status);assert.equal(b.status,200);assert.deepEqual(await b.json(),await a.json());
  }
});

test('NOVA supervision and management reject unauthenticated access before auth/source/network queries',async()=>{
  const env={NOVA_SUPERVISION_ENABLED:'true'};
  for(const path of ['/api/nova/supervision','/api/nova/gestion?solicitud=11111111-1111-4111-8111-111111111111']){
    const a=await request(novaBase,path,{env}),b=await request(nova,path,{env});assert.equal(b.status,a.status);assert.equal(b.status,401);assert.deepEqual(await b.json(),await a.json());
  }
});

test('NOVA allowed preflight returns an empty body; an untrusted origin cannot fetch supervision data',async()=>{
  const good=await request(nova,'/api/nova/supervision',{method:'OPTIONS',headers:{origin:'https://aura.crediteksas.com'}});assert.equal(good.status,204);assert.equal(await good.text(),'');
  const bad=await request(nova,'/api/nova/supervision',{headers:{origin:'https://untrusted.invalid'},env:{NOVA_SUPERVISION_ENABLED:'true'}});assert.equal(bad.status,403);assert.deepEqual(await bad.json(),{error:'ORIGIN_FORBIDDEN'});
});

test('NOVA retail portal serves only its public login shell, and case APIs require authentication',async()=>{
  const env={NOVA_RETAIL_ENABLED:'true'};
  const a=await request(novaBase,'/creditek/agentes/nova-supervision.html',{env}),b=await request(nova,'/creditek/agentes/nova-supervision.html',{env});
  assert.equal(b.status,200);const oldHtml=await a.text(),html=await b.text();assert.equal(b.headers.get('cache-control'),'no-store');
  // The patch intentionally adjusts client error messages inside this script;
  // the unauthenticated response remains the same empty login/workspace shell.
  const shell=s=>s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');assert.equal(shell(html),shell(oldHtml));
  assert.match(html,/<section id="workspace" hidden>/);assert.match(html,/<tbody id="cases"><\/tbody>/);assert.match(html,/<section id="detail" class="card" hidden><\/section>/);
  const api=await request(nova,'/api/retail',{method:'POST',headers:{'content-type':'application/json',origin:'https://aura.crediteksas.com'},body:{action:'list'},env});assert.ok([401,403].includes(api.status));assert.deepEqual(await api.json(),{error:'UNAUTHENTICATED'});
});

test('NOVA internal intake rejects missing credentials before parsing customer input or deferring messages',async()=>{
  const env={NOVA_REGISTRATION_INTAKE_ENABLED:'true',NOVA_REGISTRATION_INTAKE_TOKEN:'synthetic-server-secret-not-real',NOVA_RETAIL_ENABLED:'true'};
  const r=await request(nova,'/internal/registration-intake',{method:'POST',headers:{'content-type':'application/json'},body:{},env});assert.equal(r.status,401);assert.deepEqual(await r.json(),{error:'UNAUTHORIZED'});
  assert.equal(audit.deferred,0);
});

test.after(()=>{
  assert.deepEqual(audit.fetchAttempts,[]);assert.deepEqual(audit.ioAttempts,[]);assert.equal(audit.deferred,0);
  const receipt={checkedAt:new Date().toISOString(),node:process.version,artifacts:pinned,evaluatedCompleteWorkers:[...audit.evaluated].sort(),networkFetchAttempts:0,tcpUdpDnsFileIoAttempts:0,deferredJobs:0,nodeBuiltins:[...audit.requires].sort(),productionWrites:false,realProviderCalls:false,scope:'Runtime metrics only; test runner determines pass/fail. Complete frozen bundles with Cloudflare class stubs and closed I/O; no credentialed database/provider behavior or production execution'};
  fs.writeFileSync(new URL('tests/package-integration-runtime.json',root),JSON.stringify(receipt,null,2)+'\n');
});
