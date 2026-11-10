# Aliados video: published and verified

## Publication status

The primary agent reported successful scoped publication and live verification on29October2026. Final code commit: `d1f0dad4`. Active Worker version: `b3d2aacb-6bb6-47e0-9fd2-8208eaf21017`; deployed source SHA256: `c0c7105e598929dbd31e4695f84a68d9fe908e352f23938c0954d8d1b0051f8d`. Cloudflare API readback matched the exact published source; protected settings, bindings, domains and subdomain configuration were unchanged. Apps Script version34 was published and verified separately. The sanitized receipt is `evidence/publication-receipt.json`.

Óscar authorized backup, Claude review, commit, push and publication. Claude approved the implementation and final narrow deltas, including the Workers-compatible manual redirect. The earlier automatic-review production-read block was resolved before publication. The exact predecessor source imported under baseline/registro-alo.mjs remains SHA256 `ec96c1f2c408796d5f3281e3ee9c396fd554606c4b37792a356843fce44ab983` (67263bytes). Its bundled legacy client HTML and Pending HTML/JS were compared with the prior snapshot; the active Aliados form was checked through its rendered DOM, including its second facade inline script.

The builder itself performs no publication. Future releases still require their own current source/configuration comparison, review and scoped authorization; do not treat these preserved snapshots as an automatic authorization to overwrite later production.

The work was prepared in an isolated worktree starting at5eef761b. No credential values, customer videos, case inventories, signed contracts, Gmail bodies or government identifiers from reviews were copied into this change. Existing public form placeholder examples remain as source text; private one-off ally audit helpers were deliberately excluded from backend snapshots.

## Problem and behavior

Before this release, corrections rejected non-.mp4 filenames before upload. Initial registration accepted other video MIME types without converting them and falsely marked >20MB files as “se enviará aparte” although no upload happened.

The published implementation accepts common video files and prepares genuine MP4 before the existing upload. Genuine MP4 bytes are retained, even if the original filename/MIME is misleading. Other formats use local browser encoding first, then single-thread FFmpeg.wasm for codecs the browser cannot decode. Native conversion and WASM loading/execution are bounded and cancellable; source fields, the original input and any previous stored video are preserved on failure. Corrections disable the selected input until upload finishes and recheck its identity immediately before the API call, preventing staleA after selectingB.

FFmpeg decodes/probes all streams, encodes H264/AAC, checks that original audio remains present, verifies full duration and enforces20MB output. Files over100MB, unreadable/corrupt/encrypted media, unsupported codecs or insufficient device resources fail with a concrete message. No claim is made that every possible file/codec can be converted.

## Scope and frozen baseline

- `src/registro-assets-worker.mjs` delegates to a thin generated candidate importing the exact fresh Worker backup without rewriting it. It preserves the bundled NOVA legacy client form, Aló controls and pending flows; it substitutes only the Pending script body with the predecessor security headers and transforms only the Aliados HTML response. The ordinary repository Worker was older than these known published features and could not safely replace them directly.
- `baseline/registro-alo.mjs`, form.html, pendientes-app.js and pendientes.html are public-code snapshots. SHA256 pins in baseline-manifest.json protect the predecessor reference; the final deployed source is verified separately in the publication receipt. No byte-for-byte equality is claimed between the historical full form snapshot and the current raw static asset.
- Readable converter modules are in creditek/convenios/video-mp4.mjs and video-ffmpeg.mjs. Vendor wrapper/coreJS and package integrity metadata are in video-codec/. The32MB WASM is not committed.
- `build-candidate.mjs` and build-codec-assets.mjs reproducibly generate the Worker and prepared form from that reference and readable modules. The exact Aliados HTML transformation fails on unknown drift and is idempotent on the prepared asset. It does not modify the client registration HTML or other platform APIs.
- The codec router exposes a closed list of public code paths, GET/HEAD only. Only the fixed versioned WASM URL is proxied; no user cookies, Authorization, body or query parameters are forwarded. No new arbitrary proxy, customer upload endpoint, account access or paid service is created.
- The WASM code stays local in the browser. Size and SHA256 are verified before execution. Single-thread core does not require new COOP/COEP/SharedArrayBuffer settings.

## Backend changes: applied in Apps Script v34

`apps-script/Codigo-video-validation.patch` inserts final-MP4 validation before claim/folder/mail effects. Its base is the knownv33 Código.gs with the three latest signature-deferral email text changes. The primary agent applied the five-line insertion to the checked livev33 source and verified its readback before publishingv34. Do not reapply this patch blindly to v34 or replace Código.gs from the older repository/full snapshot.

