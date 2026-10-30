Run the complete-bundle checks from the repository:

```sh
node releases/nova-flow-repair-20261030/tests/run-package-integration.mjs
```

The runner invokes Node with `--experimental-vm-modules --test`, writes TAP output and an authoritative pass/fail receipt. Alternatively, run `package-integration.test.mjs` directly with those flags; `package-integration-runtime.json` then records runtime metrics only, not the test-runner verdict.

Fifteen tests passed against the exact frozen CLIENTES and NOVA deployment bundles and both inspected predecessor bundles. All four complete modules evaluate with the same public export names. The candidate's embedded form equals the standalone tested form byte for byte (SHA `236a2de7058e8ecfad89d8b42438d90d247a907ca3c93bdaf994271476c03890`). The actual GET response preserves the existing recovery-link wrapper; removing only that known wrapper recovers the same form exactly.

The checks cover routing classification, preflight/CORS, public health responses, empty public login/workspace HTML, unauthenticated supervision/management/intake gates, credential-free document/registration/context/admin requests, malformed and oversized OTP bodies, and the SMS-off options/status/send routes. The SMS-off response cannot silently fall back to WhatsApp. A malformed unbound legacy send retains its predecessor's 410 retirement gate; managed malformed/oversized requests return 400.

The VM supplies Cloudflare class stubs and primary Node built-ins. Its process environment is empty. Global fetch is closed and audited; DNS, TCP, UDP and filesystem APIs exposed through the bundled dynamic-require shim are closed. No external module, customer credentials or live database is provided. The full run recorded zero fetch attempts, I/O attempts and deferred jobs.

The tests demonstrate the integrated frozen artifact's behavior against these unauthenticated and flag-off contracts. They do not execute scheduled work, authenticate real users, exercise credentialed SQL/provider operations, prove production deployment, or send WhatsApp/SMS messages. The intended client message changes inside the NOVA portal script are allowed; its unauthenticated login and empty workspace shell remain unchanged.
