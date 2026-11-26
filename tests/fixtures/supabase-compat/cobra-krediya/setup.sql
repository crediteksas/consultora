-- Fictional worst-case pre-existing table INSERT. Preserve it during the model;
-- column INSERT grants are an exact catalog delta, not an effective restriction
-- when this broader grant exists. RLS and validation triggers must still deny
-- forged authors, unreviewed operations, payment types and legacy direct inserts.
grant insert on public.credit_collection_events to authenticated;
