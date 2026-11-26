# Automatic actionable review notices

All 13 currently enabled origins retain the common detailed Andrea sender. This migration detects new actionable evidence while a case remains in review. Metadata-only case updates advance the same pending transport event without resetting attempts, backoff or lease. Delivered, uncertain and exhausted events are not replayed.

Only nova_retail_save is replaced, guarded against production drift. Consent, financial rules, origin scope, grants and Worker code are unchanged. No historical backfill or customer/provider requery.

Validation: 16 PGlite scenarios using the actual production model/summary and actual claim/finish functions; 34 sender, gateway, privacy and financial regressions. True concurrent PostgreSQL sessions are not simulated by PGlite; fixed audience locking and the existing scheduled reconcile handle transient transaction failures.

Deployment: commit and push reviewed SQL before KORA apply_migration; verify persisted definition, invoker, owner, ACL and security advisors afterward.
