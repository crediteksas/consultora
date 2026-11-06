import test from'node:test';import assert from'node:assert/strict';import{readExistingPosts,metaRead,readOptions,safePostLink,readFailure}from'./meta-existing-posts.mjs';
const stamp=Date.parse('2026-01-02T00:00:00Z'),connection={page_id:'100',instagram_id:'200'},ig={id:'201',caption:'Fictional post',timestamp:'2026-01-01T00:00:00Z',permalink:'https://www.instagram.com/p/fictional/',media_type:'IMAGE',like_count:0,comments_count:3};
const execute=(read,more={})=>readExistingPosts({channel:'instagram',connection,now:()=>stamp,read,...more});
test('lists existing media, preserves zero, no metrics fabrication, opaque cursor',async()=>{const calls=[];const r=await execute(async(p,q)=>{calls.push([p,q]);return p==='200/media'?{data:[ig],paging:{next:'https://graph.facebook.com/?access_token=DO_NOT_RETURN',cursors:{after:'next_1'}}}:{data:[{name:'reach',values:[{value:20}]},{name:'views',values:[{value:30}]}]}});assert.equal(r.rows[0].metrics.reactions,0);assert.equal(r.rows[0].metrics.shares,null);assert.equal(r.rows[0].metrics.views,30);assert.equal(r.nextCursor,'next_1');assert.equal(JSON.stringify(r).includes('DO_NOT_RETURN'),false);assert.deepEqual(calls.map(x=>x[0]),['200/media','201/insights']);assert.equal(r.writes,false)});
test('permissions failure keeps publication and marks unavailable, not zero',async()=>{const r=await execute(async p=>{if(p==='200/media')return{data:[ig]};throw Error('META_READ_PERMISSION_REQUIRED')});assert.equal(r.rows.length,1);assert.equal(r.rows[0].metrics.reach,null);assert.deepEqual(r.rows[0].unavailable,['PERMISSION_REQUIRED'])});
test('Facebook published own page only, reactions distinct from likes',async()=>{const r=await execute(async p=>p==='100/published_posts'?{data:[{id:'100_1',created_time:ig.timestamp,permalink_url:'https://facebook.com/100/posts/1',is_published:true,reactions:{summary:{total_count:7}}},{id:'999_1',created_time:ig.timestamp,is_published:true,permalink_url:'https://facebook.com/999/posts/1'}]}:{data:[]},{channel:'facebook'});assert.equal(r.rows.length,1);assert.equal(r.omitted,1);assert.equal(r.rows[0].metrics.reactions,7);assert.equal(r.rows[0].metrics.reach,null)});
test('reject malformed account, query and responses before or after bounded reads',async()=>{for(const channel of ['all','instagram/../feed'])await assert.rejects(execute(()=>assert.fail(),{channel}));assert.throws(()=>readOptions('https://example.invalid/?channel=instagram&after=https://evil.invalid'));await assert.rejects(execute(()=>assert.fail(),{connection:{instagram_id:'bad'}}));await assert.rejects(execute(async()=>({data:Array(11).fill(ig)})));await assert.rejects(execute(async()=>({data:null})));});
test('omits duplicates, unsafe links and future dates',async()=>{const r=await execute(async p=>p==='200/media'?{data:[ig,ig,{...ig,id:'202',permalink:'https://evil.invalid/x'},{...ig,id:'203',timestamp:'2099-01-01'}]}:{data:[]});assert.equal(r.rows.length,1);assert.equal(r.omitted,3)});
test('reject ambiguous insight arrays, negative values, looping cursor',async()=>{const r=await execute(async p=>p==='200/media'?{data:[ig],paging:{next:'ignored',cursors:{after:'same'}}}:{data:[{name:'reach',values:[{value:1},{value:2}]},{name:'views',values:[{value:-1}]},{name:'saved',values:[{value:1}]},{name:'saved',values:[{value:2}]}]},{after:'same'});assert.equal(r.rows[0].metrics.reach,null);assert.equal(r.rows[0].metrics.views,null);assert.equal(r.rows[0].metrics.saved,null);assert.equal(r.nextCursor,null);assert.equal(r.paginationIncomplete,true)});
test('dedicated transport only GET and fixed host with no token in URL',async()=>{let calls=0;const fake=async(u,o)=>{calls++;assert.equal(u.origin,'https://graph.facebook.com');assert.equal(u.searchParams.has('access_token'),false);assert.equal(o.method,'GET');assert.equal(o.redirect,'manual');return new Response(JSON.stringify({data:[]}))};await metaRead({},'fictional','200/media',{limit:10},fake);assert.equal(calls,1);for(const p of ['https://evil.invalid','200/media_publish','200/feed','200'])await assert.rejects(metaRead({},'fictional',p,{},()=>assert.fail()));await assert.rejects(metaRead({META_GRAPH_VERSION:'../bad'},'fictional','200/media',{},()=>assert.fail()));});
test('provider error details and token never returned',async()=>{await assert.rejects(metaRead({},'fictional','200/media',{},async()=>new Response(JSON.stringify({error:{code:200,message:'SECRET_TEXT'}}),{status:403})),e=>e.message==='META_READ_PERMISSION_REQUIRED');assert.equal(safePostLink('https://user:pass@instagram.com/p/x','instagram'),null)});

