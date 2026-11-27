import test from'node:test';import assert from'node:assert/strict';import{validateSession,revokeOwnSession}from'./hosted-profile-lifecycle.mjs';
const uid='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222',issuer='https://fixture.invalid/auth/v1';
const session=(exp=1000,extra={})=>({access_token:'fiction.'+Buffer.from(JSON.stringify({sub:uid,session_id:sid,exp,role:'authenticated',iss:issuer,is_anonymous:false,...extra})).toString('base64url')+'.fiction',refresh_token:'fiction-refresh',user:{id:uid}});
function fixture(replies,logoutError=null){const calls=[];return{calls,admin:{auth:{admin:{async signOut(token,scope){calls.push(['logout',scope]);return{error:logoutError};}}}},client:{auth:{async refreshSession(p){calls.push(['refresh',p.refresh_token]);return replies.shift();}}}};}
test('own-session cleanup refreshes an expired token and verifies local logout',async()=>{
 const f=fixture([{data:{session:session(2000)}},{error:{code:'refresh_token_not_found'}}]);assert.equal(await revokeOwnSession({session:session(900),uid,sid,issuer,now:1000000,...f}),sid);assert.deepEqual(f.calls.map(x=>x[0]),['refresh','logout','refresh']);assert.equal(f.calls[1][1],'local');
});
test('cleanup refuses expired-token logout errors, unknown network failure and still-valid refresh',async()=>{
 for(const [reply,error]of [[{error:{code:'refresh_token_not_found'}},{status:401}],[{error:{code:'network_error'}},null],[{data:{session:session(3000)}},null]]){const f=fixture([reply],error);await assert.rejects(revokeOwnSession({session:session(2000),uid,sid,issuer,now:1000000,...f}));}
});
test('refresh must preserve the exact own user and session; stale browser state cannot revoke another device',async()=>{
 const f=fixture([{data:{session:session(2000,{session_id:'33333333-3333-4333-8333-333333333333'})}}]);await assert.rejects(revokeOwnSession({session:session(900),uid,sid,issuer,now:1000000,...f}));assert.deepEqual(f.calls.map(x=>x[0]),['refresh']);
 assert.throws(()=>validateSession(session(2000,{role:'service_role'}),uid,sid,issuer));
});

test('null, empty or missing session id never widens cleanup to another device',async()=>{
 for(const bad of[null,'',undefined]){const f=fixture([]);await assert.rejects(revokeOwnSession({session:session(2000),uid,sid:bad,issuer,now:1000000,...f}));assert.equal(f.calls.length,0);}
});
