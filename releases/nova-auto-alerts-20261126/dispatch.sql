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
