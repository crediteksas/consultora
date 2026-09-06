import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

test('el componente real de Caja muestra el ajuste y el cierre original a 390, 768 y 1280 px', async () => {
  const html = await readFile(new URL('../../creditek/erp/caja.html', import.meta.url), 'utf8');
  // Prueba del componente, sin login ni servicios externos. Se conserva el
  // HTML/CSS y cargarCuadrito reales; únicamente se sustituyen sus datos.
  const script = html.match(/<script>\nconst KORA_ENV[\s\S]*?<\/script>/)[0].slice(8,-9);
  const pageHtml = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
    .replace(/<link\b[^>]*>/g, '');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [390,768,1280]) {
      const page = await browser.newPage({ viewport:{width,height:900} });
      await page.setContent(pageHtml);
      await page.evaluate(() => {
        const query = {select(){return this;},eq(){return this;},async maybeSingle(){return {data:{nombre:'Móvil Shopping'}};}};
        window.__KORA_ENV__ = {KORA_ERP_SUPABASE_URL:'https://example.invalid',KORA_ERP_SUPABASE_ANON_KEY:'fixture'};
        window.supabase = {createClient:()=>({from:()=>query,auth:{getSession:async()=>({data:{session:null}})}})};
      });
      await page.addScriptTag({content:script});
      await page.evaluate(async () => {
        currentPerfil = {rol:'admin_tienda',tienda_codigo:'TEST-A'};
        calcularCuadrito = async () => ({telefonos:[],accesorios:[],creditosDelDia:[],gastos:[],movimientosCaja:[],
          apertura:2990900,aperturaCierreAnterior:4490900,ajusteArrastre:-1500000,totalContado:712000,
          totalFinanciado:0,saldoPorCobrar:0,totalIniciales:0,otrosIngresos:0,totalGastos:0,
          totalUtilidad:267000,salidasExplicitas:0,esperado:3702900,
          caja:{estado:'cerrada',efectivo_esperado:5202900,efectivo_contado:5202900,diferencia:0}});
        document.getElementById('loginScreen').style.display='none';
        document.getElementById('app').classList.add('show');
        document.getElementById('vistaTienda').style.display='block';
        await cargarCuadrito('TEST-A','2026-09-06');
      });
      assert.match(await page.locator('.cuadrito-totales').innerText(), /3\.702\.900/);
      assert.match(await page.locator('.cierre-box').innerText(), /Registro del cierre original/);
      const violations = await page.locator('.cuadrito-totales').evaluate(el => {
        const box=el.getBoundingClientRect();
        return [...el.querySelectorAll('.cuadrito-linea')].filter(row=>{
          const label=row.querySelector('.izq').getBoundingClientRect();
          const amount=row.querySelector('.der').getBoundingClientRect();
          return label.right>amount.left+1 || amount.right>box.right+1;
        }).map(row=>row.textContent);
      });
      assert.deepEqual(violations,[],`Importes y etiquetas sin solapamiento a ${width}px`);
      await page.locator('.cuadrito-totales').screenshot({path:`/private/tmp/kora-caja-arreglo-${width}.png`});
      await page.close();
    }
  } finally { await browser.close(); }
});
