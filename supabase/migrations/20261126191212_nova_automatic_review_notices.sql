SET LOCAL lock_timeout='5s';
SET LOCAL search_path=pg_catalog,public;
DO $guard$ BEGIN
 IF pg_get_functiondef('public.nova_retail_save(uuid,text,jsonb,jsonb)'::regprocedure) IS DISTINCT FROM $baseline$CREATE OR REPLACE FUNCTION public.nova_retail_save(p_source uuid, p_fingerprint text, p_decision jsonb, p_summary jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare s public.kora_nova_sources; r public.nova_retail_cases; v_state text:=p_decision->>'state'; v_rejected timestamptz; v_revision integer; v_until timestamptz; v_previous_state text; v_consent_active boolean;
begin
 if p_fingerprint !~ '^[a-f0-9]{64}$' or v_state not in ('authorized','rejected','review','waiting','correct') or octet_length(p_summary::text)>65536 then raise exception 'INVALID_DECISION';end if;
 select * into strict s from public.kora_nova_sources where solicitud_id=p_source;
 if (s.registration->>'p_origen_codigo' ~ '^(CK-0[1-9]|distritoys|club-seven|ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C|ALIADO-5D608D3F-BDE6-45FB-B736-F5040577C63B)$') is not true then raise exception 'OUT_OF_SCOPE';end if;
 v_consent_active:=public.nova_retail_consent_current(p_source);
 perform pg_advisory_xact_lock(hashtextextended('nova-retail-customer:'||s.cliente_id::text,0));
 select * into r from public.nova_retail_cases where source_id=p_source for update;
 if found and r.fingerprint=p_fingerprint and (r.valid_until is null or r.valid_until>now()) and (v_consent_active or r.decision->'reasons' ? 'consent_revoked') then return to_jsonb(r);end if;
 v_previous_state:=r.state;
 v_revision:=coalesce(r.revision,0)+1;
 select max(rejected_at) into v_rejected from public.nova_retail_cases where cliente_id=s.cliente_id and rejected_at>now()-interval '15 days';
 if v_rejected is not null then
  v_state:='rejected';p_decision:=p_decision||jsonb_build_object('state','rejected','canProcess',false,'requiresAndrea',false,'reasons',jsonb_build_array('rejection_cooldown'),'overrideAllowed',false);
 elsif v_state='rejected' then v_rejected:=now();end if;
 if s.revoked_at is not null or v_consent_active is not true then
  v_state:='review';p_decision:=jsonb_build_object('state','review','canProcess',false,'requiresAndrea',true,'reasons',jsonb_build_array('consent_revoked'));
 end if;
 v_until:=case when v_state='authorized' then coalesce(r.renewed_at,s.submitted_at)+interval '15 days' else null end;
 if v_until<=now() then v_state:='review';p_decision:=p_decision||jsonb_build_object('state','review','canProcess',false,'requiresAndrea',true,'reasons',jsonb_build_array('renewal_required'));v_until:=null;end if;
 insert into public.nova_retail_cases(source_id,cliente_id,store_code,fingerprint,revision,state,decision,summary,rejected_at,valid_until)
 values(p_source,s.cliente_id,s.registration->>'p_origen_codigo',p_fingerprint,v_revision,v_state,p_decision,p_summary,v_rejected,v_until)
 on conflict(source_id) do update set fingerprint=excluded.fingerprint,revision=excluded.revision,state=excluded.state,decision=excluded.decision,summary=excluded.summary,rejected_at=excluded.rejected_at,valid_until=excluded.valid_until,manual_actor=null,manual_note=null,updated_at=now()
 returning * into r;
 insert into public.nova_retail_case_events(source_id,revision,actor_name,action,payload) values(p_source,r.revision,'NOVA','automatic_validation',jsonb_build_object('decision',p_decision,'summary',p_summary));
 if v_state in ('review','authorized','rejected') and v_previous_state is distinct from v_state then
  insert into public.nova_retail_notifications(source_id,revision,audience) values(p_source,r.revision,'andrea') on conflict do nothing;
  if v_state<>'review' then insert into public.nova_retail_notifications(source_id,revision,audience) values(p_source,r.revision,'store') on conflict do nothing;end if;
 end if;
 return to_jsonb(r);
end $function$
$baseline$ THEN RAISE EXCEPTION 'NOVA_SAVE_BASELINE_CHANGED'; END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.nova_retail_save(p_source uuid, p_fingerprint text, p_decision jsonb, p_summary jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare s public.kora_nova_sources; r public.nova_retail_cases; v_state text:=p_decision->>'state'; v_rejected timestamptz; v_revision integer; v_until timestamptz; v_previous_state text; v_consent_active boolean; v_old_summary jsonb; v_old_decision jsonb; v_old_revision integer; v_notice public.nova_retail_notifications; v_tasks jsonb; v_gains boolean:=false; v_andrea public.nova_retail_notifications; v_store public.nova_retail_notifications; v_forwarded jsonb:='[]'::jsonb;
begin
 if p_fingerprint !~ '^[a-f0-9]{64}$' or v_state not in ('authorized','rejected','review','waiting','correct') or octet_length(p_summary::text)>65536 then raise exception 'INVALID_DECISION';end if;
 select * into strict s from public.kora_nova_sources where solicitud_id=p_source;
 if (s.registration->>'p_origen_codigo' ~ '^(CK-0[1-9]|distritoys|club-seven|ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C|ALIADO-5D608D3F-BDE6-45FB-B736-F5040577C63B)$') is not true then raise exception 'OUT_OF_SCOPE';end if;
 v_consent_active:=public.nova_retail_consent_current(p_source);
 perform pg_advisory_xact_lock(hashtextextended('nova-retail-customer:'||s.cliente_id::text,0));
 select * into r from public.nova_retail_cases where source_id=p_source for update;
 if found and r.fingerprint=p_fingerprint and (r.valid_until is null or r.valid_until>now()) and (v_consent_active or r.decision->'reasons' ? 'consent_revoked') then return to_jsonb(r);end if;
 v_previous_state:=r.state;v_old_summary:=r.summary;v_old_decision:=r.decision;v_old_revision:=r.revision;
 v_revision:=coalesce(r.revision,0)+1;
 select max(rejected_at) into v_rejected from public.nova_retail_cases where cliente_id=s.cliente_id and rejected_at>now()-interval '15 days';
 if v_rejected is not null then
  v_state:='rejected';p_decision:=p_decision||jsonb_build_object('state','rejected','canProcess',false,'requiresAndrea',false,'reasons',jsonb_build_array('rejection_cooldown'),'overrideAllowed',false);
 elsif v_state='rejected' then v_rejected:=now();end if;
 if s.revoked_at is not null or v_consent_active is not true then
  v_state:='review';p_decision:=jsonb_build_object('state','review','canProcess',false,'requiresAndrea',true,'reasons',jsonb_build_array('consent_revoked'));
 end if;
 v_until:=case when v_state='authorized' then coalesce(r.renewed_at,s.submitted_at)+interval '15 days' else null end;
 if v_until<=now() then v_state:='review';p_decision:=p_decision||jsonb_build_object('state','review','canProcess',false,'requiresAndrea',true,'reasons',jsonb_build_array('renewal_required'));v_until:=null;end if;
 -- Only newly actionable evidence alerts; removing a reviewed item is not a new task.
 if v_state='review' and v_previous_state='review' and v_consent_active then
  select jsonb_object_agg(q.version,q.tasks) into v_tasks from (
   select i.version,coalesce((select jsonb_agg(distinct t.task order by t.task) from (
    select jsonb_build_object('kind','reason','value',x.value) task
    from jsonb_array_elements(case when jsonb_typeof(i.d->'reasons')='array' and jsonb_typeof(v_old_decision->'reasons')='array' then i.d->'reasons' else '[]'::jsonb end) x
    where jsonb_typeof(x.value)='string'
    union all
    select jsonb_build_object('kind','photo','type',x.value->>'type','status',x.value->>'status','hash',x.value->>'hash')
    from jsonb_array_elements(case when jsonb_typeof(i.s->'photos')='array' and jsonb_typeof(v_old_summary->'photos')='array' then i.s->'photos' else '[]'::jsonb end) x
    where x.value->>'type' in ('frente','reverso','selfie') and coalesce(x.value->>'status','') not in ('auto_approved','andrea_approved')
    union all
    select jsonb_build_object('kind','photo_issue','type',x.value->>'type','status',x.value->>'status','hash',x.value->>'hash','issue',z.value)
    from jsonb_array_elements(case when jsonb_typeof(i.s->'photos')='array' and jsonb_typeof(v_old_summary->'photos')='array' then i.s->'photos' else '[]'::jsonb end) x
    cross join lateral jsonb_array_elements(case when jsonb_typeof(x.value->'issues')='array' then x.value->'issues' else '[]'::jsonb end) z
    where x.value->>'type' in ('frente','reverso','selfie') and coalesce(x.value->>'status','') not in ('auto_approved','andrea_approved') and jsonb_typeof(z.value)='string'
    union all
    select jsonb_build_object('kind','reference','id',x.value->>'id','type',x.value->>'type','status',x.value->>'status','responded',x.value->'responded','knowsCustomer',x.value->'knowsCustomer','reportedRelationship',x.value->>'reportedRelationship')
    from jsonb_array_elements(case when jsonb_typeof(i.s->'references')='array' and jsonb_typeof(v_old_summary->'references')='array' then i.s->'references' else '[]'::jsonb end) x
    where x.value->>'type' in ('family','personal') and x.value->>'status' in ('review','replace')
    union all
    select jsonb_build_object('kind','platform','platform',x.value->>'platform','task',f.task)
    from jsonb_array_elements(case when jsonb_typeof(i.d->'platformVerification')='array' and jsonb_typeof(v_old_decision->'platformVerification')='array' then i.d->'platformVerification' else '[]'::jsonb end) x
    cross join lateral (values ('identity',x.value->'identityRequired'='true'::jsonb),('history',x.value->'historyRequired'='true'::jsonb)) f(task,required)
    where x.value->>'platform' in ('ALO','KREDIYA','PAYJOY') and f.required
   ) t),'[]'::jsonb) tasks from (values ('before',v_old_decision,v_old_summary),('after',p_decision,p_summary)) i(version,d,s)
  ) q;
  v_gains:=exists(select 1 from jsonb_array_elements(v_tasks->'after') x where not exists(select 1 from jsonb_array_elements(v_tasks->'before') old_task where old_task.value=x.value));
 end if;
 -- Lock the latest row per audience in a fixed audience order, without state filters.
 if v_state in ('review','authorized','rejected') and v_previous_state=v_state then
  for v_notice in select n.* from public.nova_retail_notifications n
   where n.source_id=p_source and n.id in (
    select distinct on(audience) id from public.nova_retail_notifications where source_id=p_source and audience in ('andrea','store') order by audience,revision desc
   ) order by n.audience for update of n loop
   if v_notice.audience='andrea' then v_andrea:=v_notice;else v_store:=v_notice;end if;
  end loop;
 end if;
 insert into public.nova_retail_cases(source_id,cliente_id,store_code,fingerprint,revision,state,decision,summary,rejected_at,valid_until)
 values(p_source,s.cliente_id,s.registration->>'p_origen_codigo',p_fingerprint,v_revision,v_state,p_decision,p_summary,v_rejected,v_until)
 on conflict(source_id) do update set fingerprint=excluded.fingerprint,revision=excluded.revision,state=excluded.state,decision=excluded.decision,summary=excluded.summary,rejected_at=excluded.rejected_at,valid_until=excluded.valid_until,manual_actor=null,manual_note=null,updated_at=now()
 returning * into r;
 if v_state in ('review','authorized','rejected') then
  if v_previous_state is distinct from v_state or v_gains then
   insert into public.nova_retail_notifications(source_id,revision,audience) values(p_source,r.revision,'andrea') on conflict do nothing;
  elsif v_andrea.revision=v_old_revision and (v_andrea.state='sending' or (v_andrea.state in ('queued','failed') and v_andrea.attempts<5)) then
   -- Forward the SAME transport event, retaining its lease, retry count and backoff.
   update public.nova_retail_notifications set revision=r.revision where id=v_andrea.id;
   v_forwarded:=v_forwarded||jsonb_build_array(jsonb_build_object('id',v_andrea.id,'audience','andrea','fromRevision',v_andrea.revision,'state',v_andrea.state));
  end if;
  if v_state<>'review' then
   if v_previous_state is distinct from v_state then
    insert into public.nova_retail_notifications(source_id,revision,audience) values(p_source,r.revision,'store') on conflict do nothing;
   elsif v_store.revision=v_old_revision and (v_store.state='sending' or (v_store.state in ('queued','failed') and v_store.attempts<5)) then
    update public.nova_retail_notifications set revision=r.revision where id=v_store.id;
    v_forwarded:=v_forwarded||jsonb_build_array(jsonb_build_object('id',v_store.id,'audience','store','fromRevision',v_store.revision,'state',v_store.state));
   end if;
  end if;
 end if;
 insert into public.nova_retail_case_events(source_id,revision,actor_name,action,payload) values(p_source,r.revision,'NOVA','automatic_validation',jsonb_build_object('decision',p_decision,'summary',p_summary)||case when jsonb_array_length(v_forwarded)>0 then jsonb_build_object('noticeForwarded',v_forwarded) else '{}'::jsonb end);
 return to_jsonb(r);
end $function$;
