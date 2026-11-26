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
