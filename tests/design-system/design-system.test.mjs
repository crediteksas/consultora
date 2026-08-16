import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildPublic } from '../../scripts/build-public.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const designSystem = path.join(root, 'design-system');

const requiredDirectories = [
  'tokens',
  'components',
  'icons',
  'styles',
  'utilities',
  'docs',
];

const requiredComponents = [
  'Button',
  'IconButton',
  'Input',
  'Textarea',
  'Select',
  'Checkbox',
  'Switch',
  'Radio',
  'Search',
  'DatePicker',
  'Badge',
  'StatusBadge',
  'Card',
  'MetricCard',
  'AlertCard',
  'EmptyState',
  'Skeleton',
  'Toast',
  'Modal',
  'Drawer',
  'Tooltip',
  'Tabs',
  'Breadcrumb',
  'Sidebar',
  'Topbar',
  'PageHeader',
  'FilterBar',
  'DataTable',
  'Pagination',
  'Loading',
  'Spinner',
  'Progress',
  'Avatar',
  'Dropdown',
];

const release = {
  name: 'Creditek Design System',
  version: '1.0.0',
  status: 'stable',
  releaseDate: '2026-07-27',
  compatibility: 'Creditek ERP multipágina',
  breakingChanges: false,
};

test('incluye la estructura mínima del Design System', async () => {
  for (const directory of requiredDirectories) {
    await access(path.join(designSystem, directory));
  }
});

test('declara el catálogo completo de componentes base', async () => {
  const manifest = JSON.parse(
    await readFile(path.join(designSystem, 'components/manifest.json'), 'utf8'),
  );
  assert.deepEqual(manifest.components, requiredComponents);
});

test('formaliza la versión estable 1.0.0', async () => {
  const version = JSON.parse(
    await readFile(path.join(designSystem, 'version.json'), 'utf8'),
  );
  assert.deepEqual(version, release);
});

test('mantiene un changelog para la versión publicada', async () => {
  const changelog = await readFile(path.join(designSystem, 'CHANGELOG.md'), 'utf8');
  assert.match(changelog, /^# Changelog/m);
  assert.match(changelog, /^## \[1\.0\.0\] - 2026-07-27$/m);
  assert.match(changelog, /^### Added$/m);
  for (const name of ['Added', 'Changed', 'Fixed', 'Deprecated', 'Removed', 'Security']) {
    const section = changelog.match(
      new RegExp(`^### ${name}\\n([\\s\\S]*?)(?=^### |^## |(?![\\s\\S]))`, 'm'),
    );
    if (section) assert.ok(section[1].trim(), `La sección ${name} está vacía`);
  }
});

test('describe estado, archivos y accesibilidad por componente', async () => {
  const manifest = JSON.parse(
    await readFile(path.join(designSystem, 'components/manifest.json'), 'utf8'),
  );
  assert.equal(manifest.name, release.name);
  assert.equal(manifest.version, release.version);
  assert.equal(manifest.updatedAt, release.releaseDate);
  assert.equal(manifest.componentCatalog.length, requiredComponents.length);

  for (const component of manifest.componentCatalog) {
    assert.equal(component.status, 'stable');
    assert.match(component.css, /^components\/.+\.css$/);
    assert.ok(Array.isArray(component.accessibility));
    assert.ok(component.accessibility.length > 0);
    assert.equal(component.compatibility, release.compatibility);
    assert.ok(component.javascript === null || /^components\/.+\.mjs$/.test(component.javascript));
  }
});

test('centraliza los valores de color fuera de los componentes', async () => {
  const componentFiles = [
    'actions.css',
    'forms.css',
    'feedback.css',
    'navigation.css',
    'overlays.css',
    'data-display.css',
  ];

  for (const file of componentFiles) {
    const css = await readFile(path.join(designSystem, 'components', file), 'utf8');
    assert.doesNotMatch(css, /#[\da-f]{3,8}\b/i, `${file} contiene un color hexadecimal`);
    assert.doesNotMatch(css, /\b(?:rgb|hsl)a?\(/i, `${file} contiene un color directo`);
  }
});

test('expone tokens para todas las categorías obligatorias', async () => {
  const css = await readFile(path.join(designSystem, 'tokens/index.css'), 'utf8');
  const expectedPrefixes = [
    '--ctk-color-',
    '--ctk-font-',
    '--ctk-space-',
    '--ctk-radius-',
    '--ctk-shadow-',
    '--ctk-duration-',
    '--ctk-ease-',
    '--ctk-z-',
    '--ctk-breakpoint-',
    '--ctk-opacity-',
    '--ctk-icon-',
    '--ctk-height-',
    '--ctk-width-',
  ];

  for (const prefix of expectedPrefixes) {
    assert.match(css, new RegExp(prefix), `Faltan tokens ${prefix}`);
  }
});

test('limita las duraciones de animación a la escala aprobada', async () => {
  const css = await readFile(path.join(designSystem, 'tokens/index.css'), 'utf8');
  const durations = [...css.matchAll(/--ctk-duration-[^:]+:\s*(\d+ms)/g)].map(match => match[1]);
  assert.deepEqual(durations, ['120ms', '180ms', '220ms', '300ms']);
});

test('documenta cada componente base', async () => {
  const docs = await readFile(path.join(root, 'docs/CREDITEK_DESIGN_SYSTEM.md'), 'utf8');
  for (const component of requiredComponents) {
    assert.match(docs, new RegExp(`\\b${component}\\b`), `Falta documentar ${component}`);
  }
});

test('fija Lucide 1.27.0 sin latest ni rangos abiertos', async () => {
  const manifest = JSON.parse(
    await readFile(path.join(designSystem, 'components/manifest.json'), 'utf8'),
  );
  const iconsReadme = await readFile(path.join(designSystem, 'icons/README.md'), 'utf8');
  const docs = await readFile(path.join(root, 'docs/CREDITEK_DESIGN_SYSTEM.md'), 'utf8');

  assert.equal(manifest.dependencies.lucide, '1.27.0');
  assert.match(iconsReadme, /lucide@1\.27\.0/);
  assert.match(docs, /lucide@1\.27\.0/);
  assert.doesNotMatch(`${iconsReadme}\n${docs}`, /lucide@latest/i);
  assert.doesNotMatch(manifest.dependencies.lucide, /[~^*xX><=|]/);
});

test('mantiene la documentación normativa dentro del repositorio', async () => {
  const docsPath = path.join(root, 'docs/CREDITEK_DESIGN_SYSTEM.md');
  await access(docsPath);
  assert.equal(path.relative(root, docsPath), 'docs/CREDITEK_DESIGN_SYSTEM.md');
  const docs = await readFile(docsPath, 'utf8');
  assert.match(docs, /Versión:\s*1\.0\.0/);
  assert.match(docs, /Estado:\s*estable/i);
  assert.match(docs, /## Política de versionado/);
  assert.match(docs, /## Compatibilidad/);
});

test('publica recursos ejecutables sin exponer documentación interna', async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'creditek-design-system-'));
  try {
    await buildPublic(root, output);
    await access(path.join(output, 'design-system/styles/index.css'));
    await access(path.join(output, 'design-system/components/interactions.mjs'));
    await assert.rejects(access(path.join(output, 'design-system/docs/README.md')));
    await assert.rejects(access(path.join(output, 'docs/CREDITEK_DESIGN_SYSTEM.md')));
  } finally {
    await rm(output, { force: true, recursive: true });
  }
});