test('diagnostics expose only enum and numeric codes, never raw provider text',()=>{const r=readFailure({message:'secret token text',providerStatus:400,providerCode:100},'list');assert.deepEqual(r,{error:'META_READ_UNAVAILABLE',diagnostic:{reason:'UNKNOWN',stage:'list',providerStatus:400,providerCode:100}});assert.equal(readFailure({message:'META_RESPONSE_INVALID'},'connection').error,'META_READ_UNAVAILABLE');assert.equal(JSON.stringify(readFailure({message:'secret',providerCode:'secret'},'secret')).includes('secret'),false)});

test('diagnostic cause is separate from stable primary error and allowlisted',()=>{assert.equal(readFailure({message:'READ_CONFIG_INVALID'},'list').error,'META_READ_UNAVAILABLE');assert.equal(readFailure({message:'READ_CONFIG_INVALID'},'list').diagnostic.reason,'READ_CONFIG_INVALID');assert.equal(readFailure({message:'PRIVATE'},'list').diagnostic.reason,'UNKNOWN')});

test('Facebook denied engagement retries only bounded base fields, keeps cursor and missing counts',async()=>{
 const calls=[];const r=await execute(async(p,q)=>{calls.push([p,q]);if(calls.length===1)throw Error('META_READ_PERMISSION_REQUIRED');if(p==='100/published_posts')return{data:[{id:'100_1',created_time:ig.timestamp,permalink_url:'https://facebook.com/100/posts/1',is_published:true}]};return{data:[{name:'post_media_view',period:'lifetime',values:[{value:12}]}]}},{channel:'facebook',after:'next_1'});
 assert.equal(calls.length,7);assert.equal(calls[1][0],'100/published_posts');assert.deepEqual(calls[1][1],{fields:'id,message,created_time,permalink_url,is_published',limit:10,after:'next_1'});
 assert.equal(r.rows[0].metrics.views,12);for(const k of ['reactions','comments','shares'])assert.equal(r.rows[0].metrics[k],null);assert.deepEqual(r.rows[0].unavailable,['reactions','comments','shares','uniqueViewers']);assert.equal(r.writes,false);
});
test('base Facebook denial remains failure; no retries for Instagram or transport errors',async()=>{
 for(const [channel,error,max] of [['facebook','META_READ_PERMISSION_REQUIRED',2],['instagram','META_READ_PERMISSION_REQUIRED',1],['facebook','META_READ_UNAVAILABLE',1]]){let n=0;await assert.rejects(execute(async()=>{n++;throw Error(error)},{channel}),{message:error});assert.equal(n,max)}
});

