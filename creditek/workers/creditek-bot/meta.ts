// ─── WhatsApp ─────────────────────────────────────────────────────────────────
export async function enviarMensajeWA(
  telefono: string,
  mensaje: string,
  phoneNumberId: string,
  accessToken: string
): Promise<void> {
  const res = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: telefono.replace('+', ''),
      type: 'text',
      text: { body: mensaje, preview_url: false },
    }),
  });
  if (!res.ok) {
    const detalle = await res.text();
    console.error('[WA] Error:', detalle);
    throw new Error(`WhatsApp respondió ${res.status}: ${detalle}`);
  }
}

// FIX v21, 13-jul-2026: mensaje interactivo con botones de respuesta rápida
// (Quick Reply Buttons) — usado en OPTIN y en la pregunta de modalidad para
// agilizar la respuesta del cliente sin depender de que escriba texto libre.
// Meta permite máximo 3 botones, título máximo 20 caracteres.
export async function enviarBotonesWA(
  telefono: string,
  texto: string,
  botones: { id: string; title: string }[],
  phoneNumberId: string,
  accessToken: string
): Promise<void> {
  const res = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: telefono.replace('+', ''),
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: texto },
        action: {
          buttons: botones.map(b => ({ type: 'reply', reply: { id: b.id, title: b.title } })),
        },
      },
    }),
  });
  if (!res.ok) {
    const detalle = await res.text();
    console.error('[WA-BOTONES] Error:', detalle);
    throw new Error(`WhatsApp botones respondió ${res.status}: ${detalle}`);
  }
}

// ─── Facebook Messenger ───────────────────────────────────────────────────────
export async function enviarMensajeFB(
  recipientId: string,
  mensaje: string,
  pageId: string,
  accessToken: string
): Promise<void> {
  const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message:   { text: mensaje },
      messaging_type: 'RESPONSE',
    }),
  });
  if (!res.ok) {
    const detalle = await res.text();
    console.error('[FB] Error:', detalle);
    throw new Error(`Facebook Messenger respondió ${res.status}: ${detalle}`);
  }
}
