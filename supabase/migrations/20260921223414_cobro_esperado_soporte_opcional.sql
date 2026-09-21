-- El esperado no acredita un ingreso bancario; soporte opcional sin alterar abonos.
ALTER TABLE public.cobros_expected DROP CONSTRAINT cobros_expected_soporte_check;
ALTER TABLE public.cobros_expected ADD CONSTRAINT cobros_expected_soporte_check CHECK(length(btrim(soporte)) BETWEEN 0 AND 2000);
