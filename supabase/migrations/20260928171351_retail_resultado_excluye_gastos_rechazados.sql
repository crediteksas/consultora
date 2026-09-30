-- Versión registrada en producción: 20260928171351.
-- Los gastos preautorizados solo son costo cuando su registro está aprobado.
-- Antes, la condición OR incluía también gastos rechazados en el resumen y
-- en el cierre. Preservar el resto de las definiciones vigentes y fallar si
-- cambia la condición esperada, para no sobrescribir otra lógica contable.
do $migration$
declare
  v_signature text;
  v_definition text;
  v_old text := '(cg.preautorizado or g.estado = ''aprobado'')';
  v_old_count int;
begin
  foreach v_signature in array array[
    'public.calcular_resumen_periodo(text,date,date)',
    'public.cerrar_periodo(text,date,date)'
  ] loop
    select pg_get_functiondef(to_regprocedure(v_signature)) into v_definition;
    if v_definition is null then
      raise exception 'No existe la función %', v_signature;
    end if;
    v_old_count := (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old);
    if v_old_count = 0 and position('and g.estado = ''aprobado'';' in v_definition)>0 then
      continue; -- El mismo cambio ya se aplicó por el despliegue dirigido.
    end if;
    if v_old_count <> 1 then
      raise exception 'La definición de % no contiene una condición de gasto reconocible',v_signature;
    end if;
    execute replace(v_definition,v_old,'g.estado = ''aprobado''');
  end loop;
end;
$migration$;
