# NOVA progress and management schema repair

The prior release selected a nonexistent created_at column from nova_retail_cases. PostgREST rejected the customer progress and staff/store list reads, while background processing and saved decisions continued.

Removes only that unsupported column from the two explicit read selects. Existing updated_at fallback remains. No database, authorization, eligibility, reference-response or connector change. Preserves identifiers, scope, privacy, pagination and day/archive filters. The real database column inventory is pinned for the regression tests, which reproduce both old failures and check corrected reads and pending-reference messages.

Eight tests pass; both existing configurations pass Wrangler dry-run. Claude was unavailable due to account quota; the user explicitly approved emergency publication without waiting. Deployment must preserve code-only modules, bindings, secrets, variables, routes and schedules, with pre/post guards.
