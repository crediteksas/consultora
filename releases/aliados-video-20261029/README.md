# Aliados video: reviewed release — awaiting scoped publication

## Mandatory publication hold

This release is prepared locally. Óscar subsequently authorized backup/review/commit/push/publication; the agent principal obtained a fresh Worker backup after OAuth renewal. The exact predecessor source now imported under baseline/registro-alo.mjs has SHA256 ec96c1f2c408796d5f3281e3ee9c396fd554606c4b37792a356843fce44ab983 (67263bytes). Its embedded legacy client HTML and Pending HTML/JS were compared byte-identical with the earlier snapshot by the principal. The original automatic-review production-read block is historical, not a current claim that inspection remains unauthorized.

Do not deploy until Claude approves this final thin-wrapper diff, the repository is committed/pushed under REGLAS.md, browser verification finishes and the current ASSETS/settings/routes are confirmed. Static Aliados HTML and private Apps Script source remain frozen references pending their own revalidation. No publication is performed by this builder.

The primary checkout and main branch are untouched. This worktree starts at5eef761b. No credential values, customer videos, case inventories, signed contracts, Gmail bodies or government identifiers from reviews were copied into this change. Existing public form placeholder examples remain as source text; private one-off ally audit helpers were deliberately excluded from backend snapshots.

## Problem and behavior

Corrections currently reject non-.mp4 filenames before upload. Initial registration accepts other video MIME types without converting them, and falsely marks >20MB files as “se enviará aparte” although no upload happened.

The candidate accepts common video files and prepares genuine MP4 before the existing upload. Genuine MP4 bytes are retained, even if the original filename/MIME is misleading. Other formats use local browser encoding first, then single-thread FFmpeg.wasm for codecs the browser cannot decode. Native conversion and WASM loading/execution are bounded and cancellable; source fields, the original input and any previous stored video are preserved on failure. Corrections disable the selected input until upload finishes and recheck its identity immediately before the API call, preventing staleA after selectingB.

FFmpeg decodes/probes all streams, encodes H264/AAC, checks that original audio remains present, verifies full duration and enforces20MB output. Files over100MB, unreadable/corrupt/encrypted media, unsupported codecs or insufficient device resources fail with a concrete message. No claim is made that every possible file/codec can be converted.

## Scope and frozen baseline

- `src/registro-assets-worker.mjs` delegates to a thin generated candidate importing the exact fresh Worker backup without rewriting it. It preserves the bundled NOVA legacy client form, Aló controls and pending flows; it substitutes only the Pending script body with the predecessor security headers and transforms only the Aliados HTML response. The ordinary repository Worker was older than these known published features and could not safely replace them directly.
- `baseline/registro-alo.mjs`, form.html, pendientes-app.js and pendientes.html are public-code snapshots. SHA256 pins in baseline-manifest.json prevent accidental changes to that reference; they do not certify current production.
- Readable converter modules are in creditek/convenios/video-mp4.mjs and video-ffmpeg.mjs. Vendor wrapper/coreJS and package integrity metadata are in video-codec/. The32MB WASM is not committed.
- `build-candidate.mjs` and build-codec-assets.mjs reproducibly generate the Worker and prepared form from that reference and readable modules. The exact Aliados HTML transformation fails on unknown drift and is idempotent on the prepared asset. It does not modify the client registration HTML or other platform APIs.
- The codec router exposes a closed list of public code paths, GET/HEAD only. Only the fixed versioned WASM URL is proxied; no user cookies, Authorization, body or query parameters are forwarded. No new arbitrary proxy, customer upload endpoint, account access or paid service is created.
- The WASM code stays local in the browser. Size and SHA256 are verified before execution. Single-thread core does not require new COOP/COEP/SharedArrayBuffer settings.

## Backend changes: patches only

`apps-script/Codigo-video-validation.patch` inserts final-MP4 validation before claim/folder/mail effects. Its base is the knownv33 Código.gs with the three latest signature-deferral email text changes. Apply this insertion only after reading and checking the current source. Do not replace Código.gs from the older repository or a full snapshot.

`apps-script/Pendientes-video-filter.patch` expands only the picker accept filter. The existing server MIME/container/extension validation remains strict MP4. The tiny baseline/pending-file-validator.gs is the validator alone; full Pendientes.gs was excluded because it contains one-off private review helpers. These backend patches have NOT been applied to production.

## Build and verification

    npm run build:aliados-video
    npm run test:aliados-video
    npm run build:registro
    node --test tests/security/registro-isolation.test.mjs
    node --check releases/aliados-video-20261029/registro-video-candidate.mjs
    git diff --check

There are37 new converter/integration/wrapper tests, plus14 existing convenio and4 registration-isolation tests; total55. Existing suites are counted separately from new coverage. Cases include stale file selection, malformed MP4, no rename-only conversion, no false upload success, hanging AudioContext resume cleanup, hanging lazy/module imports, cancellation, asset integrity and missing output audio. The isolation fixture now returns the real prepared Aliados form so its existing deny-route assertions remain meaningful.

Real core-WASM conversion was tested locally on four synthetic AVI/WebM/MOV/MKV inputs with audio. FFprobe confirmed H264+AAC and duration differences<=0.061s. evidence/wasm-synthetic-conversions.json records those results. These tests do not replace a real Chrome/Safari WebWorker test; browser confirmation is separately required. Successful FFprobe in this pinned core can return sentinel-1; it is accepted only together with a freshly written, complete, structurally valid metadata document. Other nonzero codes remain failures.

## Publication recipe and rollback

The dedicated wrangler.jsonc keeps the known ASSETS binding and requests keep_assets; it is a prepared recipe, not verified current deployment configuration. **Do not use ordinary wrangler.registro.jsonc to publish a minimal new dist/registro over the existing production asset set.** Build:registro is a local validation here. Revalidate the live Worker/settings/routes first and merge any subsequent changes before a scoped publication.

Rollback requires the exact verified predecessor Worker bytes and backend version at publication time, preserving current ASSETS/bindings/routes. The frozen baseline is a reference only, not an automatically authorized rollback target. The new code sends no messages and changes no document review/credit/signature decision states by itself.

## Third-party code

@ffmpeg/ffmpeg0.12.15 is MIT; @ffmpeg/core0.12.10 is GPL-2.0-or-later. Preserve the published THIRD-PARTY-NOTICES asset, version/digest metadata and upstream corresponding-source/license references. npm tarball SHA512 integrity was verified. The core WASM SHA256 is9f57947a5bd530d8f00c5b3f2cb2a3492faa7e5d823315342d6a8656d0a6b7b7.

Primary references: https://ffmpegwasm.netlify.app/docs/getting-started/usage/ , https://ffmpegwasm.netlify.app/docs/getting-started/installation/ , https://registry.npmjs.org/@ffmpeg/ffmpeg/0.12.15 , https://registry.npmjs.org/@ffmpeg/core/0.12.10 .

## Final pre-publication verification

Claude approved the full review and the final configuration-script anchor/backend-context delta (evidence/claude-review.md and claude-review-final.md). Root verified51convenio tests plus4isolation tests, build, parser checks, actual Chrome MOV conversion26.378333s with audio and preserved fields, and exact Apps Script before/after sources. Current custom domain registro.crediteksas.com and workers.dev/previews enabled values are pinned as observed; existing ASSETS is retained. The active asset has a second facade inline script; actual rendered DOM anchors were checked, and this second script is preserved. No assertion is made that the historical fullform asset snapshot is byte-identical to current rawasset.
