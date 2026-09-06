-- Solo fixtures temporales. Todo se revierte; ninguna orden real se modifica.
begin;
do $$begin
  perform set_config('request.jwt.claim.sub',(select o.perfil_id::text from public.aliados_operadores o join public.perfiles p on p.id=o.perfil_id where o.activo and p.activo and o.capacidad='revisor' limit 1),true);
  assert auth.uid() is not null,'Revisor de prueba disponible';
end$$;
insert into public.origenes(codigo,nombre,tipo,activo) values ('TEST-TC-ROLLBACK-1','TEST TC 1','aliado',true),('TEST-TC-ROLLBACK-2','TEST TC 2','aliado',true);
do $$declare h uuid; a uuid; result jsonb; v_before text; begin
  select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.id)::text,'')) into v_before from public.payment_orders p;
  result:=public.tesoreria_guardar_cliente_cuenta('TEST-TC-ROLLBACK-1',null,'Titular prueba','990000001234567890','Banco prueba','ahorros','000001234567890',true);
  h:=(result->>'beneficiary_id')::uuid; a:=(result->>'bank_account_id')::uuid;
  assert (select origen_codigo from public.liquidation_beneficiaries where id=h)='TEST-TC-ROLLBACK-1','relación';
  assert (select numero_cuenta from public.beneficiary_bank_accounts where id=a)='000001234567890','ceros iniciales';
  perform public.tesoreria_guardar_cliente_cuenta('TEST-TC-ROLLBACK-1',h,'Titular editado','990000001234567890','Banco prueba','corriente','000001234567890',true);
  assert (select count(*) from public.beneficiary_bank_accounts where beneficiary_id=h)=1,'no duplica misma cuenta';
  perform public.tesoreria_guardar_cliente_cuenta('TEST-TC-ROLLBACK-1',h,'Titular editado','990000001234567890','Banco segundo','ahorros','000009876543210',true);
  assert (select count(*) from public.beneficiary_bank_accounts where beneficiary_id=h and activo)=1,'una cuenta activa';
  assert (select count(*) from public.beneficiary_bank_accounts where beneficiary_id=h)=2,'conserva anterior';
  begin perform public.tesoreria_guardar_cliente_cuenta('TEST-TC-ROLLBACK-2',null,'Cruce prohibido','990000001234567890','Banco','ahorros','123456',true); raise exception 'FAILED cruce'; exception when others then if sqlerrm like 'FAILED%' then raise; end if; end;
  begin perform public.tesoreria_guardar_cliente_cuenta('TEST-TC-ROLLBACK-1',null,'Obsoleto','990000001234567890','Banco','ahorros','123456',true); raise exception 'FAILED obsoleto'; exception when others then if sqlerrm like 'FAILED%' then raise; end if; end;
  begin perform public.tesoreria_guardar_cliente_cuenta('TEST-TC-ROLLBACK-1',h,'No verificado','990000001234567890','Banco','ahorros','123456',false); raise exception 'FAILED verificar'; exception when others then if sqlerrm like 'FAILED%' then raise; end if; end;
  result:=public.tesoreria_guardar_cliente_cuenta('TEST-TC-ROLLBACK-1',h,'Otro titular','990000001234567891','Banco prueba','ahorros','000001234567890',true);
  assert (select activo from public.liquidation_beneficiaries where id=h)=false,'titular anterior conservado inactivo';
  assert (select count(*) from public.liquidation_beneficiaries where origen_codigo='TEST-TC-ROLLBACK-1' and activo)=1,'un titular activo';
  assert (select count(*) from public.audit_log where accion='tesoreria_cliente_cuenta_guardado' and registro_id in (h::text,result->>'beneficiary_id'))=4,'auditado';
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin perform public.tesoreria_guardar_cliente_cuenta('TEST-TC-ROLLBACK-1',null,'Sin permiso','990000001234567892','Banco','ahorros','123456',true); raise exception 'FAILED sin capacidad'; exception when others then if sqlerrm like 'FAILED%' then raise; end if; end;
  perform set_config('request.jwt.claim.sub','',true);
  begin perform public.tesoreria_guardar_cliente_cuenta('TEST-TC-ROLLBACK-1',null,'Prohibido','990000001234567892','Banco','ahorros','123456',true); raise exception 'FAILED anónimo'; exception when others then if sqlerrm like 'FAILED%' then raise; end if; end;
  assert not has_function_privilege('anon','public.tesoreria_guardar_cliente_cuenta(text,uuid,text,text,text,text,text,boolean)','EXECUTE'),'anon sin execute';
  assert v_before=(select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.id)::text,'')) from public.payment_orders p),'órdenes intactas';
end$$;
rollback;
select 'PASS: alta, edición, relación, ceros iniciales, cuentas anteriores, duplicados, cruce rechazado, formulario obsoleto, verificación, permisos y órdenes intactas. ROLLBACK completo.' as resultado;
