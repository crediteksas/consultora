import test from 'node:test';
import {capture} from '../../scripts/supabase-compat/b2b-pesos-enteros-evidence.mjs';
for (const scenario of ['upgrade','rebuild']) test(`B2B ${scenario} conserva permisos`,async()=>{await capture(scenario)});
