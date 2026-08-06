const MAX_PROMPT_LENGTH = 50_000;
const MAX_SYSTEM_LENGTH = 15_000;
const DEFAULT_MAX_TOKENS = 2_048;
const MAX_OUTPUT_TOKENS = 16_384;

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function safeMaxTokens(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_TOKENS;
  return Math.max(64, Math.min(MAX_OUTPUT_TOKENS, Math.trunc(parsed)));
}

export async function generateAuraText(env, payload = {}, fetcher = globalThis.fetch) {
  const prompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : '';
  const system = typeof payload.system === 'string' ? payload.system.trim() : '';
  if (!prompt) return json({ ok: false, error: 'Escribe el contenido que deseas generar.' }, 400);
  if (prompt.length > MAX_PROMPT_LENGTH || system.length > MAX_SYSTEM_LENGTH) {
    return json({ ok: false, error: 'La solicitud supera el tamaño permitido.' }, 413);
  }

  const apiKey = String(env?.GEMINI_API_KEY || '').trim();
  if (!apiKey) return json({ ok: false, error: 'La generación de texto no está configurada.' }, 503);

  const requestBody = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: safeMaxTokens(payload.maxTokens),
      temperature: Number.isFinite(Number(payload.temperature))
        ? Math.max(0, Math.min(1.5, Number(payload.temperature)))
        : 0.7,
    },
  };
  if (system) requestBody.systemInstruction = { parts: [{ text: system }] };

  let upstream;
  try {
    upstream = await fetcher(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(90_000),
      },
    );
  } catch {
    return json({ ok: false, error: 'El servicio de generación no respondió. Intenta nuevamente.' }, 502);
  }

  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const status = upstream.status === 429 ? 429 : 502;
    const message = upstream.status === 429
      ? 'El servicio alcanzó su límite temporal. Intenta nuevamente en unos minutos.'
      : 'No fue posible generar el contenido en este momento.';
    return json({ ok: false, error: message }, status);
  }

  const text = (data.candidates?.[0]?.content?.parts || [])
    .map(part => typeof part?.text === 'string' ? part.text : '')
    .filter(Boolean)
    .join('\n')
    .trim();
  if (!text) return json({ ok: false, error: 'El servicio no devolvió contenido utilizable.' }, 502);
  return json({ ok: true, text });
}
