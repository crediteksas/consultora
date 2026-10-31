# WhatsApp OTP delivery status in the existing form

`transform.mjs` exports `transformForm(base)` and pins the complete published
CLIENTES HTML predecessor. The transform adds status reads without replacing
the form, fields, photo nodes, File objects or existing registration/recovery
handlers. It does not change SMS availability.

The new read-only endpoint is `POST /api/otp/estado-whatsapp`, with
`{enlace_token,cedula,celular,attempt_id?}`. The opaque KORA OTP UUID is retained
after the first identified response and sent with later status reads and legacy
verification requests. Managed SMS/WhatsApp verification keeps its prior body.
Once
bound, missing or different attempt IDs cannot change the UI, even for the same
cédula and phone. Provider message IDs are never sent by this UI. Status does
not receive or consume CAPTCHA. Expected
states are `accepted`, `sent`, `delivered`, `read`, `failed`, `uncertain`,
`expired`, `verified`, and `not_found`, with `retry_after` in 0–300 seconds.
`error_code=131026` can be shown as a diagnostic code with a concrete action.
Only the backend resolves provider IDs and signed delivery receipts.

The first status read occurs after one second, then at most every eight seconds.
Polling ends after the original attempt deadline or five minutes, whichever
comes first; a rejected delivery stops network polling immediately while a
local countdown explains when **another** request can be eligible. No timer,
network error or state transition sends another code automatically.

Generation-by-attempt and exact cédula/celular checks discard stale send/status
responses. Poll responses cannot revive a failed attempt or extend its original
expiry. Status work pauses during verification. A `verified` state from another
tab does not invent a local session.

Validation: `node --test releases/nova-otp-delivery-20261031/ui/delivery.test.mjs`
executes the real inline form script in a closed DOM/VM harness: 20 tests pass.
No live messages, browser session, CAPTCHA service, OCR or customer writes are
used by these tests. No real-browser execution is claimed by this receipt.

Existing tabs already running older HTML do not acquire this new client code
without navigation. A reload can discard unsent browser-only photo selections;
the UI change must not be described as a hot update to those tabs.
