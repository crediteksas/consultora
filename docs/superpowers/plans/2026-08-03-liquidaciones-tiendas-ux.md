# Liquidaciones de tiendas propias y experiencia administrativa Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Liquidar tiendas propias y aliados en el mismo lote con cálculos seguros y una interfaz administrativa comprensible.

**Architecture:** Extender las operaciones y RPC existentes; mantener el dominio puro en `aliados-liquidaciones-domain.js` y la representación en un módulo UX separado. Persistir snapshots y controlar permisos/transiciones en PostgreSQL.

**Tech Stack:** JavaScript, Supabase/PostgreSQL, RLS/RPC, Node test, navegador KORA local.

## Global Constraints

- Solo Supabase local aislado.
- No modificar reglas de aliados, Retail ni B2B.
- No crear tablas paralelas ni Excel de salida.
- Maite revisa diferencias; solo Óscar modifica Pagamos y aprueba.

---

### Task 1: Dominio y presentación administrativa

**Files:**
- Modify: `creditek/erp/aliados-liquidaciones-domain.js`
- Create: `creditek/erp/aliados-liquidaciones-ux.js`
- Test: `tests/erp/aliados-liquidaciones-domain.test.mjs`

**Interfaces:** Produce `formatoCOP`, `fechaCorta`, `fechaAuditoria`, `calcularTiendaPropia`, `traducirEstado` y `describirAuditoria`.

- [ ] Escribir pruebas fallidas con importes, fechas, fórmulas PayJoy/ALO y auditoría sin UUID/JSON.
- [ ] Ejecutar `node --test tests/erp/aliados-liquidaciones-domain.test.mjs` y confirmar fallos por funciones ausentes.
- [ ] Implementar las funciones puras mínimas.
- [ ] Repetir la suite hasta aprobar.

### Task 2: Persistencia, snapshots y permisos

**Files:**
- Modify: `creditek/erp/migrations/20260802_creditek_aliados_liquidaciones_v1.sql`
- Modify: `creditek/erp/migrations/rollback/20260802_creditek_aliados_liquidaciones_v1_rollback.sql`
- Test: `tests/erp/aliados-liquidaciones-contract.test.mjs`
- Modify: `scripts/validate-aliados-local-supabase.mjs`

**Interfaces:** Produce RPC `aliados_resolver_operaciones_propias`, `aliados_guardar_pagamos`, `aliados_resolver_novedad` y aprobación reforzada.

- [ ] Escribir pruebas fallidas para columnas snapshot, permisos y bloqueos.
- [ ] Ejecutar la suite contractual y confirmar los fallos esperados.
- [ ] Añadir columnas idempotentes, RPC, auditoría e inmutabilidad.
- [ ] Reiniciar Supabase local, ejecutar migración dos veces y validar Auth/RLS/RPC.

### Task 3: Interfaz existente

**Files:**
- Modify: `creditek/erp/aliados-liquidaciones.html`
- Modify: `creditek/erp/aliados-liquidaciones-app.js`
- Test: `tests/erp/aliados-liquidaciones-contract.test.mjs`

**Interfaces:** Consume el módulo UX y las RPC; muestra resúmenes, filtros, operaciones, pagos, auditoría y acciones por rol.

- [ ] Escribir contratos fallidos para filtros, Pagamos, pagos y auditoría legibles.
- [ ] Implementar la vista sobre tablas y modales existentes.
- [ ] Confirmar que Maite no edita Pagamos y Óscar sí.
- [ ] Probar aprobación bloqueada y aprobada en navegador local.

### Task 4: Certificación local

**Files:**
- Modify: `scripts/validate-aliados-local-supabase.mjs`

**Interfaces:** Emite evidencia de conteos 24/4 PayJoy y 4/4 ALO, aliados conciliados, flujo tiendas y seguridad.

- [ ] Importar los dos Excel históricos en la base local limpia.
- [ ] Verificar conciliaciones aliadas sin cambios y operaciones propias separadas.
- [ ] Ejecutar suite Aliados, ERP, `npm test`, prueba Sofía, TypeScript, build y `git diff --check`.
- [ ] Capturar Pagos, Auditoría, separación, Pagamos, revisión y aprobación.
- [ ] Crear un commit limitado a Liquidaciones.
