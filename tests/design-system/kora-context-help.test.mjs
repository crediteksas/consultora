import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const helpSource = await readFile('creditek/erp/kora-context-help.js', 'utf8');
const shellSource = await readFile('creditek/erp/sidebar.js', 'utf8');
const helpStyles = await readFile('design-system/components/kora-context-help.css', 'utf8');

const protectedRoutes = [
  'tablero.html', 'presupuestos.html', 'reportes.html', 'catalogo.html',
  'remisiones.html', 'documento-remision.html', 'inventario.html', 'traslados.html',
  'ajustes.html', 'cierre-periodo.html', 'auditoria-cruzada.html', 'kardex.html',
  'ventas.html', 'gastos.html', 'caja.html', 'cuenta-corriente.html',
  'conciliacion.html', 'proveedores.html', 'compra-proveedor.html',
  'bodega-central.html', 'utilidad-creditek.html', 'aliados-dashboard.html',
  'aliados.html', 'aliados-ejecutivos.html', 'aliados-plataformas.html',
  'aliados-liquidaciones.html', 'aliados-tesoreria.html', 'aliados-calidad.html',
  'aliados-bonificaciones.html', 'aliados-reportes.html', 'registro-interno.html',
  'validacion.html', 'incidencias.html',
];

test('el shell instala el botón de guía junto a las acciones superiores', () => {
  assert.match(shellSource, /data-kora-help aria-label="Guía de esta pantalla"/);
  assert.match(shellSource, /data-lucide="circle-help"/);
  assert.match(shellSource, /kora-context-help\.css\?v=1\.0\.0/);
  assert.match(shellSource, /kora-context-help\.js\?v=1\.0\.0/);
  assert.match(shellSource, /KoraContextHelp\?\.mount/);
});

test('la guía cubre todas las rutas operativas protegidas de KORA', () => {
  protectedRoutes.forEach(route => {
    assert.match(helpSource, new RegExp(`['"]${route.replace('.', '\\.')}['"]\\s*:\\s*guide\\(`), route);
  });
});

test('el panel es accesible con diálogo modal, cierre, foco y texto semántico', () => {
  assert.match(helpSource, /document\.createElement\('dialog'\)/);
  assert.match(helpSource, /aria-labelledby.*koraContextHelpTitle/);
  assert.match(helpSource, /dialog\.showModal\(\)/);
  assert.match(helpSource, /dialog\.addEventListener\('cancel'/);
  assert.match(helpSource, /event\.key === 'Escape' && dialog\.open/);
  assert.match(helpSource, /dialog\.addEventListener\('close'.*opener\?\.focus/s);
  assert.match(helpSource, /data-kora-help-close/);
  assert.match(helpSource, /Cómo usarla/);
  assert.match(helpSource, /Antes de continuar/);
});

test('la presentación usa el sistema visual compartido y responde en móvil', () => {
  assert.match(helpStyles, /var\(--ctk-color-primary/);
  assert.match(helpStyles, /var\(--ctk-color-accent/);
  assert.match(helpStyles, /var\(--ctk-color-surface/);
  assert.match(helpStyles, /@media \(max-width: 640px\)/);
  assert.match(helpStyles, /prefers-reduced-motion/);
  assert.doesNotMatch(helpStyles, /font-family:\s*(?!var\()/);
});

test('la ayuda no cambia permisos ni consulta datos del negocio', () => {
  assert.doesNotMatch(helpSource, /supabase|\.from\(|\.rpc\(|fetch\(|localStorage|sessionStorage/i);
  assert.doesNotMatch(helpSource, /insert|update|delete|post|put/i);
});