const fb={id:'100_1',created_time:ig.timestamp,permalink_url:'https://facebook.com/100/posts/1',is_published:true};
test('independent Facebook fields retain permitted counts when comments fail, keep exact page and cursor',async()=>{
 const calls=[];const r=await execute(async(p,q)=>{calls.push([p,q]);if(p.endsWith('published_posts')){
 if(q.fields.includes('message')&&q.fields.includes('comments'))throw Error('META_READ_PERMISSION_REQUIRED');
 if(q.fields==='id,comments.limit(0).summary(true)')throw Error('META_READ_PERMISSION_REQUIRED');
 if(q.fields==='id,reactions.limit(0).summary(true)')return{data:[{id:fb.id,reactions:{summary:{total_count:0}}},{id:'999_1',reactions:{summary:{total_count:999}}}]};
 if(q.fields==='id,shares')return{data:[{id:fb.id,shares:{count:3}}]};return{data:[fb]};}
 return{data:[{name:q.metric,period:'lifetime',values:[{value:q.metric==='post_media_view'?40:25}]}]};},{channel:'facebook',after:'cursor_1'});
 assert.equal(calls.length,7);assert.ok(calls.slice(0,5).every(c=>c[1].after==='cursor_1'&&c[1].limit===10));
 assert.deepEqual(r.rows[0].metrics,{views:40,reach:null,reactions:0,comments:null,shares:3,saved:null,uniqueViewers:25});assert.deepEqual(r.rows[0].unavailable,['comments']);assert.equal(r.writes,false);
});
test('ambiguous supplemental IDs and malformed counts are not accepted',async()=>{
 const r=await execute(async(p,q)=>{if(p.endsWith('insights'))return{data:[]};if(q.fields.includes('comments')&&q.fields.includes('message'))throw Error('META_READ_PERMISSION_REQUIRED');if(q.fields==='id,reactions.limit(0).summary(true)')return{data:[{id:fb.id,reactions:{summary:{total_count:3}}},{id:fb.id,reactions:{summary:{total_count:4}}}]};if(q.fields==='id,shares')return{data:[{id:fb.id,shares:{count:'4'}}]};return{data:[fb]};},{channel:'facebook'});
 assert.equal(r.rows[0].metrics.reactions,null);assert.equal(r.rows[0].metrics.shares,null);
});
test('unsupported unique viewers cannot erase valid views or fabricate reach',async()=>{
 const r=await execute(async(p,q)=>{if(p.endsWith('published_posts'))return{data:[fb]};if(q.metric==='post_total_media_view_unique')throw Error('META_READ_UNAVAILABLE');return{data:[{name:'post_media_view',period:'lifetime',values:[{value:0}]}]};},{channel:'facebook'});assert.equal(r.rows[0].metrics.views,0);assert.equal(r.rows[0].metrics.reach,null);assert.equal(r.rows[0].metrics.uniqueViewers,null);
});
test('unique viewers reject wrong period and ambiguous lifetime samples',async()=>{
 for(const data of [[{name:'post_total_media_view_unique',period:'day',values:[{value:9}]}],[{name:'post_total_media_view_unique',period:'lifetime',values:[{value:9},{value:10}]}]]){
 const r=await execute(async(p,q)=>p.endsWith('published_posts')?{data:[fb]}:{data},{channel:'facebook'});assert.equal(r.rows[0].metrics.uniqueViewers,null);}
});

test('Facebook lifetime total_value response supported and day data never substitutes lifetime',async()=>{
 const r=await execute(async(p,q)=>{if(p.endsWith('published_posts'))return{data:[fb]};assert.equal(q.period,'lifetime');return{data:[{name:q.metric,period:'day',total_value:{value:99}},{name:q.metric,period:'lifetime',total_value:{value:q.metric==='post_media_view'?0:10}}]};},{channel:'facebook'});
 assert.equal(r.rows[0].metrics.views,0);assert.equal(r.rows[0].metrics.uniqueViewers,10);
 const missing=await execute(async(p,q)=>p.endsWith('published_posts')?{data:[fb]}:{data:[{name:q.metric,period:'day',total_value:{value:99}}]},{channel:'facebook'});assert.equal(missing.rows[0].metrics.views,null);assert.equal(missing.rows[0].metrics.uniqueViewers,null);
});
