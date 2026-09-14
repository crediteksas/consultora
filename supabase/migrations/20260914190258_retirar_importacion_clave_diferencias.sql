-- Preserve every authorization, financial guard, backup and audit operation.
-- krediya_diferencias uses operation_id, not id, as its row key.
do $migration$
declare definition text;
 old_line text := 'execute format(''select id from public.%I where liquidation_id=$1 order by id for update'',v_table) using p_id;';
 new_line text := 'if v_table = ''krediya_diferencias'' then
      execute ''select operation_id from public.krediya_diferencias where liquidation_id=$1 order by operation_id for update'' using p_id;
    else
      execute format(''select id from public.%I where liquidation_id=$1 order by id for update'',v_table) using p_id;
    end if;';
begin
 select pg_get_functiondef('kora_private.eliminar_importacion(uuid,text)'::regprocedure) into definition;
 if position(old_line in definition)=0 then raise exception 'Unexpected removal function: aborting'; end if;
 execute replace(definition,old_line,new_line);
end $migration$;
