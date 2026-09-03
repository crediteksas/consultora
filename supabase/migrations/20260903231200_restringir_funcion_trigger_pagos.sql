-- Las funciones de trigger no son endpoints: únicamente PostgreSQL debe
-- ejecutarlas al cambiar una orden de pago.
revoke all on function public.aliados_exigir_liquidacion_aprobada_para_pago()
from public, anon, authenticated;
