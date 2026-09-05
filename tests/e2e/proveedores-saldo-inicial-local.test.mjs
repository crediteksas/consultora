// Local QA only: real Proveedores markup, handlers, KORA and Tailwind 2.2.19.
// No authentication, Supabase SDK, production requests, real files or real debts.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium, expect} from '@playwright/test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const pagePath = '/creditek/erp/proveedores.html';
const tailwindUrl = 'https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css';
const scripts = [
  '/creditek/erp/proveedores-domain.js',
  '/creditek/erp/proveedores-saldo-inicial.js',
  '/design-system/components/kora-product.js',
];
const contentTypes = {'.css':'text/css', '.woff2':'font/woff2', '.woff':'font/woff', '.svg':'image/svg+xml', '.png':'image/png'};
const pdf = {
  name: 'qa-soporte-sintetico.pdf', mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF'),
};

function localServer(html) {
  return createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const file = path.resolve(root, `.${pathname}`);
      const type = pathname === pagePath ? 'text/html; charset=utf-8'
        : scripts.includes(pathname) ? 'text/javascript; charset=utf-8' : contentTypes[path.extname(pathname)];
      if (request.method !== 'GET' || !file.startsWith(root) || !type) {
        response.writeHead(404).end(); return;
      }
      response.setHeader('Content-Type', type);
      response.end(pathname === pagePath ? html : await readFile(file));
    } catch (_) { response.writeHead(404).end(); }
  });
}

