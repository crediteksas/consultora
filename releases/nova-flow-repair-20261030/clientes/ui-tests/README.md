Run from any directory:

```sh
node releases/nova-flow-repair-20261030/clientes/ui-tests/run-tests.mjs
```

The harness loads `../../baseline/clientes/form.html`, passes it through `../ui-transform.mjs`, and executes the resulting inline script in a Node VM. The baseline SHA is pinned; drift and repeat application abort. Every fetch is mocked with a closed route handler. The fixtures use synthetic identities and real local `File` objects. No browser profile, provider, OCR service, production registration or message is used.

The 33 tests include five paired negative controls: the same scenario reproduces PHOTO01, PHOTO02, OTP01, OTP02 and OTP-L01 against the pinned baseline and passes against the candidate. Other tests cover repeat expiry, late photo A responses after B selection, malformed/future claims, a local clock ahead of a freshly server-verified token, generic denial, pending 202 accepted/uncertain/reserved, and a different active context.

Registration safety: only the exact 400 `Sesión de registro inválida o vencida` before any unknown result permits replacing the cached credential after explicit verification and a successful lookup. Lost responses, 5xx, or an unknown prior result preserve the complete original payload. `found:false` after an unknown attempt does not establish that it never committed and cannot authorize a new OTP-bound registration. A successful lookup resumes the existing source. A lookup unavailable or still inconclusive remains explicit and blocks a new registration when credentials changed.

The local read of a token's expiry can only suggest verification. It grants no access, extends no TTL, and changes no signature, authorization, quality attempt counter or server validation. A freshly returned server token that already looks expired on the device suppresses that local hint to avoid a clock-skew renewal loop. A generic 403 does not claim expiry; recovery is an explicit user action.

The VM receipt records exact input/output hashes and 33 test results. Separate real Chrome evidence is in `browser/evidence/receipt.json`: four browser scenarios passed on the same generated form SHA, using a temporary profile, closed fetch mocks, blocked external DNS, route interception and CSP `connect-src 'none'`. See `browser/README.md` for reproduction and isolation details.

Neither receipt proves a production deployment, actual WhatsApp/SMS delivery, real OCR behavior, camera behavior, mobile rendering, or File persistence after closing/reloading the page. Files remain in the same page and retain their object identity through the tested operations. Root owns the server duplicate-OTP guard, build, release review and any approved publication.
