## Review result: **APPROVED** — no blocking issues found.

I checked correctness, access gating, pagination, double-counting, fiscal claims, failure handling, and the export, against the code as supplied (no tools used, no schema assumed beyond what's given).

**What holds up:**
- **Double counting / dedup**: `providerApplications` correctly suppresses `providerPayments` already applied to a paid `bankProviders` disbursement (`exogena-domain.js`, the `applied`/`paidProviderIds` block), and excluded rows are logged (not silently dropped) in the "Duplicados excluidos" sheet.
- **Historical credits stay distinguishable**: the `issue` array in the `data.history` loop always includes two unconditional strings ("Fecha real de pago y conciliación pendientes." / "Beneficiario según vinculación actual…"), so every historical row lands in `pending`, never `confirmed`/`summary`/`total` — verified against the test `histórico usa relación única y detecta solapamiento sin sumar`.
- **Beneficiary identity for historicals** only resolves through a single unambiguous origin→site→ally→beneficiary chain (`historicalBeneficiary`); ambiguous cases fall back to `{}`, keeping `document` blank and the row pending rather than guessing.
- **Money handling** is cents-based with `Number.isSafeInteger` guards (`amount`/`sum`), avoiding float drift and silent overflow.
- **Dates**: year filtering respects America/Bogota local date, not UTC (`date()`), matching the included test.
- **Pagination**: `allRows` re-checks `count` on every page and throws rather than returning partial data if the source mutates mid-fetch or returns fewer rows than expected — this correctly disables the export (`clear()` on catch in `load()`).
- **XSS/privacy**: all rendering uses `node()`'s `textContent`, never `innerHTML`; document IDs are typed `'text'` in `detailTypes`/summary `columnTypes`, preserving leading zeros/DV digits rather than coercing to numbers.
- **Access gating**: route is restricted via `FINANCIAL_CONTROLLER_ROUTES`/`users` lists to the two named controller profiles, checked client-side via `KoraAccessControl.authorize`, with no new SQL/RLS changes — consistent with the existing `finanzas-programadas.html` pattern and covered by the added access test.
- **Fiscal claims**: both the in-app notice and the "Cobertura y alcance" sheet explicitly and repeatedly disclaim DIAN-readiness, fiscal classification, retentions, and devengo completeness — not misleading.

**Two non-blocking observations (not fixes I'd insist on before approval):**
1. In `exogena-domain.js`, the provider-payment exclusion loop (`for(const r of data.providerPayments){if(applied.has(r.id))...}`) isn't scoped to the selected `year` before checking `applied`, so the "Duplicados excluidos" sheet can list exclusions from other years alongside the year-scoped report. Harmless (nothing is summed), just a minor scope/clarity mismatch worth a follow-up.
2. The `history` schema hardcodes a JSON path keyed by year: `evidencias:datos_origen->reconstrucciones_correo_2026` (`exogena-app.js`, `schemas.history`). For report years other than 2026 this will likely resolve to `undefined`, so evidence columns/"declaración de pago" checks default to the conservative "sin declaración" state rather than erroring — safe behavior, but worth generalizing before next year's filing cycle.

No action needed for this release; flagging #2 for a near-term follow-up before the 2027 report is run.
