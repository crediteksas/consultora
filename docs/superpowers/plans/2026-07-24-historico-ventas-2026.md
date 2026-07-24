# Histórico de ventas 2026 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cargar y consultar en Creditek ERP el histórico ejecutado de ventas 2026 de las 11 tiendas, conservando todos los campos disponibles sin mover inventario ni mezclar las pruebas operativas.

**Architecture:** Ampliar `historico_importado` para el resumen diario y crear `creditos_historicos` para el detalle disponible por crédito. Una función transaccional e idempotente recibirá paquetes JSON validados; una pantalla central separada consultará únicamente estas tablas y permitirá futuras cargas complementarias.

**Tech Stack:** PostgreSQL/Supabase, RLS, RPC JSONB, HTML/CSS/JavaScript sin framework, Supabase JS v2, Chart.js, Node.js `node:test`, Cloudflare Pages/Workers static deployment.

## Global Constraints

- Incluir únicamente CK-01 a CK-11.
- Excluir por completo la subcarpeta `PERFUMERIA`.
- No modificar inventario, caja operativa, conciliación, clientes ni Sofía.
- No inventar detalle de clientes o productos que no exista en las hojas.
- Mantener separadas las ventas de prueba actuales del ERP.
- Conservar los valores originales y señalar las tres inconsistencias detectadas.
- Impedir duplicados mediante llaves estables de origen.
- Restringir costos, gastos y utilidad histórica a gerencia y auditoría.
- No publicar los archivos consolidados de carga en Cloudflare.

---

### Task 1: Dominio puro de histórico y pruebas unitarias

**Files:**
- Create: `creditek/erp/historico-ventas-domain.js`
- Create: `creditek/erp/tests/historico-ventas-domain.test.mjs`

**Interfaces:**
- Consumes: filas ya normalizadas de `historico_importado`.
- Produces: `CreditekHistoricoDomain.numero`, `sumarTotales`, `agruparPorTienda`, `agruparPorMes` y `detectarInconsistencias`.

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
await import('../historico-ventas-domain.js');
const domain = globalThis.CreditekHistoricoDomain;

test('suma los indicadores históricos sin alterar las filas', () => {
  const filas = [
    { venta_total: 100, contado: 60, creditos: 1, utilidad: 20, gastos: 5, utilidad_neta: 15 },
    { venta_total: 80, contado: 80, creditos: 0, utilidad: 12, gastos: 2, utilidad_neta: 10 },
  ];
  assert.deepEqual(domain.sumarTotales(filas), {
    ventaTotal: 180, contado: 140, creditos: 1,
    utilidadBruta: 32, gastos: 7, utilidadNeta: 25,
  });
});

test('agrupa por tienda y conserva el nombre', () => {
  const filas = [
    { tienda_codigo: 'CK-01', tienda_nombre: 'Cellfiao Tolú', venta_total: 100 },
    { tienda_codigo: 'CK-01', tienda_nombre: 'Cellfiao Tolú', venta_total: 50 },
  ];
  assert.equal(domain.agruparPorTienda(filas)[0].ventaTotal, 150);
});

