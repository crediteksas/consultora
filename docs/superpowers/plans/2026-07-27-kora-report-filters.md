# KORA Report Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir los filtros pesados de `Análisis e informes` en controles segmentados ligeros y responsive sin alterar su comportamiento.

**Architecture:** Mantener el HTML y los eventos existentes de `reportes.html`, añadiendo clases semánticas al contenedor y sustituyendo únicamente su CSS local. Validar el contrato visual mediante pruebas estructurales y el comportamiento funcional con las pruebas ERP existentes.

**Tech Stack:** HTML multipágina, CSS, JavaScript nativo, Node Test Runner, Cloudflare Workers.

## Global Constraints

- No cambiar filtros disponibles, fechas calculadas, consultas, permisos, exportaciones ni resultados.
- Usar tokens del Creditek Design System.
- Mantener las nueve opciones rápidas visibles.
- Transiciones de 180 ms y soporte para `prefers-reduced-motion`.
- Validar 1440, 1024, 768 y 390 px.

---

### Task 1: Contrato visual de filtros

**Files:**
- Create: `tests/design-system/kora-report-filters.test.mjs`
- Modify: `creditek/erp/reportes.html`

**Interfaces:**
- Consumes: `.btn-nav`, `.multi-select-btn`, `.rango-personalizado`, `[data-periodo]`
- Produces: `.kora-report-filters`, `.kora-period-segments`, `.kora-store-filter-row`

- [ ] **Step 1: Write the failing test**

```js
test('los períodos usan un selector segmentado ligero', () => {
  assert.match(html, /class="[^"]*kora-period-segments/);
  assert.match(html, /\.btn-nav\s*\{[^}]*background:\s*var\(--ctk-color-surface/);
  assert.match(html, /\.btn-nav\.active\s*\{[^}]*background:\s*var\(--ctk-color-primary/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/design-system/kora-report-filters.test.mjs`
Expected: FAIL porque las clases y estilos ligeros aún no existen.

- [ ] **Step 3: Implement the minimal markup and styles**

Add semantic wrapper classes without changing `data-periodo`, element IDs, button order or event handlers. Replace the filled inactive buttons with neutral surfaces and reserve primary color for `.active`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/design-system/kora-report-filters.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add creditek/erp/reportes.html tests/design-system/kora-report-filters.test.mjs
git commit -m "fix(ui): aligera filtros de análisis KORA"
```

### Task 2: Responsive y controles secundarios

**Files:**
- Modify: `creditek/erp/reportes.html`
- Test: `tests/design-system/kora-report-filters.test.mjs`

**Interfaces:**
- Consumes: `#rangoPersonalizado`, `#btnTiendas`, `#rango-visible`
- Produces: distribución responsive sin desbordamiento ni cambio funcional

- [ ] **Step 1: Extend the failing test**

```js
test('los filtros se adaptan sin comprimir ni amontonar controles', () => {
  assert.match(html, /@media \(max-width: 63\.999rem\)/);
  assert.match(html, /overflow-x:\s*auto/);
  assert.match(html, /prefers-reduced-motion/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/design-system/kora-report-filters.test.mjs`
Expected: FAIL por ausencia del contrato responsive.

- [ ] **Step 3: Implement responsive styles**

Use an overflow-contained period row below 1024 px, keep store and visible range aligned, and stack the store row below 768 px. Style personalized range, date inputs and store selector as secondary controls.

- [ ] **Step 4: Run focused and full tests**

Run:

```bash
node --test tests/design-system/kora-report-filters.test.mjs
node --test tests/design-system/*.test.mjs
node --test tests/erp/*.test.mjs
```

Expected: all PASS.

- [ ] **Step 5: Build and validate**

Run:

```bash
npm run build
git diff --check
```

Expected: exit 0.

### Task 3: Publicación y validación productiva

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: committed build
- Produces: production deployment with rollback

- [ ] **Step 1: Run all verification suites**

Run Design System, configuration, ERP, security, build and `git diff --check`.

- [ ] **Step 2: Deploy**

Run: `npm run deploy`
Expected: a new Cloudflare Version ID.

- [ ] **Step 3: Validate production**

Open `https://registro.crediteksas.com/creditek/erp/reportes` and verify:

- inactive periods are neutral;
- exactly one period is visually active;
- store selector is secondary;
- filters work;
- no horizontal page overflow at 1440, 1024, 768 and 390 px;
- console has no errors.
