-- ALO: fórmula de los archivos TIENDA y TER del 24 al 30 de agosto de 2026.
-- No cambia políticas de bonos, PayJoy, Krediya ni liquidaciones existentes.
-- Sustitución acotada: aborta si la función instalada ya no tiene el cuerpo esperado.
do $migration$
declare
  body text := pg_get_functiondef('kora_private.calcular_liquidacion_sin_datos_pago(uuid)'::regprocedure);
  old_base text := 'v_base:=coalesce(o.monto_credito,o.monto_base);';
  old_utility text := 'v_util:=round(v_base-v_pagamos-v_bonus,2);';
begin
  if (length(body)-length(replace(body,old_base,'')))/length(old_base) <> 1
     or (length(body)-length(replace(body,old_utility,'')))/length(old_utility) <> 1 then
    raise exception 'La función de cálculo cambió; revisar antes de aplicar fórmula ALO';
  end if;
  body := replace(body,old_base,
    'v_base:=case when o.plataforma=''alo'' then v_comercial else coalesce(o.monto_credito,o.monto_base) end;');
  body := replace(body,old_utility,
    'v_util:=round(case when o.plataforma=''alo'' then coalesce(o.monto_credito,o.monto_base)-v_pago-v_bonus else v_base-v_pagamos-v_bonus end,2);');
  execute body;
end;
$migration$;
