import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{createHash}from'node:crypto';
import{paymentObjects}from'../../scripts/supabase-compat/kora-payments-batch-evidence.mjs';
const read=p=>JSON.parse(readFileSync(p,'utf8'));const dir='tests/fixtures/supabase-compat/kora-pagos-reales-native17/';
test('pagos reales: isolated native upgrade and rebuild proof, exact source and finite privileges',()=>{
 const result=read(dir+'native-result.json');assert.equal(result.complete,true);assert.equal(result.checks.length,104);assert.ok(result.checks.every(c=>c.passed));assert.equal(result.production_operations,0);assert.equal(result.external_sends,0);
 assert.equal(result.migration_sha256.payments,createHash('sha256').update(readFileSync('supabase/migrations/20261027203123_pagos_realizados_fecha_conciliacion.sql')).digest('hex'));
 for(const scenario of['upgrade','rebuild']){const d=read(dir+scenario+'-after.json');assert.equal(paymentObjects(d).length,4);for(const name of['payment saved despite book deficit','duplicate same receipt idempotent','payments store cannot register','payments anon cannot execute','real date preserved','payments future date rejected','payments missing receipt rejected'])assert.ok(result.checks.some(c=>c.name===scenario+': '+name&&c.passed));
 const bad=structuredClone(d);bad.functions.find(f=>f.name==='finanzas_registrar_pago_real').grants.push({grantor:'postgres',grantee:'anon',privilege:'EXECUTE',grantable:false});assert.throws(()=>paymentObjects(bad),/privilege drift/);}
});
