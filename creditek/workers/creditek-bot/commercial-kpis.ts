export type HandoffStatus = 'reserved' | 'sent' | 'error';

export interface HandoffEvidenceInput {
  idempotencyKey: string;
  destinationId: string;
  destinationType: 'tienda' | 'aliado';
  origin: string;
  reassignmentOf?: string | null;
}

export interface HandoffEvidence {
  id: string;
  status: HandoffStatus;
  meta_response_id?: string | null;
  sent_confirmed_at?: string | null;
}

type Fetcher = typeof fetch;

function headers(key: string, json = false): HeadersInit {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  };
}

function codigoErrorSeguro(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 120) || 'handoff_error';
}

export async function reservarHandoff(
  supabaseUrl: string,
  serviceKey: string,
  input: HandoffEvidenceInput,
  fetcher: Fetcher = fetch,
): Promise<{ permitido: boolean; evidencia: HandoffEvidence }> {
  const response = await fetcher(`${supabaseUrl}/rest/v1/aura_sofia_outbox`, {
    method: 'POST',
    headers: { ...headers(serviceKey, true), Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({
      event_kind: 'advisor_handoff',
      idempotency_key: input.idempotencyKey,
      destination_id: input.destinationId,
      destination_type: input.destinationType,
      origin: input.origin,
      reassignment_of: input.reassignmentOf || null,
      status: 'reserved',
      attempts: 1,
      evidence_version: 1,
    }),
  });
  const responseBody = await response.text();
  if (!response.ok) {
    let diagnostic = 'unknown';
    try {
      const parsed = JSON.parse(responseBody) as { code?: string; message?: string; details?: string; hint?: string };
      diagnostic = [parsed.code, parsed.message, parsed.details, parsed.hint].filter(Boolean).join(' | ').slice(0, 500);
    } catch {
      diagnostic = responseBody.slice(0, 500);
    }
    console.error(`[OUTBOX-RESERVE] ${response.status} ${diagnostic}`);
    throw new Error(`Supabase outbox respondió ${response.status}`);
  }
  const rows = JSON.parse(responseBody) as HandoffEvidence[];
  if (rows[0]) return { permitido: true, evidencia: rows[0] };

  const existing = await fetcher(
    `${supabaseUrl}/rest/v1/aura_sofia_outbox?idempotency_key=eq.${encodeURIComponent(input.idempotencyKey)}&select=id,status,meta_response_id,sent_confirmed_at&limit=1`,
    { headers: headers(serviceKey) },
  );
  if (!existing.ok) throw new Error(`Supabase outbox existente respondió ${existing.status}`);
  const [evidencia] = await existing.json() as HandoffEvidence[];
  if (!evidencia) throw new Error('No se pudo recuperar la evidencia idempotente');
  // Una llave ya existente nunca vuelve a abrir el envío. Solo se permite
  // completar la persistencia cuando Meta ya devolvió un ID que quedó
  // pendiente de marcar como sent.
  return { permitido: evidencia.status === 'reserved' && !!evidencia.meta_response_id, evidencia };
}

export async function buscarHandoffInicial(
  supabaseUrl: string,
  serviceKey: string,
  clienteId: string,
  fetcher: Fetcher = fetch,
): Promise<HandoffEvidence | null> {
  const response = await fetcher(
    `${supabaseUrl}/rest/v1/aura_sofia_outbox?idempotency_key=eq.${encodeURIComponent(`advisor_handoff:${clienteId}`)}&select=id,status,meta_response_id,sent_confirmed_at&limit=1`,
    { headers: headers(serviceKey) },
  );
  if (!response.ok) throw new Error(`Supabase outbox inicial respondió ${response.status}`);
  const [evidencia] = await response.json() as HandoffEvidence[];
  return evidencia || null;
}

export async function confirmarHandoff(
  supabaseUrl: string,
  serviceKey: string,
  evidenciaId: string,
  metaResponseId: string,
  fetcher: Fetcher = fetch,
): Promise<void> {
  if (!metaResponseId) throw new Error('Meta no devolvió messages[0].id');
  const baseUrl = `${supabaseUrl}/rest/v1/aura_sofia_outbox?id=eq.${encodeURIComponent(evidenciaId)}`;
  const persistResponse = await fetcher(baseUrl, {
    method: 'PATCH',
    headers: { ...headers(serviceKey, true), Prefer: 'return=minimal' },
    body: JSON.stringify({ meta_response_id: metaResponseId, updated_at: new Date().toISOString() }),
  });
  if (!persistResponse.ok) throw new Error(`No se pudo persistir el ID de Meta (${persistResponse.status})`);
  const response = await fetcher(baseUrl, {
    method: 'PATCH',
    headers: { ...headers(serviceKey, true), Prefer: 'return=minimal' },
    body: JSON.stringify({
      status: 'sent',
      meta_response_id: metaResponseId,
      sent_confirmed_at: new Date().toISOString(),
      error_code: null,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!response.ok) throw new Error(`No se pudo persistir la confirmación Meta (${response.status})`);
}

export async function marcarHandoffError(
  supabaseUrl: string,
  serviceKey: string,
  evidenciaId: string,
  errorCode: string,
  fetcher: Fetcher = fetch,
  metaResponseId?: string,
): Promise<void> {
  // Si el ID de Meta ya fue persistido, conservar la reserva para que un
  // reintento complete únicamente el PATCH final a status=sent.
  const body = metaResponseId
    ? { error_code: codigoErrorSeguro(errorCode), updated_at: new Date().toISOString() }
    : { status: 'error', error_code: codigoErrorSeguro(errorCode), attempts: 2, updated_at: new Date().toISOString() };
  const response = await fetcher(`${supabaseUrl}/rest/v1/aura_sofia_outbox?id=eq.${encodeURIComponent(evidenciaId)}`, {
    method: 'PATCH',
    headers: { ...headers(serviceKey, true), Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  });
  if (!response.ok) console.error('[KPIS-OUTBOX] no se pudo registrar error:', response.status);
}

export function esLeadCertificado(row: {
  event_kind?: string;
  status?: string;
  meta_response_id?: string | null;
  evidence_version?: number;
  reassignment_of?: string | null;
}): boolean {
  return row.event_kind === 'advisor_handoff'
    && row.status === 'sent'
    && !!row.meta_response_id
    && row.evidence_version === 1
    && !row.reassignment_of;
}
