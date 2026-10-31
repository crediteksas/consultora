# Independent review of reference continuation

Review only `releases/nova-reference-source-origins-20261031` and its imported prior release code/tests. Use fake fixtures only. Do not read private operational output, production data, credentials, browser state, or contact any provider. No network, mutation, message sending, SQL migration or deployment is authorized by this review. Do not edit the implementation.

The current published CLIENTES baseline is `f3fd64f53e7e0d3049964a4f6fab384dd3941376ebae72fbe3324c654670665d`, HTML `2a4948d8f71cde22baac7873cd9958f94b975d1c4cd9151871f3c7f4e84fe087`. That baseline includes the approved SMS timeout fix, OTP delivery guards and preserved configuration. SMS SQL policy is OFF; this package must leave it off.

Problem: references from a previously authorized pilot origin other than the original CK-02 cannot continue after pressing the WhatsApp reference button. CLIENTES `referenceSourceProof` still rejects all non-CK-02 sources and looks up a hardcoded origin. NOVA already supports the nine configured pilot origins via the KORA source-proof binding. A second bug returns original rather than currently effective references, blocking legitimate replacements. No event may authorize an obsolete contact or another case.

Expected minimum scope: only `referenceSourceProof`. Require source origin CK-01..09 AND its current configured allowlist membership, with NOVA_RETAIL_ENABLED for non-CK-02; exact active-origin row; existing internal token, request/app/customer/outbox/consent guards; existing canonical read-only `kora_nova_effective_references(p_source uuid)` RPC, with fail-closed contract validation and no fallback to stale contacts. No new permissions/RLS, state transitions, messages, OTP changes or signed payload changes.

Inspect the generated function and diff, actual VM integration and signature test code, unchanged function callers and configuration. Run build, node --check, and `node releases/nova-reference-source-origins-20261031/tests/run.mjs`. Independently verify:

- The baseline bug is reproduced and candidate fixes all configured origins, while unconfigured/cross-case/cross-origin/inactive cases fail.
- Current replaced contact is allowed; obsolete contact, incorrect role, phone, app/source, version, signature and expired payload remain rejected.
- Consent and current source/app/customer bindings stay mandatory. The RPC calls the requested source only, is read-only, and errors never authorize fallback data.
- Existing per-role behavior is preserved when the other reference is absent or unauthorized. Malformed/duplicate roles and ambiguous shapes fail closed.
- Real NOVA `context`/`verifyReferenceSource` and HMAC helpers are exercised, and mocks do not simply assert fabricated final answers.
- Every byte outside `referenceSourceProof`, all HTML, bindings/flags/routes/cron and all SMS controls are unchanged.
- Publishing does not recover historical lost clicks automatically. No claim of historical event recovery, message delivery or production mutation is made by tests.

Return JSON with APPROVED or CHANGES_REQUIRED, concrete findings with file/line, commands run and observed counts, and material limitations. This is code review only. Do not activate channels, replay any real webhook, send messages, modify permissions or publish.
