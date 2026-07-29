begin;

drop view if exists public.b2b_catalog_provider_stats;
drop view if exists public.b2b_catalog_price_history;
drop view if exists public.b2b_catalog_public;

drop function if exists public.rollback_b2b_catalog(uuid);
drop function if exists public.correct_b2b_catalog_offer(uuid, uuid);
drop function if exists public.build_b2b_catalog_draft(uuid);
drop function if exists public.set_b2b_catalog_utility(text, numeric);
drop function if exists public.publish_b2b_catalog(uuid);
drop function if exists public.resolve_b2b_order_items(uuid, text, text, text, text, jsonb);
drop function if exists public.b2b_is_catalog_admin(uuid);

drop table if exists public.b2b_order_dispatches;
drop table if exists public.b2b_catalog_version_items;
drop table if exists public.b2b_catalog_versions;
drop table if exists public.b2b_catalog_corrections;
drop table if exists public.b2b_catalog_normalization_rules;
drop table if exists public.b2b_catalog_offers;
drop table if exists public.b2b_catalog_imports;
drop table if exists public.b2b_catalog_products;
drop table if exists public.b2b_catalog_settings;
drop table if exists public.b2b_catalog_providers;
drop table if exists public.b2b_user_access;
drop table if exists public.b2b_catalog_admins;

commit;
