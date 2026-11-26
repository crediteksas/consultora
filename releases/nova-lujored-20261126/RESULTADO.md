# Lujo Red: general registration entry

Requested: enable the existing active LUJO RED SAS business assigned to Luis Rivera, so Andrea can copy/share its registration link from AURA. No contact name/phone supplied; no personal shop login is created. Andrea retains her existing authenticated read/copy access.

Exact fourth origin: ALIADO-5D608D3F-BDE6-45FB-B736-F5040577C63B. The previous three allies and all retail stores remain enabled. No customer records, messages, financial queries, budgets, prices, roles or RLS are changed by this release.

Captured both current production Workers and 22 function definitions with owner/ACL/security-definer metadata. Zero existing Lujo profiles/login members/actor-email rows verified. Executive active, business type tercero valid, active general link unique index present. Captured existing SMS policy settings hash and constraints; migration checks for concurrent changes, then appends only the new origin.

30 isolated synthetic tests passed: four-origin registration and OTP reservation, reviewed documents, references, provider job enqueue/claim, decision/save, cross-store and closed-case denial, unknown ally rejection, signed/tampered/revoked link resolution, idempotent general-link creation without accounts, and all three browser scripts. The provider responses and verified OTP in these fixtures are simulated; they are not evidence of actual message delivery or customer financial responses. Both module syntax checks and Wrangler dry-runs passed.

Claude pre-review C1-C6 incorporated. Deployment order: DB migrations -> Worker versions -> postflight guard -> one-off Lujo provisioning -> live catalog/link check. One-off creates the business-level captador LUJO RED SAS only when no active seller exists, and the general link only when absent; no personal member/profile/auth account. Link creation has an audit event. No broad accounts activation.

Production scope is preserved: routes/vars/bindings/secrets/schedules checked by live-guard.py. Only these two Workers are published. No AURA or KORA shell deployment, no Sofía changes.

Migration locations: main supabase/migrations/20261126153311_nova_lujored_registration_scope.sql targets KORA. db-aura/supabase/migrations/20261126153323_nova_lujored_platform_scope.sql targets AURA only. Never run AURA migrations against the main KORA chain.

Source preservation: captured function definitions contain a pre-existing trailing-space line. It is intentionally retained; whitespace checking uses core.whitespace=-blank-at-eol and literal-diff tests prove no unrelated source edits.

Postflight outcome is recorded separately after publication. The personal operator login remains pending the user's name/phone clarification. Store customers' final credit approval remains with the financial institution; this task creates no credit request.
