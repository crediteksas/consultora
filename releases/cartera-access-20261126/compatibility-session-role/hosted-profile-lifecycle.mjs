// Pure lifecycle logic; clients are supplied by the server-only caller.
export function validateSession(session,uid,sid,issuer){
 const c=JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url'));
 if(session.user.id!==uid||c.sub!==uid||!['authenticated','kora_cartera_session'].includes(c.role)||c.iss!==issuer||c.is_anonymous!==false||!Number.isSafeInteger(c.exp)||typeof c.session_id!=='string'||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(c.session_id)||c.session_id!==sid)throw Error('session scope');return c;
}
export async function revokeOwnSession({session,uid,sid,issuer,admin,client,now=Date.now()}){
 let c=validateSession(session,uid,sid,issuer);
 if(c.exp*1000<=now+30000){const r=await client.auth.refreshSession({refresh_token:session.refresh_token});if(r.error||!r.data.session)throw Error('refresh before cleanup failed');session=r.data.session;c=validateSession(session,uid,sid,issuer);}
 const{error}=await admin.auth.admin.signOut(session.access_token,'local');if(error)throw Error('local revocation failed');
 const probe=await client.auth.refreshSession({refresh_token:session.refresh_token});
 if(!probe.error||!['refresh_token_not_found','session_not_found'].includes(probe.error.code))throw Error('revocation not verified');
 return c.session_id;
}