test('detecta diferencias sin corregir el valor reportado', () => {
  const fila = {
    venta_total: 53900, equipos_contado_venta: 0, accesorios_venta: 0,
    creditos_inicial: 0, creditos_pendiente: 0,
  };
  assert.equal(domain.detectarInconsistencias(fila).includes('venta_total'), true);
  assert.equal(fila.venta_total, 53900);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
node --test creditek/erp/tests/historico-ventas-domain.test.mjs
```

Expected: FAIL because `creditek/erp/historico-ventas-domain.js` does not exist.

- [ ] **Step 3: Implement the minimal domain module**

```js
(function (global) {
  'use strict';

  const numero = valor => Number.isFinite(Number(valor)) ? Number(valor) : 0;

  function sumarTotales(filas) {
    return (filas || []).reduce((t, fila) => ({
      ventaTotal: t.ventaTotal + numero(fila.venta_total),
      contado: t.contado + numero(fila.contado),
      creditos: t.creditos + numero(fila.creditos),
      utilidadBruta: t.utilidadBruta + numero(fila.utilidad),
      gastos: t.gastos + numero(fila.gastos),
      utilidadNeta: t.utilidadNeta + numero(fila.utilidad_neta),
    }), { ventaTotal: 0, contado: 0, creditos: 0, utilidadBruta: 0, gastos: 0, utilidadNeta: 0 });
  }

  function detectarInconsistencias(fila) {
    const alertas = [];
    const calculado = numero(fila.equipos_contado_venta)
      + numero(fila.accesorios_venta)
      + numero(fila.creditos_inicial)
      + numero(fila.creditos_pendiente);
    if (Math.abs(numero(fila.venta_total) - calculado) > 2) alertas.push('venta_total');
    return alertas;
  }

  global.CreditekHistoricoDomain = Object.freeze({
    numero, sumarTotales, agruparPorTienda, agruparPorMes, detectarInconsistencias,
  });
})(typeof window !== 'undefined' ? window : globalThis);
```

`agruparPorTienda` y `agruparPorMes` usarán internamente `sumarTotales`; no mutarán las entradas y devolverán arreglos ordenados.

- [ ] **Step 4: Run the unit tests**

Run:

```bash
node --test creditek/erp/tests/historico-ventas-domain.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add creditek/erp/historico-ventas-domain.js creditek/erp/tests/historico-ventas-domain.test.mjs
git commit -m "test: definir dominio del histórico de ventas"
```

---

### Task 2: Esquema histórico, seguridad e importación transaccional

**Files:**
- Create: `creditek/erp/migrations/20260724_historico_ventas_2026.sql`
- Create: `creditek/erp/tests/smoke_test_historico_ventas_2026.sql`

**Interfaces:**
- Consumes: `p_resumen jsonb` y `p_creditos jsonb`.
- Produces: RPC `public.importar_historico_ventas(p_resumen jsonb, p_creditos jsonb) returns jsonb`.

- [ ] **Step 1: Write the SQL smoke test first**

El test abrirá una transacción, invocará el RPC dos veces con la misma fila CK-01 y verificará:

```sql
select public.importar_historico_ventas(
  '[{"tienda_codigo":"CK-01","fecha":"2026-01-02","creditos":1,
     "contado":204000,"utilidad":259100,"venta_total":734000,
     "source_file_id":"TEST-FILE","source_tab":"ENE 2026","source_row":4}]'::jsonb,
  '[{"tienda_codigo":"CK-01","fecha":"2026-01-02","plataforma":"PAYJOY",
     "imei":"866509085443268","source_file_id":"TEST-FILE","source_row":3}]'::jsonb
);

-- Debe seguir existiendo una sola fila diaria y un solo crédito.
do $$
begin
  if (select count(*) from public.historico_importado
      where tienda_codigo='CK-01' and fecha='2026-01-02'
        and source_file_id='TEST-FILE') <> 1 then
    raise exception 'SMOKE_FAIL resumen no idempotente';
  end if;
end $$;
rollback;
```

- [ ] **Step 2: Run the smoke test and verify the expected failure**

Run the SQL in Supabase inside a transaction.

Expected: FAIL because the columns, table and RPC do not exist yet.

- [ ] **Step 3: Extend `historico_importado`**

Add numeric fields with `not null default 0`, text provenance fields, `calidad_estado text not null default 'ok'`, `calidad_detalle jsonb not null default '[]'::jsonb`, and `updated_at timestamptz not null default now()`.

Preserve the existing unique constraint `(tienda_codigo, fecha)` and RLS.

- [ ] **Step 4: Create `creditos_historicos`**

```sql
create table public.creditos_historicos (
  id uuid primary key default gen_random_uuid(),
  tienda_codigo text not null references public.origenes(codigo),
  fecha date,
  estado_fuente text not null default 'activo'
    check (estado_fuente in ('activo', 'anulado')),
  plataforma text,
  cantidad integer not null default 1 check (cantidad >= 0),
  imei text,
  costo numeric not null default 0,
  cuota_inicial numeric not null default 0,
  saldo_pendiente numeric not null default 0,
  utilidad numeric not null default 0,
  notas text,
  calidad_estado text not null default 'ok'
    check (calidad_estado in ('ok', 'revisar')),
  calidad_detalle jsonb not null default '[]'::jsonb,
  source_file_id text not null,
  source_file_title text not null,
  source_row integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_file_id, source_row)
);
```

Enable RLS and add one `ALL` policy for authenticated users satisfying `es_central()`.

- [ ] **Step 5: Implement the RPC**

The function must:

1. reject non-array JSON;
2. reject store codes outside CK-01..CK-11;
3. stage both payloads in temporary tables;
4. upsert daily rows on `(tienda_codigo, fecha)`;
5. upsert credits on `(source_file_id, source_row)`;
6. set `importado_por = auth.uid()` and update timestamps;
7. return `{"resumen": N, "creditos": M}`;
8. execute as one transaction and revoke access from `anon`.

- [ ] **Step 6: Run the smoke test twice**

Expected both times:

- one daily row;
- one credit row;
- the second execution updates rather than duplicates;
- rollback leaves production unchanged.

- [ ] **Step 7: Run security checks**

Verify:

```sql
set local role authenticated;
-- A non-central test profile cannot select historical costs.
-- A gerencia/auditoria profile can read and call the RPC.
```

Expected: store-level profile is denied; central profile succeeds.

- [ ] **Step 8: Commit**

```bash
git add creditek/erp/migrations/20260724_historico_ventas_2026.sql creditek/erp/tests/smoke_test_historico_ventas_2026.sql
git commit -m "feat: asegurar histórico de ventas 2026"
```

---

### Task 3: Validador reutilizable del paquete de carga

**Files:**
- Create: `creditek/erp/scripts/validar-historico-ventas.mjs`
- Create: `creditek/erp/tests/fixtures/historico-ventas-minimo.json`
- Create: `creditek/erp/tests/validar-historico-ventas.test.mjs`

**Interfaces:**
- Consumes: archivo JSON `{ resumen: [...], creditos: [...] }`.
- Produces: manifiesto JSON con conteos, totales, tiendas, rango, duplicados y errores.

- [ ] **Step 1: Write failing validator tests**

Test valid package, rejected `PERFUMERIA`, unmapped store, duplicate daily key, invalid date and mismatched totals.

- [ ] **Step 2: Run and verify failure**

```bash
node --test creditek/erp/tests/validar-historico-ventas.test.mjs
```

Expected: FAIL because the validator does not exist.

- [ ] **Step 3: Implement the validator**

Required exit codes:

- `0`: package valid, including known flagged discrepancies;
- `1`: structural or mapping error;
- `2`: totals do not match the approved manifest.

The validator must require exactly these store codes:

```js
new Set(['CK-01','CK-02','CK-03','CK-04','CK-05','CK-06',
  'CK-07','CK-08','CK-09','CK-10','CK-11']);
