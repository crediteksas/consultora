The approved core transform is preserved byte for byte in `ui-transform-approved-base.mjs`, SHA `655c7238fbeac4532cf0d051eb0b4a26d982abfccd6fb6f13dc8c163a6bb921a`. The only candidate change adds the three reviewed style lines: existing `ref-block`, `btn-secondary`, `btn-submit` classes and bounded button dimensions. No logic or existing line changes.

Run `node releases/nova-flow-repair-20261030/clientes/ui-tests/style-delta/verify-style-delta.mjs` after the VM and Chrome runners. It verifies that removing precisely those three lines reconstructs both the approved module and its generated form exactly, checks the current receipts and writes `style-only.patch` and `receipt.json`.

The updated form SHA is `ef6c89485e34b4b80f7df3e68f962c0ac66232d4a0e7ec8e3a06073554810b07`. All 33 VM tests and four real Chrome tests passed on it. Six screenshots were regenerated at a 390px mobile viewport. Chrome measured:

- Verify: 44px high, 328px wide, right edge 359px.
- Check registration: 44px high, 328px wide, right edge 359px.
- Save photos: 48px high, 318px wide, right edge 354px.

The Check button was temporarily made visible only for a CSS geometry probe, then its original hidden state was restored without triggering an action. Verify and Save were measured while visibly reached by the actual mocked user flow. All controls fit inside the 390px viewport. The browser evidence remains synthetic, isolated and without production/provider calls.
