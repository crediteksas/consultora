import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);

test('el soporte de pago usa un selector visible y persistente en el DOM', async () => {
  const [html, app] = await Promise.all([
    readFile(new URL('creditek/erp/aliados-tesoreria.html', root), 'utf8'),
    readFile(new URL('creditek/erp/aliados-tesoreria-app.js', root), 'utf8')
  ]);
  assert.match(html, /id="paymentSupportModal"/);
  assert.match(html, /id="paymentSupportFile"[^>]*type="file"[^>]*required/);
  assert.match(html, /Subir soporte y registrar pago/);
  assert.match(app, /function openPaymentSupport\(id\)/);
  assert.match(app, /if\(next==='pagado'\)return openPaymentSupport\(id\)/);
  assert.match(app, /p_soporte_path:support/);
});

test('valida formato y tamaño antes de subir el comprobante', async () => {
  const app = await readFile(new URL('creditek/erp/aliados-tesoreria-app.js', root), 'utf8');
  assert.match(app, /image\/jpeg.*image\/png.*application\/pdf/);
  assert.match(app, /10\*1024\*1024/);
  assert.match(app, /contentType:file\.type/);
});
