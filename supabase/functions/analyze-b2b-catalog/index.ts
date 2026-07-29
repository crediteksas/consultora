import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const headers = {
  'access-control-allow-origin': Deno.env.get('B2B_ALLOWED_ORIGIN') ?? '',
  'access-control-allow-headers': 'authorization, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
  'content-type': 'application/json; charset=utf-8',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers });
const env = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};
const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
};
const normalized = (value: unknown) => String(value ?? '')
  .normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().replace(/\s+/g, ' ').toUpperCase();
const conditionOf = (value: unknown) => {
  const key = normalized(value);
  if (['USADO', 'USED'].includes(key)) return 'used';
  if (['REACONDICIONADO', 'REFURBISHED', 'CPO'].includes(key)) return 'refurbished';
  if (['A', 'A+', 'A++'].includes(key)) return key.toLowerCase();
  return 'new';
};
const availabilityOf = (value: unknown) => {
  const key = normalized(value);
  if (key.includes('PEDIDO')) return 'on_order';
  if (key.includes('AGOTADO') || key.includes('NO DISPONIBLE')) return 'unavailable';
  return 'available';
};

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return json(405, { error: 'Método no permitido' });
  try {
    const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return json(401, { error: 'Sesión requerida' });
    const supabaseUrl = env('SUPABASE_URL');
    const anonKey = env('SUPABASE_ANON_KEY');
    const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) return json(401, { error: 'Sesión inválida' });
    const { data: isAdmin } = await authClient.rpc('b2b_is_catalog_admin');
    if (isAdmin !== true) return json(403, { error: 'Acceso restringido a administración' });

    const payload = await request.json();
    const providerId = String(payload.provider_id ?? '').trim();
    const rawText = String(payload.raw_text ?? '');
    if (!providerId || !rawText.trim()) return json(400, { error: 'Proveedor y lista son obligatorios' });
    if (rawText.length > 200000) return json(413, { error: 'La lista supera el tamaño permitido' });

    const server = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const contentHash = await sha256(rawText);
    const { data: existing } = await server
      .from('b2b_catalog_imports')
      .select('id')
      .eq('provider_id', providerId)
      .eq('content_hash', contentHash)
      .maybeSingle();
    if (existing) return json(409, { error: 'Esta lista ya fue analizada' });

    const prompt = `Convierte exclusivamente la lista comercial siguiente a JSON.
No decidas equivalencias, publicación, proveedor ganador, margen ni utilidad.
Devuelve {"items":[{"source_reference":"","brand":"","ram_gb":null,"storage_gb":null,"sim":"","connectivity":"","condition":"","availability":"","cost":0}]}.
Conserva cada referencia como aparece. Omite publicidad, teléfonos, direcciones y frases comerciales del arreglo estructurado.
LISTA:
${rawText}`;
    const geminiKey = env('GEMINI_API_KEY');
    const model = Deno.env.get('B2B_GEMINI_MODEL') || 'gemini-2.5-flash';
    const aiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiKey)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0 },
        }),
      },
    );
    if (!aiResponse.ok) throw new Error('El intérprete de listas no respondió');
    const aiBody = await aiResponse.json();
    const text = aiBody?.candidates?.[0]?.content?.parts?.[0]?.text;
    const interpreted = JSON.parse(text || '{"items":[]}');
    const candidates = Array.isArray(interpreted.items) ? interpreted.items : [];

    const { data: importRow, error: importError } = await server
      .from('b2b_catalog_imports')
      .insert({
        provider_id: providerId,
        raw_text: rawText,
        content_hash: contentHash,
        interpreter_version: `${model}:v1`,
        imported_by: authData.user.id,
      })
      .select('id')
      .single();
    if (importError) throw importError;

    const { data: rules = [] } = await server
      .from('b2b_catalog_normalization_rules')
      .select('source_reference_normalized,product_id')
      .eq('provider_id', providerId)
      .eq('active', true);
    const ruleMap = new Map(rules.map(rule => [rule.source_reference_normalized, rule.product_id]));
    const safeOffers = candidates
      .map(candidate => ({
        import_id: importRow.id,
        provider_id: providerId,
        product_id: ruleMap.get(normalized(candidate.source_reference)) || null,
        source_reference: String(candidate.source_reference ?? '').trim(),
        interpreted_data: candidate,
        cost: Number(candidate.cost),
        condition: conditionOf(candidate.condition),
        availability: availabilityOf(candidate.availability),
      }))
      .filter(offer => offer.source_reference && Number.isFinite(offer.cost) && offer.cost > 0)
      .map(offer => ({
        ...offer,
        exception_type: offer.condition !== 'new'
          ? 'not_publishable'
          : offer.availability === 'on_order'
            ? 'on_order'
            : offer.product_id ? null : 'unmatched',
      }));
    let insertedOffers: Record<string, unknown>[] = [];
    if (safeOffers.length) {
      const { data, error } = await server
        .from('b2b_catalog_offers')
        .insert(safeOffers)
        .select('id,source_reference,exception_type,product_id');
      if (error) throw error;
      insertedOffers = data || [];
    }

    const { data: draft, error: draftError } = await server.rpc('build_b2b_catalog_draft', {
      p_user_id: authData.user.id,
    });
    if (draftError && !draftError.message.includes('Configura la regla de utilidad')) throw draftError;

    return json(200, {
      import_id: importRow.id,
      exceptions: insertedOffers
        .filter(offer => offer.exception_type)
        .map(offer => ({
          offer_id: offer.id,
          source_reference: offer.source_reference,
          exception_type: offer.exception_type,
          suggestion: offer.product_id ? 'Revisar condición' : 'Asignar referencia canónica',
        })),
      preview: draft?.preview || [],
      version_id: draft?.version_id || null,
      configuration_required: draftError?.message || null,
    });
  } catch (error) {
    console.error('analyze-b2b-catalog failed', error instanceof Error ? error.message : 'unknown');
    return json(500, { error: 'No fue posible analizar la lista' });
  }
});
