-- Krediya comparte el flujo Calcular -> Revisar -> Aprobar con PayJoy y ALO.
-- Conserva el RPC anterior para pantallas abiertas, pero nunca registra una
-- revisión humana como efecto secundario de calcular. No modifica lotes.
do $migration$
declare
  definition text;
  automatic_review constant text := $old$l:=public.aliados_cambiar_estado(p_id,'revisada','Cálculo Krediya v2 enviado a aprobación. Diferencias de PVP en seguimiento independiente.');$old$;
begin
  definition := pg_get_functiondef('krediya_private.calcular_y_enviar_aprobacion(uuid)'::regprocedure);
  if strpos(definition, automatic_review) = 0
    or strpos(definition, 'perform kora_private.preparar_catalogo_liquidacion(p_id);') = 0 then
    raise exception 'Cambió el motor Krediya: revisar la separación de cálculo y revisión';
  end if;
  definition := replace(definition, automatic_review,
    'select * into l from public.liquidations where id=p_id;');
  definition := replace(definition,
    '-- El clic explícito «Calcular y enviar a aprobación» deja revisión auditada.',
    '-- La revisión administrativa se registra únicamente con Marcar como revisada.');
  execute definition;
end $migration$;
