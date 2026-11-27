const{chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const R=__dirname,checks=[],errors=[],external=[];
(async()=>{const b=await chromium.launch({channel:'chrome',headless:true});try{
 for(const width of[390,1440])for(const role of['gerencia','cartera']){
  const p=await b.newPage({viewport:{width,height:1000}});p.on('pageerror',e=>errors.push(String(e)));await p.route('**/*',route=>{if(!route.request().url().startsWith('file://')){external.push(route.request().url());return route.abort();}return route.continue();});
  await p.goto('file://'+R+'/preview/index.html?perfil='+role);await p.locator('#portfolioContent table').waitFor();
  for(const tab of['portfolio','nova','cobra','promises','history','quality','performance']){
   await p.locator('[data-tab="'+tab+'"]').click();
   assert.equal(await p.locator('.panel.active').count(),1);assert.equal(await p.locator('.panel.active').getAttribute('id'),tab);
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'page overflow '+width+'/'+role+'/'+tab);
  }
  await p.locator('[data-tab="quality"]').click();await p.locator('#q-cut option').nth(1).waitFor({state:'attached'});
  await p.locator('#q-cut').selectOption({index:1});await p.locator('#q-snapshot').waitFor({state:'visible'});
  assert.equal(await p.locator('#q-import').isVisible(),role==='gerencia');
  await p.locator('#ce-current').selectOption({index:1});await p.locator('#ce-compare').click();await p.getByText('Comparación lista. No se registraron pagos.',{exact:true}).waitFor();
  await p.getByRole('button',{name:'Provisiones',exact:true}).click();await p.getByText('Fondo pendiente de conciliación. No se puede autorizar dinero todavía.',{exact:true}).waitFor();
  assert.equal(await p.locator('#ce-reconcile').isVisible(),role==='gerencia');
  await p.screenshot({path:path.join(R,'preview',`${role}-${width}.png`),fullPage:false});
  await p.getByRole('button',{name:'Comparación semanal',exact:true}).click();await p.locator('#q-query').focus();
  const bounds=await p.locator('#q-query').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1);
  await p.locator('[data-quality-operation]').first().click();await p.locator('#q-dialog').waitFor({state:'visible'});
  const dialog=await p.locator('#q-dialog').boundingBox();assert.ok(dialog.x>=0&&dialog.x+dialog.width<=width+1&&dialog.y>=0&&dialog.y+dialog.height<=1001);
  await p.keyboard.press('Escape');await p.locator('#q-dialog').waitFor({state:'hidden'});
  checks.push({width,role,seven_panels:true,page_overflow:false,cut_comparison:true,controls_within_viewport:true,restricted_controls_hidden:role==='cartera',native_dialog_within_viewport:true});
  await p.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 fs.writeFileSync(path.join(R,'preview/browser-receipt.json'),JSON.stringify({ok:true,checks,page_errors:errors,external_requests:external,scope:'Fictional local rendering only; no real account, writes, managed API or Safari certification.'},null,2));console.log(JSON.stringify({ok:true,viewports:[390,1440],profiles:['gerencia','cartera'],checks:checks.length,production_writes:0}));
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