`apps-script/Pendientes-video-filter.patch` expands only the picker accept filter. The existing server MIME/container/extension validation remains strict MP4. The tiny baseline/pending-file-validator.gs is the validator alone; full Pendientes.gs was excluded because it contains one-off private review helpers. The primary agent applied and verified this one-line filter change together with the validation guard, then published Apps Scriptv34. No private backend backup or one-off review data was added to Git.

## Build and verification

    npm run build:aliados-video
    npm run test:aliados-video
    npm run build:registro
    node --test tests/security/registro-isolation.test.mjs
    node --check releases/aliados-video-20261029/registro-video-candidate.mjs
    git diff --check

There are40 new converter/integration/wrapper tests, plus14 existing convenio and4 registration-isolation tests; total58. Existing suites are counted separately from new coverage. Cases include stale file selection, malformed MP4, no rename-only conversion, no false upload success, hanging AudioContext resume cleanup, hanging lazy/module imports, cancellation, asset integrity and missing output audio. The isolation fixture now returns the real prepared Aliados form so its existing deny-route assertions remain meaningful.

Real core-WASM conversion was tested locally on four synthetic AVI/WebM/MOV/MKV inputs with audio. FFprobe confirmed H264+AAC and duration differences<=0.061s. evidence/wasm-synthetic-conversions.json records those results. Chrome browser verification was also completed: a full MOV conversion preserved duration/audio and form fields locally; live production MOV and AVI preparation succeeded. Safari and other device/browser combinations were not certified by these checks. Successful FFprobe in this pinned core can return sentinel-1; it is accepted only together with a freshly written, complete, structurally valid metadata document. Other nonzero codes remain failures.

## Publication recipe and rollback

The dedicated wrangler.jsonc retained the existing ASSETS binding with keep_assets. Final API readback confirmed the exact active Worker source and unchanged protected settings/bindings/domains/subdomain configuration. **Do not use ordinary wrangler.registro.jsonc to overwrite the retained production asset set with a minimal dist/registro.** Build:registro remains a local artifact validation here. Compare the latest production source/configuration before any subsequent publication.

The final Workers fix uses `redirect: 'manual'` only for the edge CDN fetch, rejects non200 responses and cancels their bodies. Browser asset fetch retains its valid `redirect: 'error'` and standard same-origin session handling; cookies/Authorization are not forwarded to the CDN. The fixed versioned adapter path `video-ffmpeg-20261029.2.mjs` avoids retaining the earlier immutable adapter in browser caches while preserving the old route for compatibility.

Rollback requires the exact verified predecessor Worker bytes and backend version at publication time, preserving current ASSETS/bindings/routes. The frozen baseline is a reference only, not an automatically authorized rollback target. The new code sends no messages and changes no document review/credit/signature decision states by itself.

## Third-party code

@ffmpeg/ffmpeg0.12.15 is MIT; @ffmpeg/core0.12.10 is GPL-2.0-or-later. Preserve the published THIRD-PARTY-NOTICES asset, version/digest metadata and upstream corresponding-source/license references. npm tarball SHA512 integrity was verified. The core WASM SHA256 is9f57947a5bd530d8f00c5b3f2cb2a3492faa7e5d823315342d6a8656d0a6b7b7.

Primary references: https://ffmpegwasm.netlify.app/docs/getting-started/usage/ , https://ffmpegwasm.netlify.app/docs/getting-started/installation/ , https://registry.npmjs.org/@ffmpeg/ffmpeg/0.12.15 , https://registry.npmjs.org/@ffmpeg/core/0.12.10 .

## Final verification evidence

Claude approved the full implementation and final narrow deltas. The58-test gate, registration build, syntax and diff checks passed. The primary agent additionally verified a Chrome full MOV conversion at26.378333s with audio and preserved form fields, exact Apps Script source changes, the active domain/asset configuration and the final deployed Worker bytes.

The final production Chrome AVI test used an input with audio and reached “MP4 listo para enviar”; the `comercial` field still contained `PRUEBA SIN ENVIAR`. The form was not submitted during this check and the converted test output was not uploaded to Drive. This verifies preparation/conversion and preservation of the existing form data; it does not claim a new ally registration or a document approval from that test.

The active asset contains a second facade inline script. The unique configuration-script anchor was checked against the actual rendered DOM, and the second script remained byte-identical in the transformed output. The historical whole-form snapshot is retained only as a reference, not as a claim of equality to the current raw asset.
