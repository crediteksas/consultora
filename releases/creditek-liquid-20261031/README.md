# Creditek Liquid — visual candidate, 2026-10-31

Status: local implementation and synthetic verification. No production publication, GitHub push, business transactions or database changes.

- KORA: explicit screen-only stylesheet on existing entry pages; the selected dashboard treatment is limited to screen, with the prior print CSS preserved. The store role uses the same real navigation component and unchanged access-control module.
- AURA: the live host is composed from `creditek-aura-shell`, `aura-campaign-view` and `creditek-nova`, with shared assets supplied by `creditek-aura`. The normal asset build alone does not replace the live shell. `presentation.mjs` and `overlay.mjs` prepare an insertion-only stylesheet/brand treatment over the existing responses. No active Worker module is replaced in this development step.
- `visualEntry()` composes a presentation delegate around an explicitly selected existing entry. Existing handlers and original modules must remain byte-identical. Any publication must first fix current source hashes, preserve settings/bindings/schedules and retain the active predecessor version for rollback.
- The entrypoint must be a plain object with enumerable own data properties and an existing fetch method. All its own function exports are bound to the original object; class instances, prototype RPC, symbols, non-enumerable exports and accessors are rejected explicitly. This overlay is deliberately not a generic WorkerEntrypoint/RPC wrapper. Confirm the actual entrypoint shape before integration; a future different shape requires a separate adapter review.
- No API, authentication, monetary calculation, authorization, generated image or video, customer record or external delivery changes are included. Finite known HTML paths only; POST, APIs, downloads, other hosts, non-200 responses, unknown markup, oversize bodies and failed reads pass through unchanged.
- Candidate product versions: KORA 3.4.0 and AURA 1.3.0. KORA cache identifiers advance to 2.0.36; these are metadata changes, pending publication.

## Validation

Run the bounded presentation tests and the isolated visual navigation test. The latter uses nine fictitious store profiles in Chromium and WebKit, with external requests blocked. Review the task evidence folder for loaded AURA captures, synthetic dashboard number parity, source preservation and export verification. Static entry-page captures are explicitly supplementary; they do not certify authenticated data, every live report or accessibility compliance.

## Integration requirements

Claude review is required by REGLAS.md. This candidate is isolated from the canonical checkout. Main, GitHub and the deployed runtime must be rechecked before integration; do not include unrelated unpublished changes or bypass the official KORA permission/deployment gate. Sofía/creditek-bot is outside this visual release. The live AURA release metadata must describe the reviewed composed artifact before announcing AURA 1.3.0 as published.
