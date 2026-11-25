import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from '@playwright/test';

const root=process.cwd();
const read=file=>readFile(path.join(root,file),'utf8');
const sidebar=await read('creditek/erp/sidebar.js');
const template=sidebar.match(/main\.innerHTML = `(<header class="kora-topbar">[\s\S]*?<\/header>)`;/)[1];
const iconCode=sidebar.slice(sidebar.indexOf('  function koraStaticIcon('),sidebar.indexOf('  async function koraSha256('));
const icon=new Function(`${iconCode}; return koraStaticIcon;`)();
const storeCode=sidebar.slice(sidebar.indexOf('  function koraStoreHtml('),sidebar.indexOf('  function koraStaticIcon('));
const store=new Function('escapeHtml','nombreTienda',`${storeCode}; return koraStoreHtml;`)(text=>String(text),()=> 'Tienda de prueba');
const header=new Function('koraStaticIcon','escapeHtml','current','shellProductName','koraStoreHtml','profile','stores','roleLabel',`return \`${template}\`;`);
const renderHeader=withStore=>header(icon,text=>String(text),{label:'Resumen ejecutivo'},'KORA',withStore?store:()=>'',{nombre:'Perfil de prueba',rol:'gerencia'},[],'Gerencia');
const styles=['kora-product','kora-dashboard-premium','kora-shell','kora-responsive','kora-incident-center','creditek-liquid'];
const html=withStore=>`<!doctype html><html lang="es" data-creditek-visual="liquid-1"><head><meta name="viewport" content="width=device-width,initial-scale=1">${styles.map(name=>`<link rel="stylesheet" href="/design-system/components/${name}.css">`).join('')}<link rel="stylesheet" href="/creditek/erp/kora-finish.css"></head><body class="kora-product-page kora-responsive-ready" data-kora-dashboard="1.0.0" data-kora-finish="2026.11"><div class="kora-shell-root"><aside class="kora-sidebar"></aside><div class="kora-shell-main">${renderHeader(withStore)}<main class="kora-shell-content"><p>Prueba visual del encabezado</p></main></div></div></body></html>`;

async function pageFor(browser,withStore=false){
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.route('https://kora.test/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/header-test.html'||url.pathname==='/creditek/erp/gastos.html') return route.fulfill({contentType:'text/html',body:html(withStore)});
    const file=path.join(root,url.pathname);
    assert.ok(file.startsWith(root+path.sep));
    try{return await route.fulfill({body:await readFile(file),contentType:file.endsWith('.css')?'text/css':undefined});}
    catch{return route.abort();}
  });
  await page.goto('https://kora.test/header-test.html');
  // El exportador inserta el cuarto botón entre configuración y ayuda.
  await page.locator('[data-kora-help]').evaluate(el=>el.insertAdjacentHTML('beforebegin','<button class="kora-icon-button ghost" aria-label="Descargar informe"><svg width="24" height="24" aria-hidden="true"><path d="M6 3h12v18H6z" fill="none" stroke="currentColor"/></svg></button>'));
  return page;
}

test('el encabezado conserva completos el foco y el contador en móvil y escritorio',async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    for(const withStore of [false,true]){
      const page=await pageFor(browser,withStore);
      await page.locator('[data-kora-notifications]').evaluate(el=>el.insertAdjacentHTML('beforeend','<span class="kora-notifications-count">99+</span>'));
      for(const width of [320,360,390,430,1366]){
        await page.setViewportSize({width,height:844});
        if(withStore){
          const position=await page.locator('.kora-store').evaluate(el=>{
            const store=el.getBoundingClientRect(),button=el.parentElement.querySelector('.kora-icon-button').getBoundingClientRect();
            return {storeBottom:store.bottom,buttonTop:button.top,storeMiddle:store.top+store.height/2,buttonMiddle:button.top+button.height/2};
          });
          if(width<=360)assert.ok(position.storeBottom<=position.buttonTop,JSON.stringify({width,...position}));
          else assert.ok(Math.abs(position.storeMiddle-position.buttonMiddle)<1,JSON.stringify({width,...position}));
        }
        for(const button of await page.locator('.kora-topbar__actions .kora-icon-button').all()){
          await button.focus();
          const geometry=await button.evaluate(el=>{
            const r=el.getBoundingClientRect(),css=getComputedStyle(el);
            const row=el.closest(innerWidth<1024?'.kora-topbar__actions':'.kora-topbar').getBoundingClientRect();
            const ring=parseFloat(css.outlineWidth)+parseFloat(css.outlineOffset);
            return {width:innerWidth,top:r.top-ring,bottom:r.bottom+ring,left:r.left-ring,right:r.right+ring,rowTop:row.top,rowBottom:row.bottom,rowLeft:row.left,rowRight:row.right,outline:css.outlineStyle,documentWidth:document.documentElement.scrollWidth};
          });
          assert.notEqual(geometry.outline,'none');
          assert.ok(geometry.top>=geometry.rowTop-.5,JSON.stringify({withStore,...geometry}));
          assert.ok(geometry.bottom<=geometry.rowBottom+.5,JSON.stringify({withStore,...geometry}));
          assert.ok(geometry.left>=geometry.rowLeft-.5&&geometry.right<=geometry.rowRight+.5,JSON.stringify({withStore,...geometry}));
          assert.ok(geometry.documentWidth<=width+1);
        }
        assert.ok(await page.locator('.kora-notifications-count').evaluate(el=>{
          const badge=el.getBoundingClientRect(),row=el.closest(innerWidth<1024?'.kora-topbar__actions':'.kora-topbar').getBoundingClientRect();
          return badge.top>=row.top&&badge.bottom<=row.bottom&&badge.left>=row.left&&badge.right<=row.right;
        }));
      }
      await page.close();
    }
  }finally{await browser.close();}
});