test('Saldo inicial: modal adaptable, errores visibles y reintento sin repetir soporte', {timeout:120000}, async t => {
  const original = await readFile(path.join(root, pagePath), 'utf8');
  assert.ok(original.includes(tailwindUrl), 'usa el CSS exacto Tailwind 2.2.19 de la página');
  const inline = [...original.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .find(([, attributes, source]) => !/\bsrc\s*=/.test(attributes) && source.includes('function registrarSaldoInicial'))?.[2];
  assert.ok(inline, 'la prueba ejecuta el manejador real, no una copia');
  const bootAt = inline.indexOf('// BOOT');
  assert.ok(bootAt > 0 && inline.slice(bootAt).includes('verificarAuth()'), 'se aísla únicamente el arranque autenticado');
  const html = original.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const server = localServer(html);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({channel:'chrome', headless:true});
    const page = await browser.newPage({viewport:{width:390,height:900}});
    page.setDefaultTimeout(10000);
    const origin = `http://127.0.0.1:${server.address().port}`;
    const errors = [], rejected = [];
    let tailwindLoaded = false;
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (response.url() === tailwindUrl && response.ok()) tailwindLoaded = true;
    });
    await page.route('**/*', route => {
      const request = route.request(), url = new URL(request.url());
      const publicAsset = request.method() === 'GET' && (
        url.href === tailwindUrl || ['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname)
        || url.href === 'https://unpkg.com/lucide@1.27.0/dist/umd/lucide.min.js'
      );
      if ((url.origin === origin && request.method() === 'GET') || publicAsset) return route.continue();
      rejected.push({url:request.url(),method:request.method()});
      return route.abort();
    });
    await page.goto(origin + pagePath, {waitUntil:'networkidle'});
    assert.equal(tailwindLoaded, true, 'Tailwind real debe cargar: no se sustituye por estilos aproximados');
    await page.evaluate(() => {
      const provider = {id:'qa-provider',nombre:'PROVEEDOR SINTÉTICO DE PRUEBAS · NO ES UNA DEUDA REAL',nit:'QA-000',contacto:'Contacto de prueba',telefono:'0000000000',activo:true};
      window.qa = {
        calls:[], uploadError:null, rpcErrorsLeft:0, holdUpload:false, releaseUpload:null, registered:false,
        reset(options = {}) {
          Object.assign(this,{calls:[],uploadError:null,rpcErrorsLeft:0,holdUpload:false,releaseUpload:null,registered:false},options);
        },
      };
      window.SB = {
        auth: {getSession:() => {throw new Error('El QA local no debe autenticar');}},
        from(table) {
          if (!['proveedores','facturas_proveedor'].includes(table)) throw new Error(`Tabla no permitida en QA: ${table}`);
          const q = {select(){return q;},order(){return q;},eq(){return q;},then(resolve,reject){
            const data = table === 'proveedores' ? [provider] : window.qa.registered ? [{id:'qa-invoice',proveedor_id:provider.id,numero:'QA-SIN-DATOS-REALES',total:17,saldo:17,fecha:'2026-09-01',fecha_vencimiento:null,origen_registro:'saldo_inicial'}] : [];
            return Promise.resolve({data,error:null}).then(resolve,reject);
          }};
          return q;
        },
        storage: {from(bucket) {return {upload:async (filePath,file,options) => {
          window.qa.calls.push({kind:'upload',bucket,filePath,name:file.name,type:file.type,size:file.size,options});
          if (window.qa.holdUpload) await new Promise(resolve => {window.qa.releaseUpload=resolve;});
          return window.qa.uploadError ? {data:null,error:{message:window.qa.uploadError}} : {data:{path:filePath},error:null};
        }};}},
        async rpc(name,args) {
          if (name !== 'registrar_saldo_inicial_proveedor') throw new Error(`RPC no permitida en QA: ${name}`);
          window.qa.calls.push({kind:'rpc',name,args});
          if (window.qa.rpcErrorsLeft > 0) {
            window.qa.rpcErrorsLeft--;
            return {data:null,error:{message:'Fallo simulado de registro; no hubo deuda real'}};
          }
          window.qa.registered=true;
          return {data:{ok:true,reutilizado:false,factura_id:'qa-invoice'},error:null};
        },
      };
    });
    for (const script of scripts) await page.addScriptTag({url:origin+script});
    await page.addScriptTag({content:inline.slice(0,bootAt) + `
      window.mountProveedoresQa = async () => {
        usuarioActual={id:'qa-user',email:'qa@example.invalid'};rolActual='auditoria';
        document.getElementById('app').classList.remove('hidden');
        await cargarProveedores();
      };
      window.resetProveedoresQa = async (options) => {
        cerrarSaldoInicial();window.qa.reset(options);
        document.getElementById('toast').classList.add('hidden');
        await cargarProveedores();
      };
    `});
    await page.evaluate(() => window.mountProveedoresQa());
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.evaluate(() => [...document.fonts].some(font => font.family.replaceAll('"','') === 'Inter' && font.status === 'loaded')),true,'la fuente Inter real carga, no sólo su nombre CSS');
    assert.equal(await page.evaluate(() => typeof window.supabase), 'undefined', 'no hay SDK real ni sesión productiva');
    await expect(page.locator('body')).toHaveClass(/kora-product-page/);

    const modal = page.locator('#modal-saldo-inicial');
    const status = page.locator('#saldo-inicial-estado');
    const submit = page.locator('#btn-guardar-saldo-inicial');
    const fill = async () => {
      await page.locator('#saldo-inicial-fecha').fill('2026-09-01');
      await page.locator('#saldo-inicial-monto').fill('17');
      await page.locator('#saldo-inicial-referencia').fill('QA-SIN-DATOS-REALES');
      await page.locator('#saldo-inicial-soporte').setInputFiles(pdf);
    };
    const open = async () => {
      await page.locator('[data-saldo-inicial="qa-provider"]').click();
      await expect(modal).toBeVisible();
    };
    for (const width of [390,768,1100,1440]) {
      await t.test(`${width}px: campos completos y capas por encima de la tabla`, async () => {
        await page.setViewportSize({width,height:900});
        await page.evaluate(() => window.resetProveedoresQa());
        await open();
        await page.locator('#saldo-inicial-fecha').scrollIntoViewIfNeeded();
        const layout = await page.evaluate(() => {
          const modal=document.getElementById('modal-saldo-inicial'),panel=modal.querySelector('section');
          const field=document.getElementById('saldo-inicial-fecha'),rect=field.getBoundingClientRect();
          const hit=document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2);
          const m=modal.getBoundingClientRect(),p=panel.getBoundingClientRect();
          return {modalZ:Number(getComputedStyle(modal).zIndex),headerZ:Number(getComputedStyle(document.querySelector('thead th')).zIndex),
            hitModal:Boolean(hit?.closest('#modal-saldo-inicial')),left:p.left,right:p.right,top:p.top,bottom:p.bottom,
            viewportWidth:innerWidth,viewportHeight:innerHeight,modalWidth:m.width,
            overflow:[panel,...modal.querySelectorAll('label')].filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.textContent.slice(0,100)),
            font:getComputedStyle(panel).fontFamily};
        });
        assert.ok(layout.modalZ>layout.headerZ,JSON.stringify(layout));
        assert.equal(layout.hitModal,true,'el encabezado no intercepta el campo fecha');
        assert.ok(layout.left>=0&&layout.right<=width+1&&layout.top>=0&&layout.bottom<=900+1,JSON.stringify(layout));
        assert.deepEqual(layout.overflow,[],'panel y etiquetas no desbordan lateralmente');
        assert.match(layout.font,/Inter/,'se conserva la tipografía KORA');
        if(process.env.KORA_SCREENSHOT_DIR){
          await mkdir(process.env.KORA_SCREENSHOT_DIR,{recursive:true});
          await page.screenshot({path:path.join(process.env.KORA_SCREENSHOT_DIR,`proveedores-saldo-inicial-${width}-inicial.png`)});
        }
        await submit.click();
        await expect(status).toBeVisible();
        await expect(status).toHaveAttribute('role','alert');
        await expect(status).toHaveAttribute('tabindex','-1');
        assert.ok((await status.textContent()).trim(),'la validación muestra qué falta dentro del modal');
        assert.equal(await page.evaluate(()=>window.qa.calls.length),0,'los campos incompletos no suben soporte ni generan saldo');
        await page.evaluate(()=>toast('Aviso QA visible sobre el modal','error'));
        const toastLayer=await page.locator('#toast').evaluate(e=>{
          const r=e.getBoundingClientRect(),hit=document.elementFromPoint(Math.min(innerWidth-1,r.left+r.width/2),r.top+r.height/2);
          return {z:Number(getComputedStyle(e).zIndex),visibleHit:Boolean(hit?.closest('#toast'))};
        });
        assert.ok(toastLayer.z>layout.modalZ,'el aviso tiene capa superior al modal');
        assert.equal(toastLayer.visibleHit,true,'el fondo del modal no tapa la notificación');
        if(process.env.KORA_SCREENSHOT_DIR){
          await mkdir(process.env.KORA_SCREENSHOT_DIR,{recursive:true});
          await page.screenshot({path:path.join(process.env.KORA_SCREENSHOT_DIR,`proveedores-saldo-inicial-${width}.png`)});
        }
        await page.locator('#btn-cancelar-saldo-inicial').click();
        await expect(modal).toBeHidden();
      });
    }

    await t.test('Tab permanece dentro del diálogo y Escape devuelve el foco',async()=>{
      await page.setViewportSize({width:768,height:900});
      await page.evaluate(()=>window.resetProveedoresQa());
      const overflow=await page.evaluate(()=>document.body.style.overflow);
      await open();
      await expect(page.locator('#saldo-inicial-fecha')).toBeFocused();
      await page.keyboard.press('Shift+Tab');await expect(submit).toBeFocused();
      await page.keyboard.press('Tab');await expect(page.locator('#saldo-inicial-fecha')).toBeFocused();
      await page.keyboard.press('Escape');await expect(modal).toBeHidden();
      await expect(page.locator('[data-saldo-inicial="qa-provider"]')).toBeFocused();
      assert.equal(await page.evaluate(()=>document.body.style.overflow),overflow,'restaura el desplazamiento previo');
      assert.equal(await page.evaluate(()=>window.qa.calls.length),0);
    });

    await t.test('fallo de soporte visible, persistente y sin llamada de registro',async()=>{
      await page.setViewportSize({width:390,height:900});
      await page.evaluate(()=>window.resetProveedoresQa({uploadError:'Fallo simulado de soporte PDF'}));
      await open();await fill();await submit.click();
      await expect(status).toContainText(/Fallo simulado de soporte PDF/);
      await expect(submit).toBeEnabled();await expect(modal).toBeVisible();
      assert.deepEqual(await page.evaluate(()=>window.qa.calls.map(c=>c.kind)),['upload']);
      await page.waitForTimeout(3500); // Outlives the existing 3200 ms transient toast.
      await expect(status).toBeVisible();await expect(status).toContainText(/Fallo simulado de soporte PDF/);
      if(process.env.KORA_SCREENSHOT_DIR){
        await submit.scrollIntoViewIfNeeded();
        await page.screenshot({path:path.join(process.env.KORA_SCREENSHOT_DIR,'proveedores-saldo-inicial-390-error-soporte.png')});
      }
    });

    await t.test('PDF en memoria y error RPC: reintento conserva soporte e idempotencia',async()=>{
      await page.evaluate(()=>window.resetProveedoresQa({rpcErrorsLeft:1,holdUpload:true}));
      await open();await fill();await submit.click();
      await page.waitForFunction(()=>typeof window.qa.releaseUpload==='function');
      await expect(submit).toBeDisabled();
      await expect(status).toHaveAttribute('role','status');
      await expect(page.locator('#form-saldo-inicial')).toHaveAttribute('aria-busy','true');
      for(const id of ['saldo-inicial-fecha','saldo-inicial-monto','saldo-inicial-referencia','saldo-inicial-soporte'])await expect(page.locator('#'+id)).toBeDisabled();
      await page.evaluate(()=>document.getElementById('form-saldo-inicial').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
      assert.equal(await page.evaluate(()=>window.qa.calls.length),1,'un segundo envío mientras carga no duplica la operación');
      await page.evaluate(()=>{window.qa.holdUpload=false;window.qa.releaseUpload();});
      await expect(status).toContainText(/Fallo simulado de registro/);
      await expect(submit).toBeEnabled();await expect(page.locator('#saldo-inicial-monto')).toBeEnabled();
      await expect(page.locator('#form-saldo-inicial')).toHaveAttribute('aria-busy','false');
      await expect(modal).toBeVisible();
      await submit.click();await expect(modal).toBeHidden();
      const calls=await page.evaluate(()=>window.qa.calls),uploads=calls.filter(c=>c.kind==='upload'),rpcs=calls.filter(c=>c.kind==='rpc');
      assert.equal(uploads.length,1,'no vuelve a subir un PDF ya cargado al reintentar el RPC');
      assert.equal(rpcs.length,2);
      assert.equal(uploads[0].name,pdf.name);assert.equal(uploads[0].type,'application/pdf');
      assert.equal(rpcs[0].args.p_monto,17,'se usan únicamente importes sintéticos');
      assert.ok(rpcs[0].args.p_idempotency_key);
      assert.equal(rpcs[1].args.p_idempotency_key,rpcs[0].args.p_idempotency_key);
      assert.equal(rpcs[1].args.p_soporte_path,rpcs[0].args.p_soporte_path);
      assert.deepEqual(rpcs[1].args,rpcs[0].args,'el reintento mantiene el mismo registro y soporte');
      await expect(page.getByText('Saldo inicial cargado',{exact:true})).toBeVisible();
    });
    assert.deepEqual(errors,[],'sin errores JavaScript');
    assert.deepEqual(rejected,[],'ningún intento de conexión productiva ni petición fuera de los recursos permitidos');
  } finally {
    await browser?.close();
    await new Promise(resolve=>server.close(resolve));
  }
});
