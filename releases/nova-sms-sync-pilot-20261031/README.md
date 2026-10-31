# SMS synchronous pilot timing — local review package

This package is preparation only. Its builder, transforms and tests do not enable SQL policy, modify an Inalambria API key, publish a Worker, send a real SMS, query a provider or access production data. An eventual single paid pilot requires its separate, precise action-time authorization and the root agent's provider/control preflight. Passing these local tests does not establish real SMS delivery.

## Exact change

The baseline is the published CLIENTES artifact preserved in `../nova-otp-delivery-20261031/deploy/clientes/`:

- Worker `9c78d1e88609bd57caaf3b1ecaad3707379ae85cb77adca82fc4ab2b2efb47fa`.
- HTML `99ba019425732ba8ad5a4778e38d71f96d4cb87c19b308f53d91a4732e927b2a`.

`transformBundle()` requires both exact SHA256 values and equality between the embedded and external baseline HTML. It applies exactly two scoped replacements:

1. In `sendPreparedExpressSms` (Worker line54; fetch line60), provider `AbortSignal.timeout(8e3)` becomes `AbortSignal.timeout(3e4)`.
2. In `solicitarOtpGestionado(channel)` (HTML line868; managed `/api/otp/enviar` fetch line886), `AbortSignal.timeout(20000)` becomes `AbortSignal.timeout(channel === 'sms' ? 90000 : 20000)`.

The external HTML and embedded `pilot_form_default` are transformed identically. Reversing these replacements restores every baseline byte. No SQL, UUID handling, five-minute OTP expiry, channel selection, reservation budget, keys, bindings, ordinary WhatsApp sender, status/verification endpoints, other timeout or automatic retry is changed. The synchronous request remains `async:false` and the strict HTTP200/consumptionId validation remains intact. The existing HTTP202/jobId queued parser is also preserved byte-for-byte; this package does not introduce async mode or a new provider-response interpretation.

Candidate artifacts:

- Worker `f3fd64f53e7e0d3049964a4f6fab384dd3941376ebae72fbe3324c654670665d`.
- HTML `2a4948d8f71cde22baac7873cd9958f94b975d1c4cd9151871f3c7f4e84fe087`.

The builder writes `deploy/clientes/index.mjs`, `deploy/clientes/form.html`, `candidate.diff` and `manifest.json`. It does not write a Wrangler configuration or mutate the previous release.

## Local verification

Run from the repository root:

```sh
node releases/nova-sms-sync-pilot-20261031/build.mjs
node --check releases/nova-sms-sync-pilot-20261031/deploy/clientes/index.mjs
node releases/nova-sms-sync-pilot-20261031/tests/run.mjs
node releases/nova-sms-sync-pilot-20261031/tests/workerd.mjs
```

`tests/run.mjs` executes 26 checks and saves the complete TAP and a hash-bound receipt. It executes the actual adapter/managed-OTP functions from the candidate prefix, the actual current verifier/HMAC/session helpers and the actual inline form script. Every outbound request is a closed mock; unrecognized destinations fail. SQL executes only inside isolated local PGlite fixtures using existing reserve/finish/status/guard definitions and the current OTP-delivery migration. No fixture identity, OTP or secret is real; generated hashes/session tokens remain in test memory and are not printed.

Covered behavior:

- Valid provider-key syntax with SQL policy disabled makes zero provider requests or reservations; invalid key configuration, worker hard-off and a nonpilot phone also send nothing.
- Provider401/429 retain one attempt and its reserved39COP; replay never makes another transport call or WhatsApp fallback.
- The original8s deadline cuts off a simulated12s synchronous acknowledgement; the candidate30s deadline accepts it without extending OTP expiry.
- A simulated31s response remains uncertain at30s. Same-UUID replay only reads its result; a distinct UUID remains blocked by the existing active-challenge guard.
- A trusted acknowledgement can finalize the same original UUID/attempt after a timeout or lost finish response, including after SQL policy is paused, with one transport call and unchanged OTP expiry.
- Pausing SQL policy during a reserved send still permits finalization, status lookup and the actual HMAC verifier to produce a session bound to the original OTP/link. New sends remain disabled; an expired OTP never becomes valid through late finalization.
- Unknown HTTP200 acceptance shapes remain uncertain. The existing202 queued parser remains unchanged.
- The actual managed UI uses90s only for SMS,20s for WhatsApp, and its original10s options/15s status waits. Browser uncertainty leads to status-only consultation; double clicks cannot create another request; original File objects stay selected.

Provider/browser delays are virtual; no real30/90second wait occurs. Because PGlite's SQL clock remains real, separate *new reservation* probes explicitly use SQL-aligned wall time to test OTP_ACTIVE/SMS_DISABLED rather than accidentally testing future-expiry validation. Existing-attempt expiry and the virtual delayed response are never changed.

`tests/workerd.mjs` additionally executes four complete-bundle cases in real workerd/Miniflare with a closed outbound service: SQL-disabled, accepted replay, provider401 replay and provider429 replay. A test-only wrapper observes native `AbortSignal.timeout` arguments and the exact same bundled handlers; this wrapper is absent from the deploy artifact. It verifies native30s provider selection while RPC remains8s, one provider call for each permitted first attempt, and no unknown destination. The sandbox initially denied its localhost listener; running this narrowly scoped local test with permission is necessary. It makes no real external calls.

Receipts distinguish VM/PGlite tests from real workerd cases; they make no claim of native PostgreSQL multi-session lock contention or real SMS delivery.

## Rollback/off distinction

Operational pause means SQL `nova_client_otp_policy.enabled=false` while retaining the existing Worker feature flag and key binding. This prevents new reservations and preserves status/finalization/verification for the already reserved attempt. Hard-disabling the Worker feature flag also disables the managed status endpoint; this package does not change that existing behavior. Do not delete or rewrite a prior dispatch row, reset its original expiry, or reuse a UUID for another attempt.

The parent agent owns configuration, independent review, any later approved publication, precise single-test authorization, provider-side limits and all live actions. None is performed by this preparation package.