```

It must reject any source title containing `PERFUMERIA`.

- [ ] **Step 4: Run tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add creditek/erp/scripts/validar-historico-ventas.mjs creditek/erp/tests/fixtures/historico-ventas-minimo.json creditek/erp/tests/validar-historico-ventas.test.mjs
git commit -m "feat: validar paquetes de histórico"
```

---

### Task 4: Pantalla central “Histórico de ventas 2026”

**Files:**
- Create: `creditek/erp/historico-ventas.html`
- Modify: `creditek/erp/sidebar.js:11-75`
- Test: `creditek/erp/tests/historico-ventas-domain.test.mjs`

**Interfaces:**
- Consumes: `historico_importado`, `creditos_historicos`, `origenes`.
- Produces: pantalla de consulta y carga central; evento `creditek:tienda-cambiada`.

- [ ] **Step 1: Add failing UI contract assertions**

The test must read the HTML and assert unique IDs:

```js
['kpiVentaTotal','kpiContado','kpiCreditos','kpiUtilidadBruta',
 'kpiGastos','kpiUtilidadNeta','tbodyTiendas','tbodyCreditos',
 'filtroDesde','filtroHasta','inputPaquete'].forEach(id => {
  assert.match(html, new RegExp(`id="${id}"`));
});
```

- [ ] **Step 2: Run and verify failure**

Expected: FAIL because the page does not exist.

- [ ] **Step 3: Build the read-only dashboard**

Implement:

- authenticated central guard;
- default range `2026-01-01` to `2026-07-23`;
- store/date filters;
- six KPI cards;
- store comparison table;
- monthly line chart;
- paginated credit detail;
- quality warning badges;
- empty, loading and error states;
- responsive layout at 900 px and 600 px.

- [ ] **Step 4: Add controlled import**

The file input accepts only `.json`. Before calling the RPC it must:

- reject payloads without `resumen` and `creditos`;
- reject `PERFUMERIA`;
- show counts and totals;
- require an explicit confirmation;
- call the RPC in bounded chunks;
- reload and verify the final counts.

- [ ] **Step 5: Add the sidebar entry**

Under `REPORTES`, add:

```js
{ label: 'Histórico 2026', href: 'historico-ventas.html',
  roles: ['gerencia', 'auditoria'] }
```

- [ ] **Step 6: Run unit and contract tests**

```bash
node --test creditek/erp/tests/historico-ventas-domain.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add creditek/erp/historico-ventas.html creditek/erp/sidebar.js creditek/erp/tests/historico-ventas-domain.test.mjs
git commit -m "feat: mostrar histórico de ventas 2026"
```

---

### Task 5: Preparar y auditar el paquete real

**Files:**
- Create temporarily: `/private/tmp/creditek-historico-ventas-2026.json`
- Create temporarily: `/private/tmp/creditek-historico-ventas-2026-manifest.json`

