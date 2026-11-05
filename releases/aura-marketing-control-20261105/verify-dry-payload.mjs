import{readFile,writeFile}from'node:fs/promises';import assert from'node:assert/strict';import{createHash}from'node:crypto';
const result=[];for(const [name,file]of [['creditek-aura-shell','shell'],['aura-campaign-view','campaign'],['aura-meta-ads-api','api']]){
const config=JSON.parse(await readFile('deployment-review/'+name+'.json'));const bytes=await readFile('deployment-review/'+file+'-upload.multipart');const boundary=bytes.toString().split('\r\n')[0].slice(2);const form=await new Response(bytes,{headers:{'content-type':'multipart/form-data; boundary='+boundary}}).formData();const metadata=JSON.parse(form.get('metadata'));
for(const [key,value]of Object.entries(config.unsafe.metadata))assert.deepEqual(metadata[key],value,key);
assert.deepEqual(metadata.bindings,[]);assert.equal(metadata.assets,undefined);assert.equal(metadata.migrations,undefined);
const module=form.get(metadata.main_module);assert.ok(module);const uploaded=Buffer.from(await module.arrayBuffer());const source=await readFile(new URL(config.main,new URL('file://'+process.cwd()+'/deployment-review/')));assert.ok(uploaded.equals(source));
result.push({worker:name,metadataMatches:true,moduleExact:true,noAssetUpload:true,noMigrations:true,retainedBindingTypes:metadata.keep_bindings,sha256:createHash('sha256').update(uploaded).digest('hex')});}
await writeFile('deployment-review/payload-verification.json',JSON.stringify({at:new Date().toISOString(),dryRunOnly:true,providerAcceptanceNotTested:true,results:result},null,2));console.log('3 multipart payloads verified; no provider upload or deployment');
