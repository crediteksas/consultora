-- Acceso solo a las dos rutas del botón Autorizar pago; sin DML financiero.
create schema tesoreria_pagos_api_private;
revoke all on schema tesoreria_pagos_api_private from public,anon;
grant usage on schema tesoreria_pagos_api_private to authenticated;
alter function kora_private.recuperacion_previa(uuid) set schema tesoreria_pagos_api_private;
alter function kora_private.autorizar_con_recuperacion(uuid,numeric) set schema tesoreria_pagos_api_private;
do $$declare d text;begin
 d:=pg_get_functiondef('tesoreria_pagos_api_private.autorizar_con_recuperacion(uuid,numeric)'::regprocedure);
 if strpos(d,'kora_private.recuperacion_previa(p.id)')=0 then raise exception 'Ruta de recuperación inesperada';end if;
 execute replace(d,'kora_private.recuperacion_previa(p.id)','tesoreria_pagos_api_private.recuperacion_previa(p.id)');
end$$;
revoke all on function tesoreria_pagos_api_private.recuperacion_previa(uuid),tesoreria_pagos_api_private.autorizar_con_recuperacion(uuid,numeric) from public,anon;
grant execute on function tesoreria_pagos_api_private.recuperacion_previa(uuid),tesoreria_pagos_api_private.autorizar_con_recuperacion(uuid,numeric) to authenticated;
create or replace function public.aliados_previsualizar_cruce(p_id uuid) returns jsonb
language sql security invoker set search_path='' as $$select tesoreria_pagos_api_private.recuperacion_previa(p_id)$$;
create or replace function public.aliados_autorizar_pago_con_cruce(p_id uuid,p_neto_esperado numeric) returns public.payment_orders
language sql security invoker set search_path='' as $$select tesoreria_pagos_api_private.autorizar_con_recuperacion(p_id,p_neto_esperado)$$;
revoke all on function public.aliados_previsualizar_cruce(uuid),public.aliados_autorizar_pago_con_cruce(uuid,numeric) from public,anon;
grant execute on function public.aliados_previsualizar_cruce(uuid),public.aliados_autorizar_pago_con_cruce(uuid,numeric) to authenticated;
notify pgrst,'reload schema';