**Interfaces:**
- Consumes: 11 Google Sheets de Drive, pestañas mensuales y `CREDITOS`.
- Produces: package compatible with `importar_historico_ventas`.

- [ ] **Step 1: Read spreadsheet metadata before ranges**

Confirm tabs, dimensions, locale and timezone for all 11 sources.

- [ ] **Step 2: Extract January–July daily rows and credit detail**

Use exact visible sheet names. Do not read or include the `PERFUMERIA` folder.

- [ ] **Step 3: Map sources to CK codes**

Apply the exact table from the approved design document.

- [ ] **Step 4: Flag source inconsistencies**

Attach quality metadata to the three known rows without changing their reported values.

- [ ] **Step 5: Validate the real package**

```bash
node creditek/erp/scripts/validar-historico-ventas.mjs \
  /private/tmp/creditek-historico-ventas-2026.json \
  /private/tmp/creditek-historico-ventas-2026-manifest.json
```

Expected manifest:

- daily rows: 1,949;
- credit-detail rows: 836;
- active dated credit-detail rows: 831;
- annulled credit-detail rows: 3;
- credit-detail rows without a complete date: 2;
- credit count sum: 835;
- cash sales: 932,959,145;
- total sales: 1,392,476,831;
- gross profit: 428,632,331;
- expenses: 366,289,777;
- net profit: 62,342,554;
- stores: 11;
- duplicates: 0;
- quality warnings: 3.

- [ ] **Step 6: Keep raw package out of Git**

Verify neither temporary file appears in `git status` or the Cloudflare asset manifest.

---

### Task 6: Apply migration and import production history

**Files:**
- Apply: `creditek/erp/migrations/20260724_historico_ventas_2026.sql`
- Execute: `/private/tmp/creditek-historico-ventas-2026.json`

**Interfaces:**
- Consumes: validated package and deployed RPC.
- Produces: production historical rows with audit verification.

- [ ] **Step 1: Run the migration**

Execute in Supabase SQL Editor and confirm tables, columns, policies and RPC signatures.

- [ ] **Step 2: Run the SQL smoke test**

Expected: all assertions pass and transaction rolls back.

- [ ] **Step 3: Create a pre-import baseline**

Record counts and totals for:

- `historico_importado`;
- `creditos_historicos`;
- `ventas`;
- `unidades`;
- `stock_cantidad`;
- `caja_diaria`;
- `gastos`.

- [ ] **Step 4: Import the validated package**

Use the ERP central import control or invoke the RPC in bounded chunks. Confirm each chunk result before proceeding.

- [ ] **Step 5: Verify exact totals**

Run one aggregate query and compare every approved manifest number.

- [ ] **Step 6: Prove idempotency**

Repeat the complete import. Expected:

- daily count remains 1,949;
- credit-detail count remains 836;
- all totals remain unchanged.

- [ ] **Step 7: Prove containment**

Compare post-import baselines. Expected no count or balance changes in `ventas`, `unidades`, `stock_cantidad`, `caja_diaria` or operational `gastos`.

---

### Task 7: End-to-end verification, publish and handoff

**Files:**
- Modify only if a defect is found: files from Tasks 1–4.

**Interfaces:**
- Consumes: production historical data and deployed static page.
- Produces: verified public ERP route for authenticated central users.

- [ ] **Step 1: Run all local tests**

```bash
node --test creditek/erp/tests/*.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Review the migration**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors and no temporary data files.

- [ ] **Step 3: Test the page locally**

Verify filters, KPI totals, store table, monthly chart, credit pagination, quality flags and mobile layout.

- [ ] **Step 4: Push the branch**

```bash
git push origin codex/erp-remisiones-seguridad
```

- [ ] **Step 5: Deploy the exact pushed commit**

Publish only approved static assets and do not include temporary JSON.

- [ ] **Step 6: Verify production**

Open:

`https://registro.crediteksas.com/creditek/erp/historico-ventas`

Verify:

- gerencia/auditoría can access;
- admin_tienda/asesor cannot access historical financial details;
- totals match the manifest;
- Perfumería is absent;
- existing ERP modules still load.

- [ ] **Step 7: Final commit if verification required fixes**

```bash
git add creditek/erp/historico-ventas-domain.js \
  creditek/erp/historico-ventas.html \
  creditek/erp/sidebar.js \
  creditek/erp/migrations/20260724_historico_ventas_2026.sql \
  creditek/erp/tests/historico-ventas-domain.test.mjs \
  creditek/erp/tests/smoke_test_historico_ventas_2026.sql
git commit -m "fix: cerrar verificación del histórico 2026"
git push origin codex/erp-remisiones-seguridad
```
