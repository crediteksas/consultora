# OTP delivery projection — local migration candidate

Target: KORA `jfkmiyvcdfbsbwchyvol`. Generated filename using `supabase migration new`; nothing has been applied to production by this package's author.

The new `nova_otp_delivery_receipts` table binds one hashed OTP to one immutable WhatsApp `wamid`. The accepted timestamp is immutable and remains separate from late signed delivery failure. Existing OTP hash, expiry, verification-attempt count, accepted/failed API timestamps, reservation functions, quotas, and the five-minute active-challenge guard remain intact. There is no historical backfill, resend, SMS activation, or photo/customer/consent mutation in this SQL.

All five new functions are `SECURITY INVOKER`, have an empty `search_path`, and have PUBLIC/anon/authenticated execution revoked. The table has RLS and only service_role select/insert/update privileges; no public policies, grants, or DELETE privilege are added.

## Backend contracts

- `nova_otp_delivery_register(p_otp_id uuid,p_cedula text,p_celular text,p_enlace_registro_id uuid,p_provider_message_id text)` validates the complete original OTP context and active link/origin. Creating a mapping requires a live, unverified, unconsumed, hashed OTP with no API failure. Exact replay returns the original mapping without reassigning a message ID or timestamp, including after expiration. One message ID cannot bind a second OTP. `envio_aceptado_at` is set only when previously null.
- `nova_otp_delivery_read(p_cedula text,p_celular text,p_enlace_registro_id uuid,p_otp_id uuid default null)` validates the active link/origin and returns the latest bound, hashed OTP created in the preceding 24 hours. The optional opaque OTP/attempt UUID pins polling to that exact attempt **and** the same identity/link; a newer attempt from another device cannot replace its result. Three-argument calls retain the default latest-context behavior. For existing untracked records, `registered:false` and `providerMessageId:null`; neither phone/time proximity nor a matching client name creates a mapping.
- `nova_otp_delivery_apply(p_otp_id uuid,p_provider_message_id text,p_state text,p_event_at timestamptz,p_error_code text default null)` accepts only the already registered exact message ID. The trusted backend must call it exclusively with events read from authenticated NOVA and signed AURA webhook evidence. This SQL does not itself authenticate a Meta signature. It rejects events preceding OTP creation by more than one second and events over 60 seconds into the future. Progress cannot regress and older progress events are ignored. A signed `failed` is terminal even when its timestamp predates an existing delivered/read event; contradictory evidence never re-enables verification or triggers a resend. Original signed event history remains in AURA; this table is a projection.

Read/register JSON fields: `found`, `registered`, `otpId`, `providerMessageId`, `createdAt`, `expiresAt`, `acceptedAt`, `state`, `errorCode`, `eventAt`, `checkedAt`, `verified`, `consumed`, `expired`, `retryAfter`. Missing matching OTP returns only `{found:false}`. `retryAfter` remains the actual unexpired challenge wait, capped at 300 seconds, including confirmed failures; this change does not relax the existing resend guard. For untracked OTPs `state` may be `uncertain`; expiry is a separate boolean. Apply returns `applied`, `otpId`, `providerMessageId`, `state`, `acceptedAt`, `eventAt`, `errorCode`, `checkedAt`.

The `nova_otp_delivery_verify_guard` trigger only handles a false/null → true `verificado` transition for an existing bound, hashed OTP. It raises `OTP_DELIVERY_FAILED` if the exact mapped message is failed. The apply RPC locks the OTP before its receipt; the verification trigger locks the receipt for share, so a committed failure cannot be bypassed using an older HTTP metadata read. A verification that completed before a later failure event is not rewritten. Plaintext and unrelated updates keep their prior behavior.

## Validation

```sh
node --test releases/nova-otp-delivery-20261031/sql-tests/delivery.test.mjs
```

The PGlite suite uses real PostgreSQL role checks, PL/pgSQL, RLS metadata and triggers with synthetic identities. It checks anonymous denial; identity/link mismatch; replay and immutable mapping; stale/future and out-of-order events; failure verification denial; accepted history, expiry and original function/ACL preservation; and isolation between old and newer attempts. It makes no real provider requests and no production mutations. See `sql-tests/receipt.json` for the exact SQL SHA and result.

Native concurrency tests have not run in this environment: no native Postgres installation, Docker daemon, or former colima Docker context was available. PGlite is not presented as evidence of two independent native sessions racing.

Current official references checked: [Database functions](https://supabase.com/docs/guides/database/functions), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase changelog](https://supabase.com/changelog). The Oct30 timezone notice concerns Vancouver/Edmonton/Casablanca, not this UTC delivery projection or America/Bogota.
