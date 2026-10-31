# Independent review: one bounded SMS pilot

Review only this release and the previous OTP delivery release it imports. No production, provider, browser, credentials, private operational output, real phone numbers, or external network requests are authorized by this review. Use synthetic local test data only.

Baseline deployed CLIENTES worker SHA256: `9c78d1e88609bd57caaf3b1ecaad3707379ae85cb77adca82fc4ab2b2efb47fa`; baseline form: `99ba019425732ba8ad5a4778e38d71f96d4cb87c19b308f53d91a4732e927b2a`.

The provider has reported that a synchronous response can take more than the current eight seconds and recommends at least thirty seconds. This release should change exactly two bounded waits: `sendPreparedExpressSms` from 8s to 30s, and the managed SMS send UI from 20s to 90s. WhatsApp and other waits remain unchanged. `async:false`, response parsing (including the existing 202+jobId branch), five-minute OTP expiry, durable reservations, scopes, budgets, and delivery-state distinctions must remain unchanged. The HTML asset must exactly match the embedded form.

SQL policy is presently OFF and the provider key's previous allowance is consumed. This package must not activate policy, change limits or configuration, reset prior counters, send messages, or claim delivery. Any later single paid test requires separate action-time confirmation for both controls; no automatic retries or recharge. The release only changes CLIENTES, never NOVA or Sofia.

Inspect transform, generated runtime diff, manifest, config, and actual test code. Run build, syntax checks, the closed VM/PGlite/UI tests, and the closed full-workerd tests. Verify these cases are substantive rather than just assertions about mocked final values:

1. SQL policy disabled + syntactically valid provider key: no reservation or provider dispatch.
2. SQL enabled + provider 401/429: exactly one retained reservation; replay does not send again.
3. Provider timeout followed by replay/late acknowledgement: same UUID, attempt, OTP and expiry; no second POST.
4. Disabling SQL after an attempt leaves finish, status and correct cryptographic verification available, and blocks new sends.
5. SMS UI wait 90s, WhatsApp 20s, no automatic retry, double-click dispatch once, selected file objects preserved.
6. Existing delivery tracking/verification guards and exact unchanged configuration are retained.

Return JSON with `verdict` (APPROVED or CHANGES_REQUIRED), specific findings with file/line, commands and observed pass counts, and any material limitation. Approval is code-review approval only, not operational activation or proof of SMS delivery. Do not edit files or contact any provider.
