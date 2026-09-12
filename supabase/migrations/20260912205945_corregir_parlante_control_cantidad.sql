-- Registro privado de correcciones autorizadas de clasificación de inventario.
-- La conversión de datos se ejecuta separadamente, con guardas del estado actual.
CREATE TABLE IF NOT EXISTS kora_private.correcciones_tipo_inventario (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  producto_id uuid NOT NULL REFERENCES public.productos(id),
  remision_id uuid REFERENCES public.remisiones(id),
  motivo text NOT NULL,
  anterior jsonb NOT NULL,
  posterior jsonb NOT NULL,
  ejecutado_por text NOT NULL DEFAULT current_user,
  creado_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE kora_private.correcciones_tipo_inventario ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON kora_private.correcciones_tipo_inventario FROM PUBLIC, anon, authenticated;
