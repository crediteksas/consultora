# CLIENTES OTP transport repair — local candidate

The production bundle silently returned `smsEnabled:false` before the options RPC reached Supabase. Real workerd reproduces two independent runtime errors: invoking native `fetch` as `deps.fetcher(...)` binds the wrong receiver (`Illegal invocation`), and Workers rejects `redirect:"error"` before the request is sent.

The candidate changes exactly three functions:

- `smsOtpDependencies`: uses a small arrow wrapper around global `fetch`, preserving its native receiver when used through the dependency object.
- `rpc`: uses supported `redirect:"manual"` and refuses every 3xx response, cancels its body, and retains `{ok:false,uncertain:true}`. It never follows Location.
- `novaActiveOtp2`: applies the same supported mode and 3xx refusal to the legacy WhatsApp active-challenge lookup. Existing fail-closed recovery behavior remains unchanged.

All bytes outside those three functions, the embedded form, and the standalone form are unchanged. No SQL, grants, permissions, validation, policy, budget, other Worker, logging, or public response contract changes are included. `wrangler.jsonc` is maintained separately by the root agent from the current live configuration; this build never rewrites it.

## Frozen artifacts

- Baseline Worker SHA-256: `6010453e3c6aa8d07fb9e4f213c67119cd0a8c9360a864a861b727810ff5fee4`
- Candidate Worker SHA-256: `97cc1e52d59e78d077b947b2ec24ac0960200021bb8ae830922fdc081b65c772`
- Unchanged form SHA-256: `ef6c89485e34b4b80f7df3e68f962c0ac66232d4a0e7ec8e3a06073554810b07`
- Diff: `candidate.diff`; pinned deterministic builder: `build.mjs` / `transform.mjs`.

## Verification

Run from the repository root:

```sh
node releases/nova-sms-rpc-diagnostic-20261030/build.mjs
node --check releases/nova-sms-rpc-diagnostic-20261030/deploy/index.mjs
node --test --test-reporter=tap releases/nova-sms-rpc-diagnostic-20261030/tests/contract.test.mjs releases/nova-sms-rpc-diagnostic-20261030/tests/route-regressions.test.mjs
node releases/nova-sms-rpc-diagnostic-20261030/tests/workerd.mjs
node releases/nova-sms-rpc-diagnostic-20261030/tests/workerd-bundle.mjs
```

- **23/23 Node checks**: 10 pinned-scope/transport contract checks, including 404 PGRST202, 401, 403/42501, network failure, malformed JSON, true/false, redirect refusal, and no raw private values in normalized outcomes; plus 13 previous route/WA replay/DOM/PGlite regressions against the final candidate. The prior route-control test is explicitly labeled as such. SQL fixtures are only local; SQL guard behavior remains unchanged.
- **16/16 real workerd helper checks**: native receiver + manual mode still fails `Illegal invocation`; wrapped receiver + error mode still fails unsupported redirect; wrapper + manual sends exactly one request to the mock and succeeds on 200. Both helpers refuse 302, with zero requests to the redirect target. Baseline failures reach zero outbound stubs. The harness executes the actual three helper bodies and preserves the native receiver when observing failures.
- **3/3 full-bundle real workerd checks**: unchanged complete baseline `/api/otp/opciones` returns 200/false with zero options RPCs; complete candidate returns 200/true with one RPC. Complete candidate `/api/otp/enviar` SMS and identical replay return `accepted` with exactly one mocked provider request, one reservation, one CAPTCHA, and one finish. `accepted` is not presented as delivered.

Workerd tests use installed Miniflare/Wrangler 4.156.0. The local sandbox initially refused a localhost listener (EPERM); the tests then ran with the narrowly approved local execution escalation. All outbound destinations are intercepted by a closed `outboundService` mock. No real provider calls, customer messages, production writes, real credentials, deployment, commit, or live OTP were performed by this candidate's tests.

Receipts: `tests/node-results.tap`, `tests/receipt.json`, `tests/workerd-receipt.json`, `tests/workerd-bundle-receipt.json`, and `tests/validation-summary.json`. Any older `route-results.tap` is an intermediate run and is superseded by `node-results.tap` for the final hash.

## Official runtime references

- Cloudflare Request API: https://developers.cloudflare.com/workers/runtime-apis/request/ — supported redirect modes are `follow` and `manual`.
- Cloudflare illegal invocation guidance: https://developers.cloudflare.com/workers/observability/errors/#illegal-invocation-errors — native functions can require their original receiver; a wrapper avoids calling the native function as a property of another object.

Status: local review candidate only. Root is responsible for independent review, baseline recheck, configuration preservation, authorized publication, and any separately authorized real pilot.
