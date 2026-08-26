begin;
create function cartera.reject_stale_obligation_snapshot() returns trigger language plpgsql as $$
begin
  if new.source_updated_at < old.source_updated_at then return old; end if;
  return new;
end $$;
create trigger obligation_snapshot_freshness before update on cartera.obligations for each row execute function cartera.reject_stale_obligation_snapshot();
commit;
