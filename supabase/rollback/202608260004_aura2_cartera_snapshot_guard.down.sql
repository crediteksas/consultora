begin;
drop trigger if exists obligation_snapshot_freshness on cartera.obligations;
drop function if exists cartera.reject_stale_obligation_snapshot();
commit;