test('los gastos nuevos aparecen en ambas campanas y resolverlos los retira sin escrituras',async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    for(const profile of [{id:'6de0ad26-64af-4966-8cd9-d468880af627',rol:'gerencia'},{id:'d1782db6-bacc-4caf-af6f-ce1b8d1c0391',rol:'auditoria'}]){
      const page=await pageFor(browser);
      await page.evaluate(()=>{
        window.expenses=[{estado:'registrado'},{estado:'registrado'},{estado:'aprobado'},{estado:'rechazado'}];
        window.calls=[];
        window.sb={rpc:async name=>{
          calls.push(name);
          if(['es_controlador_financiero','puede_autorizar_venta_excepcional'].includes(name))return {data:true};
          if(name==='listar_confirmaciones_deuda')return {data:{diarias:[],diferencias:[]}};
          if(name==='listar_rectificaciones_corozal')return {data:[]};
          if(['conteos_pendientes_cantidad','inventario_fotos_pendientes_cantidad'].includes(name))return {data:0};
          throw new Error('RPC inesperado: '+name);
        },from(table){
          calls.push(table);const filters=[];const q={
            select(){return q;},eq(k,v){filters.push([k,v]);return q;},in(){return q;},
            then(ok,bad){return Promise.resolve({count:table==='gastos'?expenses.filter(row=>filters.every(([k,v])=>row[k]===v)).length:table==='traslados'?1:0}).then(ok,bad);}
          };return q;
        }};
      });
      await page.addScriptTag({content:await read('creditek/erp/kora-notifications.js')});
      await page.evaluate(profile=>KoraNotifications.mount({sb,profile}),profile);
      const total=profile.rol==='gerencia'?2:3;
      await page.waitForFunction(total=>document.querySelector('[data-kora-notification-count]').textContent===String(total),total);
      await page.locator('[data-kora-notifications]').click();
      assert.equal(await page.locator('[data-pending="store-expenses"]').count(),1);
      assert.match(await page.locator('[data-pending="store-expenses"]').textContent(),/2 · Gastos de tiendas por aprobar/);
      assert.equal(await page.locator('[data-pending-owner="compartido"]').textContent(),'Gerencia y Gestión');
      assert.equal(await page.locator('[data-pending="transfers"]').count(),profile.rol==='gerencia'?0:1);
      await page.evaluate(()=>{expenses[0].estado='aprobado';expenses[1].estado='rechazado';document.dispatchEvent(new CustomEvent('kora-notifications-refresh'));});
      await page.waitForFunction(()=>!document.querySelector('[data-pending="store-expenses"]'));
      await page.evaluate(()=>{expenses.push({estado:'registrado'});document.dispatchEvent(new CustomEvent('kora-notifications-refresh'));});
      await page.waitForFunction(()=>document.querySelector('[data-pending="store-expenses"]'));
      assert.ok(await page.locator('.kora-notifications-panel').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;}));
      await page.keyboard.press('Escape');
      await page.locator('[data-kora-notifications]').focus();
      await page.keyboard.press('Enter');
      await page.locator('[data-pending="store-expenses"]').click();
      await page.waitForURL('https://kora.test/creditek/erp/gastos.html?pendientes=1');
      await page.close();
    }
  }finally{await browser.close();}
});
