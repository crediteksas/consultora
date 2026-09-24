-- Venta Addi: el precio que recibe la tienda no es el crédito bruto.
-- La diferencia se identifica por medio de pago y solo el efectivo entra a Caja.
begin;

alter table public.creditos
  add column medio_pago_complementario text,
  add column referencia_pago_complementario text;
alter table public.creditos add constraint creditos_medio_pago_complementario_check
  check (medio_pago_complementario is null or medio_pago_complementario in
    ('efectivo','transferencia','tarjeta','otro'));

-- Mantiene intactas las financieras existentes. El RPC de venta sigue siendo
-- atómico y delega a la guarda Addi la conciliación de precios y crédito.
do $$
declare definicion text; anterior text; nuevo text;
begin
  definicion:=pg_get_functiondef('public.registrar_venta(text,text,uuid,jsonb,jsonb,text)'::regprocedure);
  anterior:='insert into creditos (venta_id, financiera, cuota_inicial, valor_esperado_financiera, plazo_meses, estado_conciliacion)';
  nuevo:='insert into creditos (venta_id, financiera, cuota_inicial, valor_esperado_financiera, plazo_meses, estado_conciliacion, medio_pago_complementario, referencia_pago_complementario)';
  if position(anterior in definicion)=0 then raise exception 'Cambió registrar_venta: columnas no reconocidas'; end if;
  definicion:=replace(definicion,anterior,nuevo);
  anterior:='(p_credito->>''plazo_meses'')::int,'||E'\n'||'      ''pendiente''';
  nuevo:='(p_credito->>''plazo_meses'')::int,'||E'\n'||'      ''pendiente'','||E'\n'||
    '      nullif(p_credito->>''medio_pago_complementario'',''''),'||E'\n'||
    '      nullif(p_credito->>''referencia_pago_complementario'','''')';
  if position(anterior in definicion)=0 then raise exception 'Cambió registrar_venta: valores no reconocidos'; end if;
  execute replace(definicion,anterior,nuevo);
end $$;

-- La validación del servidor usa la política de la tienda, no un porcentaje
-- enviado por el navegador. Crédito bruto puede superar el precio neto.
do $$
declare definicion text; anterior text; nuevo text;
begin
  definicion:=pg_get_functiondef('cobros_private.sincronizar_venta_addi()'::regprocedure);
  anterior:='or new.cuota_inicial+new.valor_esperado_financiera<>v.total';
  nuevo:='or new.valor_esperado_financiera<>trunc(new.valor_esperado_financiera)'||E'\n'||
    '     or new.cuota_inicial<>trunc(new.cuota_inicial)'||E'\n'||
    '     or not exists (select 1 from public.origenes o'||E'\n'||
    '       join lateral (select p.porcentaje from cobros_private.addi_politicas p'||E'\n'||
    '         where p.tipo_establecimiento=o.tipo and v.fecha>=p.vigente_desde'||E'\n'||
    '         order by p.vigente_desde desc limit 1) p on true'||E'\n'||
    '       where o.codigo=v.tienda_codigo and o.activo'||E'\n'||
    '         and new.cuota_inicial+cobros_private.addi_redondear_peso('||
    'new.valor_esperado_financiera*p.porcentaje)=v.total)'||E'\n'||
    '     or (new.cuota_inicial>0 and coalesce(new.medio_pago_complementario,'''')'||
    ' not in (''efectivo'',''transferencia'',''tarjeta'',''otro''))'||E'\n'||
    '     or (new.cuota_inicial=0 and new.medio_pago_complementario is not null)'||E'\n'||
    '     or (new.cuota_inicial>0 and new.medio_pago_complementario<>''efectivo'''||
    ' and nullif(btrim(coalesce(new.referencia_pago_complementario,'''')),'''') is null)';
  if position(anterior in definicion)=0 then raise exception 'Cambió la guarda Addi'; end if;
  definicion:=replace(definicion,anterior,nuevo);
  definicion:=replace(definicion,
    'El valor del crédito Addi y la cuota inicial deben sumar el total de la venta',
    'El pago pactado por Addi y el cobro complementario deben sumar el valor del artículo; identifica su medio');
  execute definicion;
end $$;

drop trigger if exists cobros_venta_addi on public.creditos;
create trigger cobros_venta_addi after insert or update of
  financiera,valor_esperado_financiera,cuota_inicial,medio_pago_complementario,
  referencia_pago_complementario on public.creditos for each row
  execute function cobros_private.sincronizar_venta_addi();
drop trigger if exists caja_ciclo_creditos on public.creditos;
create trigger caja_ciclo_creditos before insert or update of
  cuota_inicial,venta_id,medio_pago_complementario or delete on public.creditos
  for each row execute function public.caja_guardar_movimiento();

-- Solo el cobro complementario en efectivo aumenta la caja física. Los
-- históricos sin medio identificado conservan el comportamiento anterior.
do $$
declare nombre text; firma text; definicion text; anterior text; nuevo text;
begin
  anterior:='sum(c.cuota_inicial)';
  nuevo:='sum(case when lower(coalesce(c.financiera,''''))=''addi'''||
    ' and c.medio_pago_complementario is not null and c.medio_pago_complementario<>''efectivo'''||
    ' then 0 else c.cuota_inicial end)';
  for nombre,firma in select * from (values
    ('caja_componentes_rango','public.caja_componentes_rango(text,date,date)'),
    ('cerrar_caja','public.cerrar_caja(text,date,numeric,text)'),
    ('obtener_cuadre_caja','public.obtener_cuadre_caja(text,date)')) as x(nombre,firma)
  loop
    definicion:=pg_get_functiondef(firma::regprocedure);
    if position(anterior in definicion)=0 then raise exception 'Cambió %: no se encontró la suma de iniciales',nombre; end if;
    execute replace(definicion,anterior,nuevo);
  end loop;
end $$;

commit;
