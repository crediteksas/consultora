CREATE OR REPLACE FUNCTION public.nova_retail_notification_finish(p_id uuid, p_attempt uuid, p_state text, p_recipient text, p_message text, p_error text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if p_state not in ('accepted','failed','uncertain','queued') then raise exception 'INVALID_NOTICE_STATE';end if;
 update public.nova_retail_notifications set state=p_state,attempts=case when p_state='queued' then greatest(0,attempts-1) else attempts end,recipient=p_recipient,provider_message_id=p_message,error_code=p_error,next_attempt_at=now()+interval '1 minute'*least(30,power(2,attempts)) where id=p_id and attempt_id=p_attempt and state='sending';return found;
end $function$
