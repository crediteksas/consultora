// Server-only bounded verification; account scope is a protected external file.
// No emails/password changes. A generated link invalidates a pending magic link
// and verified login updates last_sign_in_at. Never puts an admin key in browser.
import{execFileSync}from'node:child_process';import{readFileSync,writeFileSync,mkdirSync,chmodSync,unlinkSync,existsSync}from'node:fs';import{resolve,join}from'node:path';import{createHash}from'node:crypto';import{createClient}from'@supabase/supabase-js';
import{validateSession,revokeOwnSession}from'./hosted-profile-lifecycle.mjs';
const ref='jfkmiyvcdfbsbwchyvol',url='https://'+ref+'.supabase.co',origin='https://kora.crediteksas.com',storageKey='sb-'+ref+'-auth-token';
const [mode,scopeFile,outPath]=process.argv.slice(2),newlyCreated=[];let admin,publicKey,ownedOut,verifiedReceipt;
const options={auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}};
const validate=(session,uid,sid)=>validateSession(session,uid,sid,url+'/auth/v1');
const revoke=(session,uid,sid)=>revokeOwnSession({session,uid,sid,issuer:url+'/auth/v1',admin,client:createClient(url,publicKey,options)});

try{
 if(!['create-own-test-sessions','cleanup-own-test-sessions'].includes(mode))throw Error('mode');
 const input=readFileSync(scopeFile),scope=JSON.parse(input),out=resolve(outPath);
 // Labels describe the three verified business participants, not three operator
 // table rows. Only the first is assigned the dedicated SQL/JWT operator role.
 if(scope.project!==ref||scope.users.length!==3||new Set(scope.users.map(u=>u.id)).size!==3||JSON.stringify(scope.users.map(u=>u.capability))!=='["manage","manage","authorizer"]')throw Error('scope');
 if(!out.startsWith('/Users/oscarm/.codex/visualizations/'))throw Error('private output required');
 const raw=JSON.parse(execFileSync('supabase',['projects','api-keys','--project-ref',ref,'--reveal','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
 const keys=Array.isArray(raw)?raw:(raw.api_keys||raw.keys||[]),secret=keys.find(k=>k.name==='service_role'&&!k.disabled)||keys.find(k=>k.type==='secret'&&!k.disabled),pub=keys.find(k=>k.name==='anon'&&!k.disabled)||keys.find(k=>k.type==='publishable'&&!k.disabled);
 const key=k=>k?.api_key||k?.key;if(!key(secret)||!key(pub))throw Error('keys');publicKey=key(pub);admin=createClient(url,key(secret),options);
 const checksum=createHash('sha256').update(input).digest('hex');
 if(mode==='cleanup-own-test-sessions'){
  const path=join(out,'private-receipt.json'),receipt=JSON.parse(readFileSync(path));
  if(receipt.scope_sha256!==checksum||receipt.sessions.length!==3||receipt.sessions.some((x,i)=>x.user_id!==scope.users[i].id))throw Error('receipt');
  ownedOut=out;verifiedReceipt=receipt;
  for(let i=0;i<3;i++){
   if(receipt.sessions[i].revoked===true)continue;
   let session=JSON.parse(readFileSync(join(out,'session-'+i+'.json')));const latest=join(out,'browser-state-latest-'+i+'.json');
   if(existsSync(latest)){const state=JSON.parse(readFileSync(latest));const item=state.origins.find(o=>o.origin===origin)?.localStorage.find(x=>x.name===storageKey);if(!item)throw Error('latest own browser state absent');session=JSON.parse(item.value);}
   await revoke(session,scope.users[i].id,receipt.sessions[i].session_id);
   receipt.sessions[i].revoked=true;writeFileSync(path,JSON.stringify(receipt)+'\n',{mode:0o600});
   for(const f of['session-'+i+'.json','browser-state-'+i+'.json','browser-state-latest-'+i+'.json'])if(existsSync(join(out,f)))unlinkSync(join(out,f));
  }
  writeFileSync(join(out,'cleanup-receipt.json'),JSON.stringify({own_sessions_revoked:receipt.sessions.filter(s=>s.revoked).length,own_sessions_pending:0,scope_sha256:checksum,other_sessions_revoked:0,external_sends:0})+'\n',{mode:0o600});
 }else{
  if(existsSync(out))throw Error('test output must be a new directory');mkdirSync(out,{recursive:true,mode:0o700});ownedOut=out;chmodSync(out,0o700);const results=[];
  for(const u of scope.users){const{data,error}=await admin.auth.admin.getUserById(u.id);if(error||data.user?.id!==u.id||data.user.email?.toLowerCase()!==u.email.toLowerCase()||!['authenticated','kora_cartera_session'].includes(data.user.role)||Date.parse(data.user.banned_until||0)>Date.now())throw Error('identity unavailable');results.push({role:data.user.role});}
  for(let i=0;i<3;i++){
   const target=scope.users[i],{data:link,error:linkError}=await admin.auth.admin.generateLink({type:'magiclink',email:target.email});
   if(linkError||link.user?.id!==target.id||!link.properties?.hashed_token)throw Error('link');
   const client=createClient(url,publicKey,options),{data,error}=await client.auth.verifyOtp({type:'email',token_hash:link.properties.hashed_token});
   let created=null;
   if(data?.session){let sid=null;try{sid=JSON.parse(Buffer.from(data.session.access_token.split('.')[1],'base64url')).session_id??null;}catch{}created={session:data.session,i,uid:data.session.user?.id??target.id,sid,paths:[]};newlyCreated.push(created);}
   if(error||!data?.session||data.user?.id!==target.id)throw Error('session');
   const session=data.session,c=validate(session,target.id,created.sid);if(c.role!==results[i].role)throw Error('role');
   const verified=await client.auth.getUser(session.access_token);if(verified.error||verified.data.user?.id!==target.id)throw Error('server verification');
   const save=(f,body)=>{const path=join(out,f);writeFileSync(path,JSON.stringify(body),{mode:0o600,flag:'wx'});created.paths.push(path);};
   save('session-'+i+'.json',session);save('browser-state-'+i+'.json',{cookies:[],origins:[{origin,localStorage:[{name:storageKey,value:JSON.stringify(session)}]}]});
   results[i]={...results[i],user_id:target.id,session_id:c.session_id,expires_in:session.expires_in,expires_at:c.exp,created:true,revoked:false};
  }
  writeFileSync(join(out,'private-receipt.json'),JSON.stringify({scope_sha256:checksum,sessions:results,created_at:new Date().toISOString(),external_sends:0,password_changes:0,admin_keys_in_browser:false})+'\n',{mode:0o600,flag:'wx'});
 }
 console.log(JSON.stringify({ok:true,mode,scoped_profiles:3,external_sends:0,credentials_logged:false}));
}catch{
 const pending=[];
 if(mode==='cleanup-own-test-sessions'&&verifiedReceipt)for(const r of verifiedReceipt.sessions)if(!r.revoked)pending.push({user_id:r.user_id,session_id:r.session_id});
 for(const item of newlyCreated){try{await revoke(item.session,item.uid,item.sid);for(const p of item.paths)unlinkSync(p);}catch{pending.push({user_id:item.uid,session_id:item.sid,paths:item.paths});}}
 if(ownedOut)try{writeFileSync(join(ownedOut,'pending-cleanup-'+mode+'-'+Date.now()+'.json'),JSON.stringify({own_sessions_pending:pending,cleanup_mode_failed:mode==='cleanup-own-test-sessions',verified_revoked_only:true})+'\n',{mode:0o600,flag:'wx'});}catch{}
 console.error('Bounded hosted verification stopped. Only verified own-session revocations count; unresolved sessions and files are retained in protected receipts. No identity or credential logged.');process.exitCode=1;
}
