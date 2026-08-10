import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const hub = await readFile(new URL('creditek/agentes/index.html', root), 'utf8');
const sofia = await readFile(new URL('creditek/agentes/creditek-agente-respuestas.html', root), 'utf8');
const meta = await readFile(new URL('creditek/agentes/agente3-meta-ads.html', root), 'utf8');

test('Sofía consume exclusivamente la sesión AURA vigente sin expulsar el Hub', () => {
  assert.match(sofia, /aura_supabase_session_v1/);
  assert.doesNotMatch(sofia, /ck_auth|ck_supa_session|top\.location\.href/);
  assert.match(sofia, /Authorization:'Bearer '\+s\.access_token/);
});

test('Sofía no publica secretos administrativos ni reactiva escritura insegura', () => {
  assert.doesNotMatch(sofia, /WORKER_SHARED_SECRET|X-Worker-Secret/);
  assert.doesNotMatch(sofia, /Integración pausada: pendiente autenticación AURA en backend/);
  assert.match(sofia, /supaFetch\('\/tiendas\?select=id,ciudad,nombre,nombre_comercial/);
  assert.match(sofia, /countRows\('\/clientes\?select=id&estado_funnel=eq\.lead_caliente'\)/);
  assert.match(sofia, /countRows\('\/clientes\?select=id&estado_funnel=eq\.transferido_asesor'\)/);
  assert.match(sofia, /Prefer:'count=exact'/);
  assert.match(sofia, /Envío pausado: pendiente autenticación AURA en backend/);
});

test('Meta Ads usa app_id y permiso propios sin heredar acceso de Sofía', () => {
  assert.match(hub, /data-aura-app="meta_ads"/);
  assert.match(hub, /hasPermission\(auraAccess, appId, 'meta_ads\.read'\)/);
  assert.match(hub, /appId === 'meta_ads'/);
});

test('Meta Ads muestra el publicador seguro y no captura credenciales en el navegador', () => {
  assert.match(meta, /Métricas y publicador seguro/);
  assert.match(meta, /PUBLICAR CAMPAÑA/);
  assert.doesNotMatch(meta, /graph\.facebook\.com|ck_meta_token|inp-token/);
  assert.doesNotMatch(hub, /ck_meta_token|cfg-meta-account|saveMetaKeys/);
});
