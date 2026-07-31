# KORA-2026-000014 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar instrucciones bancarias administradas por Maythe, comprobación por tienda y aplicación contable idempotente para destinos PROVEEDOR y OSCAR.

**Architecture:** Una migración aditiva crea las entidades de proceso y RPC protegidos que reutilizan cuenta corriente, abonos, pagos/facturas de proveedor, caja de tienda y tesorería central. Las vistas existentes de Cuenta Corriente y Cartera de Proveedores reciben únicamente controles y columnas del flujo, conservando shell y estilos.

**Tech Stack:** PostgreSQL/Supabase RLS y PL/pgSQL, HTML/JavaScript existente, Supabase JS, `node:test`, Cloudflare Pages/Workers.

## Global Constraints

- No modificar navegación, layout, estilos ni módulos ajenos.
- Oscar conserva control total y Maythe es la operadora habitual.
- PROVEEDOR aplica FIFO por `fecha`, `created_at`, `id`.
- OSCAR no afecta proveedores y registra salida interna B2B.
- La tienda nunca recibe proveedor ni clasificación interna.
- Los abonos históricos continúan visibles.
- Toda aprobación es atómica e idempotente.

---

### Task 1: Contrato de datos y transacción

**Files:**
- Create: `creditek/erp/migrations/20260731_kora_2026_000014_destinos_consignacion.sql`
- Create: `tests/erp/kora-2026-000014-destinos-consignacion.test.mjs`

**Interfaces:**
- Produces: RPC `crear_instruccion_consignacion`, `listar_instrucciones_consignacion`, `enviar_comprobante_consignacion`, `decidir_instruccion_consignacion`.
- Produces: tablas `instrucciones_consignacion`, `comprobantes_consignacion`, `aplicaciones_consignacion_proveedor`.

- [ ] **Step 1: Write the failing migration contract tests**

Create tests that execute a disposable PostgreSQL fixture when available and
otherwise validate the migration contract: multiple instructions per day,
immutable snapshots, role checks, safe listing projection, versioned receipts,
row locks, idempotency, one account-current credit, one store cash outflow,
PROVEEDOR FIFO loop, and OSCAR treasury outflow without supplier updates.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/erp/kora-2026-000014-destinos-consignacion.test.mjs`

Expected: FAIL because the migration and RPC do not exist.

- [ ] **Step 3: Implement the additive migration**

Define constrained tables and indexes, revoke direct writes, create safe RLS,
add nullable instruction linkage to `abonos`, extend allowed treasury movement
types/funding sources without rewriting historical rows, and implement the four
RPCs. In the approval RPC:

```sql
for v_factura in
  select * from facturas_proveedor
  where proveedor_id = v_instruccion.proveedor_id and saldo > 0
  order by fecha, created_at, id
  for update
loop
  v_aplicar := least(v_restante, v_factura.saldo);
  -- registrar_pago_proveedor + aplicación
end loop;
```

Lock instruction and receipt rows; reject mismatched amounts; derive UUIDv5-like
deterministic child idempotency keys from the decision request; insert the
existing ledger effects exactly once.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/erp/kora-2026-000014-destinos-consignacion.test.mjs`

Expected: PASS.

### Task 2: Cuenta Corriente

**Files:**
- Modify: `creditek/erp/cuenta-corriente.html`
- Modify: `tests/erp/kora-2026-000014-destinos-consignacion.test.mjs`

**Interfaces:**
- Consumes: the four instruction RPCs from Task 1.
- Produces: central creation/review controls and store receipt submission inside the existing page.

- [ ] **Step 1: Write failing UI behavior tests**

Assert executable DOM behavior with a controlled Supabase client: stores cannot
send bank/account/type/provider fields, central creation sends them, historical
rows tolerate null destination, and receipt state renders as pendiente,
validado, or rechazado.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/erp/kora-2026-000014-destinos-consignacion.test.mjs`

Expected: FAIL because Cuenta Corriente has no instruction flow.

- [ ] **Step 3: Implement minimal fields and actions**

Add a compact existing-style section for central instruction creation/review and
a table for store instructions. Reuse current form, table, modal, button, and
error classes. Replace free-form abono registration for stores with receipt
submission against an instruction; retain historical movement rendering.

- [ ] **Step 4: Run test to verify it passes**

Run the targeted test and `tests/erp/abonos-caja-operativa.test.mjs`.

Expected: PASS.

### Task 3: Cartera de Proveedores

**Files:**
- Modify: `creditek/erp/proveedores.html`
- Modify: `tests/erp/kora-2026-000014-destinos-consignacion.test.mjs`

**Interfaces:**
- Consumes: `aplicaciones_consignacion_proveedor` through a central-only RPC/view.
- Produces: visible FIFO attribution in the existing invoice detail.

- [ ] **Step 1: Write failing FIFO visibility test**

Test that invoice detail displays instruction date, source store, applied amount,
and FIFO position for central users.

- [ ] **Step 2: Run test to verify it fails**

Run the targeted test. Expected: FAIL because no FIFO attribution is rendered.

- [ ] **Step 3: Add FIFO attribution**

Extend the existing invoice detail query/result and append a compact table below
existing payments. Do not add navigation, cards, colors, or layout primitives.

- [ ] **Step 4: Run test to verify it passes**

Run targeted provider and instruction tests. Expected: PASS.

### Task 4: Integration, migration and production

**Files:**
- Verify only all modified production and test files.

**Interfaces:**
- Consumes all preceding tasks.
- Produces deployed migration and static assets.

- [ ] **Step 1: Run complete local verification**

Run:

```bash
node --test tests/erp/kora-2026-000014-destinos-consignacion.test.mjs
npm test
node --test test/sofia-audit-fixes.test.mjs
npx tsc
npm run build
```

- [ ] **Step 2: Apply migration to authorized Supabase**

Link only the confirmed project, apply the single migration, and validate role
permissions plus transactional effects using rollbacks and synthetic values.

- [ ] **Step 3: Deploy only changed assets**

Deploy the current committed source and confirm the deployment contains only
the intended static changes.

- [ ] **Step 4: Verify production**

Confirm public asset hashes/markers and use safe rollback-only SQL validation for
split instructions, PROVEEDOR FIFO, OSCAR, duplicate approval, safe store
projection, and historical rows.

- [ ] **Step 5: Commit implementation**

Commit only the migration, two existing pages, tests, and this plan.
