import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const erpDir = path.join(root, 'creditek/erp');
const sidebar = fs.readFileSync(path.join(erpDir, 'sidebar.js'), 'utf8');

test('todas las pantallas ERP declaran un viewport responsive', () => {
  const pages = fs.readdirSync(erpDir).filter((name) => name.endsWith('.html'));
  const missing = pages.filter((name) => {
    const html = fs.readFileSync(path.join(erpDir, name), 'utf8');
    return !/<meta\s+name=["']viewport["'][^>]*width=device-width/i.test(html);
  });
  assert.deepEqual(missing, []);
});

test('el shell común contiene protecciones contra recortes horizontales', () => {
  assert.match(sidebar, /\.main-content \{[^}]*max-width:\s*100%[^}]*overflow-x:\s*hidden/s);
  assert.match(sidebar, /\.main-content \.tabla-wrap,[\s\S]*overflow-x:\s*auto/);
  assert.match(sidebar, /@media \(max-width:\s*900px\)[\s\S]*minmax\(min\(100%, 220px\), 1fr\)/);
  assert.match(sidebar, /@media \(max-width:\s*640px\)[\s\S]*\.main-content \.item-row/);
  assert.match(sidebar, /\.main-content \.modal-box[^}]*max-width:\s*calc\(100vw - 32px\)/s);
});
