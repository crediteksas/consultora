CREATE OR REPLACE FUNCTION public.reservar_otp_registro_seguro(p_cedula text, p_celular text, p_enlace_registro_id uuid, p_codigo_hash text, p_expira_at timestamp with time zone)
 RETURNS TABLE(otp_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_envios_celular integer;
  v_envios_enlace integer;
  v_otp_id uuid;
begin
  if p_cedula !~ '^[0-9]{6,12}$'
    or p_celular !~ '^3[0-9]{9}$'
    or p_codigo_hash !~ '^[A-Za-z0-9_-]{43}$'
    or p_expira_at <= now() then
    raise exception 'otp_reserva_invalida';
  end if;

  -- Todos los callers toman los locks en el mismo orden. Las reservas
  -- concurrentes para un mismo celular o enlace quedan serializadas dentro
  -- de la transacción que cuenta e inserta el OTP.
  perform pg_advisory_xact_lock(
    hashtextextended('otp:celular:' || p_celular, 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended('otp:enlace:' || p_enlace_registro_id::text, 0)
  );

  select count(*) into v_envios_celular
  from public.otp_codigos
  where celular = p_celular
    and enlace_registro_id is not null
    and envio_fallido_at is null
    and (
      (
        envio_aceptado_at is not null
        and created_at >= now() - interval '1 hour'
      )
      or (
        envio_aceptado_at is null
        and created_at >= now() - interval '10 minutes'
      )
    );
  if v_envios_celular >= 3 then
    raise exception 'otp_limite_celular';
  end if;

  select count(*) into v_envios_enlace
  from public.otp_codigos
  where enlace_registro_id = p_enlace_registro_id
    and envio_fallido_at is null
    and (
      (
        envio_aceptado_at is not null
        and created_at >= now() - interval '1 hour'
      )
      or (
        envio_aceptado_at is null
        and created_at >= now() - interval '10 minutes'
      )
    );
  if v_envios_enlace >= 60 then
    raise exception 'otp_limite_enlace';
  end if;

  insert into public.otp_codigos (
    cedula, celular, enlace_registro_id, codigo_hash,
    expira_at, intentos, verificado
  ) values (
    p_cedula, p_celular, p_enlace_registro_id, p_codigo_hash,
    p_expira_at, 0, false
  )
  returning id into v_otp_id;

  return query select v_otp_id;
end;
$function$
