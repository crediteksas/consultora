# Andrea notices and daily requests

User authorized enriched Andrea WhatsApp alerts, one updated Club Seven notice and delivery verification, plus a default daily view with older requests archived. This release changes only creditek-nova. No decision, financial rule, reference answer, photo, permission, RLS or schema is modified, and no provider is queried by the change.

## Alerts

Reuse the approved nova_aviso_ejecutivo_v1 template. Parameter 1 contains the official store name and existing NOVA reference. Parameter 2 contains the current concrete pending actions, including reference category mismatches and front-document name mismatch. The authenticated direct link remains the existing template button using the case UUID. Parameters are normalized without newlines/tabs or repeated spaces; second parameter <=650 chars and reference <=126 chars, tested against the full 1024-char body limit. No customer identity, phone, government number, raw financial amounts or image is added to WhatsApp.

A private best-effort snapshot in the existing NOVA_EVENTS KV records the exact template parameters and direct URL before the send, with a 30-day TTL. Snapshot failure never blocks delivery. No new database write is introduced: the gateway correctly rejects audit_log and the sender does not call that write. Recipient lookup failures and missing/stale details finish failed with existing bounded retry, rather than leaving sending or inventing a stale fallback. The claim function returns revision; stale detail cannot describe a newer case using an older decision. Transport uncertainty remains uncertain and is never automatically replayed by this change. Other audience payloads are byte-identical to baseline.

The user-authorized one-off resend is separate DML in resend.sql, run only after deployment/live checks. It locks the current exact case and notice, verifies review/revision, one unchanged reviewer and delivered original receipt, preserves the original receipt without recipient phone in audit_log, then requeues the same notice with cumulative attempts retained. An audit marker makes the request idempotent. No fake revision or duplicate identity is created. Existing claim/finish SQL was read and executed in PGlite tests. No live resend has been claimed as complete in this prepublication document.

## Daily list and archive

The server defaults to the Colombia calendar day using original kora_nova_sources.submitted_at, not mutable updated_at. An explicit inner FK relationship and stable intake-date/source-ID ordering support 100-row pages. The archive is a date-based view; records are retained and background processing remains active. Store filtering, global permissions and allied closed-case denial remain intact.

The frontend opens with Solicitudes de hoy, offers Archivo · Días anteriores and pagination. Direct authenticated UUID links are resolved by the existing server scope checks, including older requests not on the current page. Period/page changes clear prior detail and document URLs, prevent false allied closing receipts and reject stale list responses. Logout invalidates pending loads. Colombia midnight is handled within the polling try/finally guard; unsaved detail edits are not discarded until editing stops.

34 isolated tests pass, including date boundaries, stale-updated-record admission criteria, stable pagination/scope, direct old links and permission denial, detailed/bounded/private notice text, actual sender accepted/failure/uncertain outcomes, original audience unchanged, actual claim/finish and idempotent replay/old webhook no-match, browser module syntax and 16 prior financial/identity/privacy regressions. Wrangler dry-run and preflight code/config/routes guard pass.

Live checks before replay: template health staff APPROVED; one Andrea reviewer matching original recipient; current case review revision10 and consent current. No recipient phone or actual customer answers are stored in this release's fixtures/review material. Post-publication outcomes are recorded separately.
