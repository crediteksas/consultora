-- Catálogo oficial de las 10 tiendas Retail activas de Creditek.
-- Los códigos CK permanecen como identificadores internos y no se muestran como nombre comercial.
with catalogo(codigo, nombre, ciudad) as (
  values
    ('CK-01', 'Celfiao Tolú',       'Tolú'),
    ('CK-02', 'Móvil Shopping',      'Corozal'),
    ('CK-03', 'Celfiao',             'Corozal'),
    ('CK-04', 'Creditel Store',      'Corozal'),
    ('CK-05', 'Chinucell',           'Chinú'),
    ('CK-06', 'Creditel Chinú',      'Chinú'),
    ('CK-07', 'Sonivox',             'Chinú'),
    ('CK-08', 'Orocel',              'Ciénaga de Oro'),
    ('CK-09', 'Kredisinu',           'Ciénaga de Oro'),
    ('CK-11', 'Creditel Coveñas',    'Coveñas')
)
update public.origenes o
set nombre = c.nombre,
    ciudad = c.ciudad,
    aliases = case
      when coalesce(o.aliases, '[]'::jsonb) @> jsonb_build_array(o.nombre) then coalesce(o.aliases, '[]'::jsonb)
      else coalesce(o.aliases, '[]'::jsonb) || jsonb_build_array(o.nombre)
    end
from catalogo c
where o.codigo = c.codigo
  and o.tipo = 'propia';

do $$
declare
  v_correctas integer;
begin
  select count(*) into v_correctas
  from public.origenes
  where tipo = 'propia'
    and activo = true
    and (codigo, nombre, ciudad) in (
      ('CK-01', 'Celfiao Tolú', 'Tolú'),
      ('CK-02', 'Móvil Shopping', 'Corozal'),
      ('CK-03', 'Celfiao', 'Corozal'),
      ('CK-04', 'Creditel Store', 'Corozal'),
      ('CK-05', 'Chinucell', 'Chinú'),
      ('CK-06', 'Creditel Chinú', 'Chinú'),
      ('CK-07', 'Sonivox', 'Chinú'),
      ('CK-08', 'Orocel', 'Ciénaga de Oro'),
      ('CK-09', 'Kredisinu', 'Ciénaga de Oro'),
      ('CK-11', 'Creditel Coveñas', 'Coveñas')
    );
  if v_correctas <> 10 then
    raise exception 'Catálogo Retail incompleto: se validaron % de 10 tiendas', v_correctas;
  end if;
end $$;
