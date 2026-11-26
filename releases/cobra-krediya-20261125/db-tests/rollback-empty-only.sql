-- REVIEW ONLY. Existing history must be retained; do not drop populated tables.
begin isolation level read committed;
set local lock_timeout='5s';
set local row_security=off;
lock table public.credit_collection_events,public.cobra_krediya_cuts,public.cobra_krediya_cut_operations in access exclusive mode;
do $$begin
 if exists(select 1 from public.credit_collection_events where operation_id is not null or client_request_id is not null) or exists(select 1 from public.cobra_krediya_cuts) or exists(select 1 from public.cobra_krediya_cut_operations) then
  raise exception 'cobra_history_exists_forward_correction_required';
 end if;
end$$;
drop trigger cobra_events_no_truncate on public.credit_collection_events;
drop trigger cobra_krediya_guard_event_history on public.credit_collection_events;
drop function public.cobra_krediya_guard_event_history();
drop function public.cobra_krediya_save_collection(uuid,uuid,text,text,text,date,numeric);
drop policy cobra_quality_events_read on public.credit_collection_events;
drop policy cobra_quality_events_insert on public.credit_collection_events;
drop trigger cobra_krediya_validate_event on public.credit_collection_events;
drop function public.cobra_krediya_validate_event();
revoke insert(operation_id,client_request_id,obligation_id,actor_type,event_type,channel,note,promise_date,promise_amount,created_by) on public.credit_collection_events from authenticated;
alter table public.credit_collection_events drop constraint credit_collection_event_existing_reference;
alter table public.credit_collection_events drop column operation_id;
alter table public.credit_collection_events drop column client_request_id;
alter table public.credit_collection_events alter column obligation_id set not null;
drop function public.cobra_krediya_payload_digest(jsonb);
drop function public.cobra_krediya_save_cut(uuid,text,date,date,text,jsonb);
drop trigger cobra_krediya_link_cut on public.cobra_krediya_cuts;
drop trigger cobra_krediya_prepare_cut on public.cobra_krediya_cuts;
drop function public.cobra_krediya_link_cut();
drop function public.cobra_krediya_prepare_cut();
drop table public.cobra_krediya_cut_operations;
drop table public.cobra_krediya_cuts;
drop function public.cobra_quality_document(text);
drop function public.cobra_quality_fold(text);
drop function public.cobra_quality_importer();
drop function public.cobra_quality_operator();
drop function public.cobra_krediya_immutable();
commit;
