import test from 'node:test';
import { capture } from '../../scripts/supabase-compat/retenciones-proveedor-evidence.mjs';

for (const scenario of ['upgrade', 'rebuild']) {
  test('retenciones de proveedor conservan permisos aislados en ' + scenario, () => capture(scenario));
}
