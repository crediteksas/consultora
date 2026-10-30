import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const all = await readFile(new URL('./baseline-rpcs.sql', import.meta.url),'utf8');
const definition = name => {
  const start = all.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'(');
  const body = all.indexOf('$function$', start), end = all.indexOf('$function$', body+10);
  if(start<0||body<start||end<=body) throw Error('SQL_BASELINE_DRIFT:'+name);
  return all.slice(start,end+10)+';\n';
};
const status = String.raw`CREATE OR REPLACE FUNCTION public.nova_retail_reference_status(p_message_id text, p_contact_hash text, p_status text, p_at timestamp with time zone, p_error integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare d public.nova_retail_reference_dispatch; latest_at timestamptz; apply_event boolean:=false;
begin
 if (p_status in ('sent','delivered','read','failed') and p_at is not null
     and p_at<=now()+interval '1 minute') is not true then return false;end if;
 -- Serialize callbacks and retries against the currently reserved attempt/message.
 select * into d from public.nova_retail_reference_dispatch
 where provider_message_id=p_message_id and contact_hash=p_contact_hash for update;
 if not found or d.state='cancelled' or p_at<d.created_at-interval '1 minute' then return false;end if;
 if exists(select 1 from public.nova_retail_reference_dispatch_events e
   where e.reference_id=d.reference_id and e.provider_message_id=p_message_id
     and e.status=p_status and e.at=p_at and e.error_code is not distinct from p_error)
 then return true;end if;
 select max(e.at) into latest_at from public.nova_retail_reference_dispatch_events e
 where e.reference_id=d.reference_id and e.provider_message_id=p_message_id
   and e.status in ('sent','delivered','read','failed');
 -- Delivery/read proof wins over lesser states. sent/failed respect event time;
 -- on a tie, a failure must not be erased by a sent callback.
 if p_status in ('delivered','read') then apply_event:=true;
 elsif d.state not in ('delivered','read') and
   (latest_at is null or p_at>latest_at or (p_at=latest_at and p_status='failed'))
 then apply_event:=true;end if;
 if apply_event then
  update public.nova_retail_reference_dispatch set
    state=case when d.state='read' then 'read'
      when d.state='delivered' and p_status<>'read' then 'delivered' else p_status end,
    delivered_at=case when p_status in ('delivered','read')
      then least(coalesce(d.delivered_at,p_at),p_at) else d.delivered_at end,
    error_code=case when p_status='failed' then p_error else null end,
    updated_at=now()
  where reference_id=d.reference_id;
 end if;
 -- Keep stale callbacks as evidence without changing the current attempt.
 insert into public.nova_retail_reference_dispatch_events(reference_id,status,provider_message_id,error_code,at)
 values(d.reference_id,p_status,p_message_id,p_error,p_at);
 return true;
end;$function$;
`;
const ack = definition('nova_reference_send_ack')
 .replace("send_state=case when p_accepted is true then 'accepted' else 'failed' end,",
   "send_state=case when p_accepted is true then 'accepted' when p_accepted is false then 'failed' else 'uncertain' end,")
 .replace("status=case when p_accepted is true then status else 'stopped' end,updated_at=now()",
   "status=case when p_accepted is false then 'stopped' else status end,updated_at=now()");
const anchor = " if d.send_state='reserved' then return jsonb_build_object('ok',false,'retryable',true);end if;";
const recovery = String.raw` -- An invocation may end after committing a turn but before saving its transport
 -- acknowledgement. Only a new inbound event may release an abandoned lease;
 -- replay was checked above. Preserve state, evidence and original expiry.
 if d.send_state='reserved' then
  if d.updated_at>clock_timestamp()-interval '1 minute' then
   return jsonb_build_object('ok',false,'retryable',true);
  end if;
  update public.nova_reference_dialogues set send_state='uncertain',updated_at=now()
   where reference_id=p_reference_id returning * into d;
 end if;`;
const originalTransition=definition('nova_reference_transition');
if(originalTransition.split(anchor).length!==2) throw Error('SQL_TRANSITION_ANCHOR_DRIFT');
const transition=originalTransition.replace(anchor,recovery);
const signatures={
 nova_reference_send_ack:'public.nova_reference_send_ack(uuid,uuid,boolean)',
 nova_reference_transition:'public.nova_reference_transition(uuid,text,text,timestamp with time zone,integer,text,text,jsonb,text)',
 nova_retail_reference_status:'public.nova_retail_reference_status(text,text,text,timestamp with time zone,integer)'
};
const guards=Object.entries(signatures).map(([name,signature])=>{
 const body=definition(name).split('$function$')[1];
 const md5=createHash('md5').update(body).digest('hex');
 return " if (select md5(prosrc) from pg_catalog.pg_proc where oid='"+signature+"'::regprocedure) is distinct from '"+md5+"' then raise exception 'REF_REPAIR_SQL_DRIFT:"+name+"';end if;";
}).join('\n');
const output = "-- REF01 + REF02. Proposal only: no sends, no existing dialogue reopening or expiry changes.\n"+
 "-- Apply before the Worker; CREATE OR REPLACE preserves the existing service_role-only ACL.\n"+
 "do $guard$ begin\n"+guards+"\nend $guard$;\n"+
 "alter table public.nova_reference_dialogues drop constraint nova_reference_dialogues_send_state_check;\n"+
 "alter table public.nova_reference_dialogues add constraint nova_reference_dialogues_send_state_check check (send_state in ('none','reserved','accepted','failed','uncertain'));\n\n"+
 status+"\n"+ack+"\n"+transition;
await writeFile(new URL('../sql/aura-reference-repair.sql',import.meta.url),output);
console.log('Generated REF01/REF02 SQL from exact captured definitions.');

