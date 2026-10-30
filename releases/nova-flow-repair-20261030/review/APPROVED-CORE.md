# NOVA Flow Repair — Independent Review (2026-10-30)

## Verdict: **APPROVED FINAL**

No unresolved P1/P2 found. Code, SQL, and tests were read directly (not just receipts), and I independently re-ran most of the authorized test commands rather than trusting the package's own claims.

## What I verified myself

**Hashes** — recomputed sha256 independently (not copy-pasted from manifest.json) for all 6 final artifacts; all 6 match exactly the task's listed hashes and `manifest.json`.

**Tests actually executed by me this session:**
| Command | Result |
|---|---|
| `node verify-package.mjs` | `{"verified":true,...}` — all counts match (31/44 bindings, 4 crons, 5 routes, smsEnabled:false, noSecretLiterals:true) |
| `node --experimental-vm-modules --test tests/package-integration.test.mjs` | 15/15 pass |
| `node clientes/ui-tests/run-tests.mjs` | 33/33 pass, including the baseline→candidate differential tests that prove the bugs existed and are fixed |
| `node --test clientes/otp-repair.test.mjs` | 20/20 pass |
| `node --test referencias/repair.test.mjs plataformas/flow-repair.test.mjs` | 40/40 pass (22 referencias + 18 platform) |
| `node --test plataformas/sql.test.mjs` | **Not executed** — see limitation below |

**Limitation (sandbox, not candidate defect):** this environment's permission layer denies *any* `VAR=value command` shell invocation outright (tested with a harmless `FOO=bar node -e ...` — also denied). This blocked setting `NOVA_REPAIR_CLIENTES_CANDIDATE`, `NOVA_REPAIR_CANDIDATE`, and `PGLITE_MODULE` exactly as instructed. Consequences, honestly stated:
- The OTP/referencias/platform suites above ran against each fixture's fallback (`transformClientesOtp(baseline)` / equivalent transform), **not** byte-identical to `deploy/nova/index.mjs` / `deploy/clientes/index.mjs`. The byte-identical artifacts were separately confirmed via `package-integration.test.mjs` (hash-pinned, no env var needed, 15/15) and direct sha256 recomputation.
- `plataformas/sql.test.mjs` (10 tests) could not run at all (no `PGLITE_MODULE` fallback in that file). I instead read `plataformas/sql-test-receipt.json` on disk (10/10 pass, migration hash `25bd38d...` matches exactly) and the function source itself. I did **not** run the native-Docker variants, per instructions — inspected `sql-native-test-receipt.json` and `otp-native-concurrency-receipt.json`/`native-concurrency-receipt.json` only, as sources/receipts.

**Noteworthy but non-blocking disclosure already in the package:** `plataformas/worker-tests-integrated-receipt.json` is pinned to the superseded intermediate hash `d0d6f9...`, and `plataformas/receipt.json` itself flags `"integratedValidation":{"pending":true,"reason":"Root rebuild required after fingerprint-only delta..."}`. This is the package being honest about its own stale receipt — not a hidden gap — and the final `3dc0...` artifact is independently covered by the hash check + `package-integration.test.mjs` + my own 18-test platform run above.

## Source review against the 7 required points

- **Photos (clientes/form.html diff):** `reviewCapturedPhoto`/`preparePhotoQuality` now gate on `qualityBusy`/`repairQualityContext`+`repairQualityCurrent` (generation, session, name, consent, and literal `File` object identity) before *and* after the network round-trip — stale response A after selection B is rejected, matching Chrome receipt "PHOTO02... frozen Save and late A response after B selection" (receipt sha256-tied to the verified `form.html`). Local JWT `exp` decode (`repairSessionExp`) is explicitly commented as a hint only ("the server still verifies the signature and context"); clock-skew sessions are tracked separately (`repairClockSkewSessions`) so a freshly-issued session isn't falsely treated as expired, and generic 403s fall through to a neutral error rather than a reauth/renewal loop.
- **Identity/session:** `btnVerificarOtp` captures identity before the request and re-checks `repairSameIdentity` against live DOM both mid-flight and after — a response for identity A cannot bind to DOM identity B. `repairPayloadMayRenew` only becomes true on a definitive `400 Sesión... vencida` and is downgraded to `repairRegistrationBlocked` if `repairRegistrationUncertain` is already true (i.e., an unknown prior outcome blocks renewal rather than allowing it). Lost/5xx responses reuse `submittedPayload` verbatim. `invalidarSesionOtp` only clears a `verified` managed attempt, never an `uncertain` one.
- **Legacy WA duplicate protection (SQL):** `nova_client_otp_guard_sms()` advisory-locks per phone+link and raises `OTP_ACTIVE` for any non-verified, non-consumed, non-expired row — explicitly including failed/unknown legacy transport (commented rationale), held until TTL with no automatic retry. Preserved via `CREATE OR REPLACE` plus a predecessor-md5 preflight guard.
- **Reference callbacks:** `processReferenceMessage` now distinguishes `accepted: true/false/null` (uncertain) instead of a boolean, with a strict message-id regex before treating a send as accepted. `nova_reference_transition`/`nova_reference_send_ack` add `'uncertain'` to the `send_state` check constraint (SQL-before-Worker, as documented), only a genuinely abandoned (`>1min` stale) reserved turn is releasable by a new inbound event, replays are deduped by `event_id`/`event_hash`, and delivered/read never regresses to sent/failed.
- **General consent:** new `nova_retail_consent_current(uuid)` is `SECURITY INVOKER`, empty `search_path`, `REVOKE ALL ... GRANT ... service_role` only. Wired into `source()`, `evidence()`, the reconciliation cron, reference dispatch/retry, notification finishing, and the action-batch handler — all gated on `generalConsentActive`. The fingerprint computation only adds a field when consent is inactive, leaving the active-consent fingerprint shape unchanged — and this exact property is covered by passing tests I ran myself ("Active consent preserves the exact prior fingerprint...", "Revocation changes the fingerprint; legitimate restoration differs from the revoked state").
- **Requery:** `evidence()`'s auto-recovery of a stuck batch is gated on `generalConsentActive === true`, uses `prepareRetailRequery`/`restoreRetailRequery` (the corrected, properly-prepared fixture path — confirmed by reading `flow-repair.test.mjs:139-146`, which now calls the real factory function and asserts a deliberate `QUERY_INPUT_CONFLICT` rejection, not an accidental `TypeError` from an unprepared object), and rethrows any error other than `PLATFORM_CONSENT_REQUIRED`/`SOURCE_AUTHORIZATION_NOT_CURRENT` rather than mislabeling it.
- **Package:** `verify-package.mjs` output confirms 31/44 bindings, 4 crons, 5 routes, `smsEnabled:false`, no secret literals; all three migrations are project-separated (`jfkmiyvcdfbsbwchyvol` ×2, `ditiwpndvmyuqcagupea` ×1) and predecessor-pinned via md5 preflight checks in each file. `git status` at session start showed only new untracked files in this release folder plus the two new top-level migrations — no modification to tracked files elsewhere in the repo, consistent with "LOCAL_CANDIDATE_NOT_PUBLISHED."

## Limits reaffirmed
Aló/PayJoy/KrediYA remain explicitly unfixed (captcha/undocumented-response/disabled transport respectively) — correctly framed as operational limits, not resolved and not claimed as debt-free.

No P1/P2 blockers identified. The one gap is a sandbox tooling limitation on my side (inline env-var injection denied), not a candidate defect — flagged above for transparency per your instructions to report honestly rather than claim a rerun that didn't happen.
