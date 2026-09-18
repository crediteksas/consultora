-- Cierra el aviso operativo de la rectificacion Krediya del 8 de septiembre.
-- La rectificacion y sus importes se conservan completos para auditoria; solo
-- cambia el estado de la validacion de soportes que ya fue resuelta.
BEGIN;

DO $close_notice$
DECLARE
  adjustment_id constant uuid := '8289594a-1ed1-4568-8a19-707a380472d7';
  adjustment_row public.liquidation_adjustments%rowtype;
  closed_differences jsonb;
  closed_value jsonb;
BEGIN
  SELECT * INTO adjustment_row
  FROM public.liquidation_adjustments
  WHERE id = adjustment_id
    AND field_name = 'krediya_bonos_rectificados'
  FOR UPDATE;

  -- Otros entornos pueden no contener esta rectificacion productiva.
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(coalesce(adjustment_row.new_value->'diferencias_pagos', '[]'::jsonb)) AS item
    WHERE item->>'estado' = 'pendiente_validacion_soporte'
  ) THEN
    RETURN;
  END IF;

  SELECT coalesce(
    jsonb_agg(
      CASE
        WHEN item.value->>'estado' = 'pendiente_validacion_soporte'
          THEN jsonb_set(item.value, '{estado}', '"validado"'::jsonb, false)
        ELSE item.value
      END
      ORDER BY item.ordinality
    ),
    '[]'::jsonb
  )
  INTO closed_differences
  FROM jsonb_array_elements(coalesce(adjustment_row.new_value->'diferencias_pagos', '[]'::jsonb))
    WITH ORDINALITY AS item(value, ordinality);

  closed_value := jsonb_set(
    jsonb_set(adjustment_row.new_value, '{diferencias_pagos}', closed_differences, false),
    '{estado}',
    '"soportes_validados"'::jsonb,
    false
  );

  UPDATE public.liquidation_adjustments
  SET new_value = closed_value
  WHERE id = adjustment_id;

  INSERT INTO public.audit_log(usuario, accion, tabla, registro_id, detalle)
  VALUES (
    'mantenimiento_autorizado_oscar',
    'krediya_soportes_rectificacion_validados',
    'liquidation_adjustments',
    adjustment_id::text,
    jsonb_build_object(
      'liquidation_id', adjustment_row.liquidation_id,
      'estado_anterior', adjustment_row.new_value->>'estado',
      'estado_nuevo', 'soportes_validados',
      'importe_historico_conservado', adjustment_row.new_value->'exceso_pagado_por_validar',
      'motivo', 'Gerencia confirma que la validacion ya no esta pendiente; se retira el aviso operativo sin borrar la auditoria.'
    )
  );
END
$close_notice$;

COMMIT;
