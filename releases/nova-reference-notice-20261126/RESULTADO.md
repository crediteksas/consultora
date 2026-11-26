# Clear reference notices in NOVA

User requested review of references and clear advisor actions. Live responses were inspected directly in the appropriate databases and the authenticated NOVA detail. Two mismatched reference categories and an existing front-photo review are pending. No customer identifiers/responses are included in these release artifacts.

Two display-only changes:
- Add the existing personal_reference_is_family reason to the secondary observation dictionary, removing the contradictory reason-unavailable fallback for that known reason.
- For a completed family reference that confirms knowing/contact details but reports a valid non-family relationship, the commercial pending detail explicitly asks Creditek to clarify the relationship with the store. Refusal, contact problems and other reasons retain their prior priority/text.

No decisions, states, thresholds, source references, eligibility, permissions, DB functions, financial jobs or outbound messages are changed. Existing replace-personal action, family review and front-photo review are preserved. No automatic reclassification or approval.

25 tests pass with `node --experimental-vm-modules --test tests.mjs regression-overdue.test.mjs`: positive and excluded review cases, known/unknown reason, other pending items, immutable inputs, closed-case privacy, whole-source semantic diff limited to the two edits, embedded module syntax and financial/identity/freshness regressions. Worker syntax and Wrangler dry-run pass.

Captured live code/settings/routes. Only creditek-nova version is published; clientes remains untouched. Preflight and postflight guards compare exact module hashes and configuration. The internal observation dictionary is staff-only; commercial projection continues to hide platform details and exposes only actionable pending information.
