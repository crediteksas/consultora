CREATE OR REPLACE FUNCTION public.nova_retail_notification_claim()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_notice public.nova_retail_notifications;v_case public.nova_retail_cases;v_attempt uuid:=gen_random_uuid();
begin
 update public.nova_retail_notifications set state='uncertain' where state='sending' and attempted_at<now()-interval '2 minutes';
 update public.nova_retail_notifications notice set state='cancelled' from public.nova_retail_cases current_case where current_case.source_id=notice.source_id and current_case.revision<>notice.revision and notice.state in ('queued','failed');
 select * into v_notice from public.nova_retail_notifications where state in ('queued','failed') and attempts<5 and next_attempt_at<=now() order by created_at limit 1 for update skip locked;
 if not found then return null;end if;
 select * into strict v_case from public.nova_retail_cases where source_id=v_notice.source_id;
 if v_case.revision<>v_notice.revision then return null;end if;
 update public.nova_retail_notifications set state='sending',attempted_at=now(),attempts=attempts+1,attempt_id=v_attempt where id=v_notice.id returning * into v_notice;
 return to_jsonb(v_notice)||jsonb_build_object('case_state',v_case.state,'store_code',v_case.store_code);
end $function$
