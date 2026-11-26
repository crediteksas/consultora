# Production verification — 2026-11-26

Implementation commit dbe029e2 pushed before publication. Both migrations applied successfully to their separate projects.

- creditek-nova: be9a82a5-8eb2-4a72-a29c-cb9dce3229fb, 100% traffic.
- creditek-clientes: 1c47c0e4-8253-4106-9879-0e4404637ed9, 100% traffic.
- Postflight guard PASS: module hashes equal committed candidate; bindings, variables, secret names, compatibility, routes and schedules preserved.
- 22 persisted function definitions equal exact baseline-plus-origin patches, owners/ACL/security-definer preserved.
- Security advisor counts unchanged: KORA 5, AURA 6.
- SMS policy hash excluding allowed_origins unchanged: e2369ac72aa3bcccf4e63622d216aa81. Only Lujo added to origin scope. Read-only options report SMS enabled, budget available, no cost anomaly. No SMS sent.
- Lujo Red: one active general registration link, one active business-level seller, zero personal login members, active origin assigned to Luis Rivera.
- Authenticated live AURA catalog under Aliados Luis Rivera shows LUJO RED SAS active with Copiar enlace. Clicked copy and read its exact data-copy-link destination. No link was revoked and no other store altered.
- Opened the signed URL in Chrome: form finished loading with Registrando para: LUJO RED SAS, active seller LUJO RED SAS, both references, three photo inputs, consent and submit. No real client data entered, no OTP requested, no providers queried.

Andrea already has authenticated read/copy permission, so can copy from AURA -> Registro de clientes -> Aliados Luis Rivera -> LUJO RED SAS. This was verified using Oscar's existing session, not by impersonating Andrea.

Personal operator login to NOVA remains pending contact name and mobile number. The user was asked asynchronously; no personal identity was invented. These deployment/UI checks do not constitute a live customer full-flow completion.
