/**
 * Sofia Bot - Creditek v7.0
 * Rediseño completo: flujo natural, datos mínimos, tono vendedora costeña
 */

import { generarRespuesta } from './claude';
import { enviarMensajeWA, enviarMensajeFB, enviarBotonesWA } from './meta';
import {
  ESTADOS_PENDIENTES,
  esConsultaDuranteCaptura,
  esIntencionMoto,
  esNombreDescartable,
  mensajeConsultaAsesor,
  respuestaConsultaFrecuenteDuranteCaptura,
} from './lead-policy';
import {
  detectaCierreComercial,
  detectaSolicitudDinero,
  extraerDatosMinimos,
  pareceReferenciaProducto,
  resolverReengancheFin,
} from './logic';
import {
  debeIniciarConversacion,
  detectarDepartamento,
  esMensajeCortoContextual,
  preguntaPendiente,
  resolverPreguntaDeContinuidad,
} from './conversation-continuity';
import {
  actualizarAuditoriaEvento,
  type AuditoriaEventoMeta,
  finalizarRecuperacionManual,
  reservarEventoEnDurable,
  reservarEventoMeta,
  reservarRecuperacionManual,
  finalizarEventoEnDurable,
} from './message-idempotency';
import { buscarHandoffInicial, confirmarHandoff, marcarHandoffError, reservarHandoff } from './commercial-kpis';

const SUPABASE_URL = 'https://ditiwpndvmyuqcagupea.supabase.co';

interface Env {
  CONVERSATIONS: KVNamespace;
  CONVERSACION_DO: DurableObjectNamespace; // FIX 6, 03-jul-2026
  WHATSAPP_TOKEN: string;
  PHONE_NUMBER_ID: string;
  VERIFY_TOKEN: string;
  SUPABASE_SERVICE_KEY: string;
  ANTHROPIC_API_KEY: string;
  META_ACCESS_TOKEN: string;
  META_PAGE_ACCESS_TOKEN: string;
  // SPEC v5-CRM, 13-jul-2026: secreto compartido para /api/enviar-mensaje —
  // mismo patrón que ya usa gemini-proxy (X-Worker-Secret), valor propio de
  // este Worker (no el mismo que gemini-proxy). Configurar con:
  // wrangler secret put WORKER_SHARED_SECRET
  WORKER_SHARED_SECRET: string;
}

type Estado =
  | 'OPTIN'
  | 'OPTIN_MARKETING'
  | 'CELULAR_FB'
  | 'ESCUCHAR'
  | 'MODALIDAD_CIUDAD' // se mantiene por compatibilidad con conversaciones ya en curso al desplegar — ninguna conversación nueva cae aquí desde el Fix 7
  | 'MODALIDAD'         // FIX 7, 03-jul-2026: reemplaza a MODALIDAD_CIUDAD para conversaciones nuevas
  | 'CIUDAD_MODAL'
  | 'DATOS_MIN'
  | 'CIUDAD'
  | 'HANDOFF'
  | 'HANDOFF_PENDING'
  | 'FIN';

interface Conv {
  estado: Estado;
  canal: string;
  nombre?: string;
  cedula?: string;
  celular?: string;
  correo?: string;
  ciudad?: string;
  tienda_id?: string;
  tienda_nombre?: string;
  tienda_nombre_comercial?: string;
  tienda_genero?: string;
  tienda_contacto?: string;
  tienda_telefono?: string;
  tienda_tipo?: string;
  tiendas_intentadas?: string[]; // para rotar asesores
  fuente?: string;
  anuncio_id?: string;
  anuncio_titulo?: string;
  ctwa_clid?: string;
  producto_interes?: string;
  modelo_pendiente?: string;
  // FIX v26, 20-jul-2026 — Hallazgo 1: antes solo se guardaba en Supabase
  // (clientes.ciudad_original), nunca en la propia conversación en memoria —
  // el estado MODALIDAD no tenía forma confiable de saber "ya me dijiste una
  // ciudad (aunque sin cobertura)" y dependía de buscar texto exacto en el
  // historial, que fallaba en silencio. Ahora vive también aquí.
  ciudad_original?: string;
  departamento?: string;
  municipio?: string;
  modalidad?: string; // credito | contado
  intentos_modalidad?: number; // Fix v1 09-jul-2026: límite de reintentos en estado MODALIDAD
  intentos_optin?: number; // FIX v24, 14-jul-2026: límite de reintentos en estado OPTIN (Hallazgo 4) — campo propio, no reutiliza intentos_modalidad para no arrastrar conteo entre estados distintos
  historial: string[];
  ultimo_mensaje: number;
  optin_aceptado?: boolean;
  datos_completos?: boolean;
  lead_creado?: boolean;
  ultimo_paso?: Estado;
  ultima_pregunta?: string;
  ultima_respuesta_cliente?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function norm(s: string): string {
  return s.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// FIX 04-jul-2026: tolerancia a errores de tecleo en nombres de ciudad.
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

const CIUDADES = ['tolu','tolú','corozal','chinu','chinú','cienaga de oro','ciénaga de oro','covenas','coveñas'];

const CIUDADES_CANONICAS = ['Tolu', 'Corozal', 'Chinu', 'Cienaga de Oro', 'Covenas'];

function ciudadMasParecida(cnRaw: string): string | null {
  const cn = norm(cnRaw);

  const intentar = (candidato: string): { ciudad: string; dist: number } | null => {
    let mejor: string | null = null, mejorDist = Infinity;
    for (const c of CIUDADES_CANONICAS) {
      const d = levenshtein(candidato, norm(c));
      if (d < mejorDist) { mejorDist = d; mejor = c; }
    }
    const tolerancia = mejor && norm(mejor).length <= 6 ? 1 : 2;
    return (mejor && mejorDist <= tolerancia) ? { ciudad: mejor, dist: mejorDist } : null;
  };

  // Intento directo: el texto completo, como ya funcionaba.
  const directo = intentar(cn);
  if (directo) return directo.ciudad;

  // FIX v26, 20-jul-2026 — Hallazgo 5 (evidencia real: "Corosal sucre" no
  // matcheó "Corozal"). El intento directo compara el STRING COMPLETO contra
  // cada ciudad candidata — cualquier palabra extra (un departamento, "porfa",
  // etc.) dispara la distancia de Levenshtein muy por encima de la tolerancia,
  // aunque la ciudad en sí esté a 1 sola letra. Se prueba también palabra por
  // palabra y en grupos de hasta 3 palabras consecutivas (cubre nombres de
  // ciudad de varias palabras como "Cienaga de Oro"), quedándose con el mejor
  // resultado de todos los intentos.
  const palabras = cn.split(/\s+/).filter(Boolean);
  let mejorTokenizado: { ciudad: string; dist: number } | null = null;
  for (let tam = 1; tam <= 3; tam++) {
    for (let i = 0; i + tam <= palabras.length; i++) {
      const candidato = palabras.slice(i, i + tam).join(' ');
      const r = intentar(candidato);
      if (r && (!mejorTokenizado || r.dist < mejorTokenizado.dist)) mejorTokenizado = r;
    }
  }
  return mejorTokenizado ? mejorTokenizado.ciudad : null;
}

async function buscarCiudadAlias(cn: string, key: string): Promise<string | null> {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/ciudad_alias?alias=eq.${encodeURIComponent(cn)}&select=ciudad_normalizada&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) return null;
    const d = await r.json() as any[];
    return d[0]?.ciudad_normalizada ?? null;
  } catch { return null; }
}

function detectaCiudad(texto: string): string | null {
  const t = norm(texto);
  return CIUDADES.find(c => t.includes(norm(c))) ?? null;
}

// FIX v1, 04-jul-2026: si el texto parece una pregunta (tiene "?"/"¿" o
// empieza con palabra interrogativa), no debe tratarse como intento de
// nombrar una ciudad — evita el falso "no tenemos cobertura" ante una
// pregunta normal del cliente.
function pareceCiudad(texto: string): boolean {
  const t = texto.trim();
  if (t.includes('?') || t.includes('¿')) return false;
  if (/^(que|qué|cual|cuál|como|cómo|donde|dónde|cuando|cuándo|cuanto|cuánto|quien|quién)\b/i.test(norm(t))) return false;
  return true;
}

// FIX v27, 22-jul-2026 — Bug 8 del paquete FIX_Sofia_v27: detecta si el
// mensaje del cliente lleva "intención real" (producto, pregunta, acción).
// Se usa en el estado FIN para permitir reenganche sin esperar 30 min
// cuando el cliente pregunta de verdad, sin dispararse por "gracias"/"ok".
function tieneIntencionReal(texto: string): boolean {
  const t = norm(texto).trim();
  if (!t) return false;
  // Cierres/cortesía cortos → NO reenganchar
  if (/^(gracias|ok|okay|listo|chao|adios|hasta luego|hasta pronto|de nada|vale|bien|dale|mmm|ah|ahh|jaja)[\s.!]*$/i.test(t)) return false;
  // Pregunta explícita → reenganchar
  if (texto.includes('?') || texto.includes('¿')) return true;
  // Palabras de producto/acción/interés → reenganchar
  if (/\b(celular|samsung|xiaomi|motorola|moto|iphone|apple|huawei|honor|computador|portatil|laptop|tablet|parlante|cable|audifonos|smart\s*tv|equipo|producto|credito|contado|precio|cuota|financiaci|cuanto|cuando|como|donde|quiero|necesito|busco|pued|tienen|\bhay\b|informacion|info|comprar|llev)/i.test(t)) return true;
  // Números — probablemente cédula/celular que quiere retomar
  if (/\d{6,}/.test(texto)) return true;
  return false;
}

function detectaCredito(texto: string): boolean {
  // Fix v1 07-jul-2026: antes exigía "credito"/"crédito" exacto — el typo común
  // "credicto" (una letra de más) nunca hacía match y dejaba al cliente en loop
  // infinito repitiendo la pregunta. \w{0,3}to tolera 0-3 caracteres entre la
  // "d" y el "to" final, cubriendo "credito", "crédito" y "credicto" con el
  // mismo patrón, sin abrir falsos positivos con palabras no relacionadas.
  // Fix v1 09-jul-2026: agrega raíz "acredit-" (acreditación, acreditado,
  // acreditar) — no hacía match con el patrón anterior porque tiene más de
  // 3 caracteres entre "cred" y el final, y no termina en "to".
  return /cr[eé]d\w{0,3}to|acredit|financiad|cuota|plazo|mensual|abono/i.test(texto);
}

function detectaContado(texto: string): boolean {
  return /\bcontado\b|efectivo|de una|pago\s*(completo|total)/i.test(texto);
}

// FIX v25, 16-jul-2026 — Hallazgo 1 (REGRESIÓN de v24, confirmada con
// evidencia real de producción: "Telefono", "acepto", "crédito",
// "Computador", "De mesa" disparaban la búsqueda difusa de ciudad agregada en
// ESCUCHAR y terminaban en "no tenemos tienda en esa ciudad" + guardaban
// basura en ciudad_original, teléfono 573024590980 confirmado por SQL).
// pareceCiudad() solo descartaba preguntas — no bastaba para excluir palabras
// del flujo ni fragmentos de producto. Lista mínima de exclusión pedida en el
// documento, mas las marcas/categorías de producto ya usadas en otras partes
// de este archivo (extraerNombre, systemPrompt).
const PALABRAS_RESERVADAS_ESCUCHAR = [
  'acepto','credito','crédito','contado','si','sí','no','ok','dale','listo',
  'telefono','teléfono','celular','computador','portatil','portátil','tablet',
  'samsung','xiaomi','oppo','honor','infinix','motorola','tcl',
  'parlante','bocina','audifono','audífono','belleza','perfume','maquillaje',
  'moto','motocicleta',
];
function esPalabraReservadaEscuchar(texto: string): boolean {
  const t = norm(texto);
  return PALABRAS_RESERVADAS_ESCUCHAR.some(p => new RegExp(`\\b${norm(p)}\\b`).test(t));
}

// FIX v25, 16-jul-2026 — Hallazgo 5: detectaRechazaCiudadesSugeridas() (v24,
// Hallazgo 6) quedó sin uso — el fallback "cualquiera" que la necesitaba se
// eliminó (ver case CIUDAD_MODAL/CIUDAD): ahora CUALQUIER segundo intento
// fallido cierra honesto, sea o no un rechazo explícito, así que la
// distinción ya no hace falta. Se quita para no dejar código muerto.

function detectaAcepta(texto: string): boolean {
  if (detectaRechaza(texto)) return false;
  return /\bsi\b|\bsí\b|dale|\bok\b|claro|listo|acepto|autoriz|permiso|de\s*acuerdo|adelante|\bpuede\b|esta\s*bien|está\s*bien|\bva\b|perfecto|bueno/i.test(texto);
}

function detectaRechaza(texto: string): boolean {
  return /^no$|^no[,. ]|no\s+quiero|no\s+acepto|no\s+autoriz|no\s+permiso|no\s+puede/i.test(texto);
}

// Confirma que el WhatsApp desde el que escribe es su celular de contacto
// Fix v3 09-jul-2026: se amplía el vocabulario de afirmación — "aja",
// "correcto", "exacto" y "ese mismo" no hacían match antes (solo cubría
// "el mismo", no "ese mismo"), dejando al cliente respondiendo algo que
// Sofía no reconocía como confirmación válida.
function detectaConfirmacionCelular(texto: string): boolean {
  const t = norm(texto); // minusculas sin tildes
  return /\bsi\b|\baja\b|correcto|exacto/.test(t) || /es este|el mismo|ese mismo|este numero|\bactivo\b/.test(t);
}

// FIX 5, 03-jul-2026: determina la fuente real usando el objeto "referral" que
// Meta manda cuando el cliente llega por un anuncio "Clic a WhatsApp" (Facebook
// o Instagram). Sin esto, todo caía en whatsapp_organico sin distinción.
function determinarFuente(referral: any, refQr: string | null, canal: string): string {
  if (refQr) return 'qr_' + refQr;
  if (referral?.source_type) {
    const url = String(referral.source_url || '').toLowerCase();
    if (url.includes('instagram')) return 'instagram_ads';
    return 'facebook_ads';
  }
  if (canal === 'facebook_dm') return 'facebook_dm';
  return 'whatsapp_organico';
}

// Fix v1 09-jul-2026: evidencia real (Supabase, tabla clientes, últimos 3 días)
// mostró 100% de los clientes nuevos con canal_origen='whatsapp', aunque el 75%
// tenía meta_source_url poblado y el 69% meta_ctwa_clid — es decir, la mayoría
// venían de clic en anuncio de Facebook/Instagram (Click-to-WhatsApp), no de
// WhatsApp orgánico. La causa: canal_origen se llenaba con el canal técnico de
// entrega (`canal`, siempre "whatsapp" porque la API que recibe el mensaje es
// WhatsApp Business API), no con `conv.fuente` — que YA calculaba la
// atribución real vía determinarFuente()/el referral de Meta, pero nunca se
// usaba para este campo. Aquí solo se reutiliza ese dato ya correcto.
// FIX v20, 13-jul-2026: la lista blanca solo cubría facebook_ads/instagram_ads
// (clic a WhatsApp desde anuncio) pero determinarFuente() también devuelve
// 'facebook_dm' para un cliente que escribe primero por Messenger (sin ser
// anuncio) y pasa a WhatsApp por el estado CELULAR_FB — ese caso caía al
// default 'whatsapp', perdiendo el origen Facebook real (evidencia: Jennifer
// Acevedo, 573006034500).
function canalOrigenReal(fuente: string | undefined): string {
  if (fuente === 'facebook_ads' || fuente === 'instagram_ads' || fuente === 'facebook_dm') return fuente;
  return 'whatsapp';
}

// FIX v1, 04-jul-2026: Meta manda el ID del anuncio especifico, su titulo y
// el ctwa_clid dentro del mismo objeto referral que ya usamos para saber la
// fuente (facebook_ads/instagram_ads) - antes se ignoraban estos 3 campos.
function extraerDatosAnuncio(referral: any): { anuncio_id?: string; anuncio_titulo?: string; ctwa_clid?: string } {
  if (!referral) return {};
  return {
    anuncio_id: referral.source_id || undefined,
    anuncio_titulo: referral.headline || undefined,
    ctwa_clid: referral.ctwa_clid || undefined,
  };
}

function extraerNombre(texto: string): string | null {
  if (esNombreDescartable(texto)) return null;
  // Solo extraer nombre si viene con indicador claro
  // FIX 04-jul-2026: {1,3} -> {0,3} — antes exigía al menos una palabra
  // adicional separada por espacio. Un cliente escribiendo su nombre
  // COMPLETO pegado ("Julioalbertobeleñobarreto", sin espacios, muy común
  // escribiendo rápido desde el celular) nunca hacía match — devolvía null
  // siempre, sin importar cuántas veces lo repitiera (loop infinito real,
  // confirmado con un cliente real que abandonó frustrado el 03-jul).
  const m = texto.match(/(?:soy\s+|me\s+llamo\s+|nombre[:\s]+|mi\s+nombre\s+(?:completo\s+)?es\s+)([A-Za-záéíóúÁÉÍÓÚñÑ\s]{3,40})/i)
    || texto.match(/^([A-Za-záéíóúÁÉÍÓÚñÑ]{3,}(?:\s+[A-Za-záéíóúÁÉÍÓÚñÑ]{2,}){0,3})$/m);
  if (!m) return null;
  const c = m[1].trim();
  // Rechazar si contiene palabras de acción o es muy corto
  const palabrasAccion = ['quiero','necesito','busco','tengo','dame','para','como','esto','crédito','credito','contado','samsung','xiaomi','celular','equipo'];
  if (c.length < 5) return null;
  if (CIUDADES.some(x => norm(c).includes(norm(x)))) return null;
  if (palabrasAccion.some(p => norm(c).includes(p))) return null;
  return c;
}

function extraerCelular(texto: string): string | null {
  // FIX 04-jul-2026: tolerar espacios, puntos y guiones dentro del número.
  // FIX v2, 04-jul-2026: la limpieza anterior aplanaba TODO el mensaje antes
  // de buscar — si el cliente mandaba cédula y celular en el mismo mensaje
  // ("CC 92537706 Y MI CELULAR 3174734413"), los dígitos de ambos números
  // quedaban pegados y el regex podía devolver un número inventado que
  // mezclaba las dos secuencias. Ahora se busca directo sobre el texto
  // original, permitiendo como mucho 1 separador entre cada dígito — así
  // el match nunca cruza una palabra o un espacio de más hacia otro número.
  // FIX v3, 07-jul-2026: el v2 solo protegía cuando había una PALABRA entre
  // los dos números. Cuando cédula y celular venían en líneas separadas solo
  // por un salto de línea (ej. "10942383\n3239013881", caso real de Carlos
  // Guardo), el regex podía arrancar desde un dígito final de la cédula y
  // "morder" los primeros dígitos del celular real, generando un número
  // inventado. (?<!\d) y (?!\d) obligan a que el match no esté pegado a
  // NINGÚN otro dígito por ninguno de los dos lados — ahora nunca puede
  // empezar ni terminar a mitad de otro número, sin importar si el
  // separador entre ambos es una palabra, un espacio o un salto de línea.
  const m = texto.match(/(?<!\d)3(?:[\s.\-]?\d){9}(?!\d)/);
  if (!m) return null;
  const limpio = m[0].replace(/[^\d]/g, '');
  return '57' + limpio;
}

function extraerCedula(texto: string, sinCelular: string): string | null {
  // FIX 04-jul-2026: quitar puntos y comas de miles — la cédula colombiana
  // sale impresa así en el documento físico ("1.042.567.890") y mucha gente
  // la copia tal cual.
  // FIX v27.1, 22-jul-2026 — Bug 1 del paquete FIX_Sofia_v27_1: se REVIERTE
  // el strip de \s y \- que agregué en v27. Rompía los word boundaries en
  // mensajes multi-línea del tipo "1003456261\nCarmen galindo salgado" —
  // limpio se convertía en "1003456261Carmen..." y el \b entre "1" y "C"
  // ya no existía, así que la cédula no matcheaba y Sofía repreguntaba
  // FALTA_CEDULA como si nunca la hubieran mandado (evidencia real: caso
  // Carmen 22-jul 08:03, 573115822687). El caso original que motivó ese
  // strip (Roberto Morelo "323 608 3392") ya lo cubre pareceCelular()
  // en DATOS_MIN, que dispara CEDULA_PARECE_CELULAR sin depender del
  // strip aquí.
  const limpio = sinCelular.replace(/,/g, '');
  // Acepta cédulas colombianas de 8–10 dígitos aunque haya texto pegado
  // antes/después, y tolera espacios, puntos o guiones entre dígitos.
  // Los lookarounds solo impiden tomar un fragmento de un número más largo.
  const m = limpio.match(/(?<!\d)(\d(?:[\s.\-]?\d){7,9})(?!\d)/);
  if (!m) return null;
  const cedula = m[1].replace(/[^\d]/g, '');
  // FIX v27, 22-jul-2026 — Bug 5: si el número tiene exactamente 10 dígitos
  // y empieza por 3, es UNAMBIGUAMENTE un celular colombiano (patrón
  // 3XX XXX XXXX), no una cédula. Se rechaza aquí para que DATOS_MIN
  // dispare el mensaje de reconfirmación en su lugar.
  if (/^3\d{9}$/.test(cedula)) return null;
  return cedula;
}

// FIX v27, 22-jul-2026 — Bug 5 del paquete FIX_Sofia_v27: helper puro que
// dice si el texto se parece a un celular colombiano de 10 dígitos
// empezando por 3. Usado en DATOS_MIN para diferenciar "el cliente me dio
// su celular por error" (mensaje específico) de "el cliente escribió algo
// que ni siquiera son puros dígitos" (repregunta genérica).
function pareceCelular(texto: string): boolean {
  const limpio = texto.replace(/[.\s,\-]/g, '');
  return /^3\d{9}$/.test(limpio);
}

// FIX v27.1, 22-jul-2026 — Bug 1 del paquete FIX_Sofia_v27_1: correo se
// ofrece como opcional en el nuevo texto DATOS_CREDITO ("y si tienes un
// correo también"). Se extrae con el patrón email estándar para pasarlo
// al asesor en el resumen del handoff. NO se persiste a Supabase para no
// asumir columna que no se sabe si existe (Oscar confirma o crea columna
// aparte cuando quiera).
function extraerCorreo(texto: string): string | null {
  const m = texto.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  return m ? m[0] : null;
}

// ── Mensajes fijos ────────────────────────────────────────────────────────────

const MSG = {
  OPTIN: 'Para atenderte, ¿autorizas a Creditek a usar los datos de este chat? También puedes aceptar promociones por WhatsApp; son opcionales y puedes cancelarlas escribiendo SALIR. Política: https://aura.crediteksas.com/creditek/legal/',
  OPTIN_NO: 'Entendido, no hay problema 🙏 Si cambias de opinión aquí estamos. ¡Que tengas un buen día!',
  OPTIN_MARKETING: '¿Quieres recibir promociones de Creditek por WhatsApp? Es opcional. Puedes dejar de recibirlas escribiendo SALIR. Política: https://aura.crediteksas.com/creditek/legal/',
  OPTIN_MARKETING_NO: 'Perfecto. No te enviaremos campañas por WhatsApp y continuaremos atendiendo tu solicitud 😊',
  CIERRE_INTERES: 'Entendido, no hay problema 🙏 No te escribiré nuevamente sobre esta solicitud.',
  SOLO_PRODUCTOS: 'Entiendo 😊 En Creditek no manejamos préstamos de dinero en efectivo; te ayudamos a comprar celulares y otros equipos a crédito.',
  // FIX v27, 13-jul-2026: antes preguntaba genérico "¿En qué te puedo ayudar
  // hoy?" — ignoraba que ~90% de los clientes van por un celular (dato real
  // de Oscar) y agregaba un paso conversacional de más. Ahora asume celular
  // por defecto (dejando espacio explícito para corregir) y salta directo a
  // la pregunta de ciudad, que es la que de verdad hace avanzar el flujo.
  BIENVENIDA: '¡Perfecto! Te ayudamos a conseguir tu celular nuevo — si buscabas otra cosa, dímelo aquí mismo 😊 ¿En qué ciudad estás?',
  BIENVENIDA_CONOCIDO: (nombre: string) => `¡Hola ${nombre}! Qué bueno que vuelves 😊 Te ayudamos a conseguir tu celular nuevo — si buscabas otra cosa, dímelo aquí mismo. ¿En qué ciudad estás?`,
  CELULAR_FB: '¿Me regalas tu número de celular colombiano para atenderte mejor? 📱',
  CELULAR_FB_INVALIDO: '¿Me das tu celular? (10 dígitos, ej: 3001234567)',
  CIUDAD_PREGUNTA: '¿Y en qué ciudad estás? 😊',
  SIN_COBERTURA: 'Ahorita no tenemos tienda en esa ciudad, pero puede que te quede cerca una de estas: Tolú, Corozal, Chinú, Ciénaga de Oro o Coveñas. ¿Cuál te queda más cerca?',
  // FIX v24, 14-jul-2026 — Hallazgo 6: cierre honesto cuando el cliente dice
  // que ninguna de las 5 ciudades sugeridas le sirve — no se le fuerza un
  // handoff a un asesor lejano.
  SIN_ALIADO_CERCA: 'Entendido, por ahora no tenemos un aliado cerca de ti, pero guardamos tu ciudad para avisarte apenas abramos algo por tu zona 🙏',
  // FIX v27, 22-jul-2026 — Bugs 1+3 del paquete FIX_Sofia_v27:
  //   Bug 1: nunca pedir celular — el auto-fill silencioso ya lo captura
  //          de la sesión WhatsApp (línea ~1196) y para Facebook DM se
  //          captura en el estado CELULAR_FB antes de llegar aquí.
  //          La firma anterior (pideCelular: boolean) tenía además un
  //          parámetro invertido: las 4 call sites pasaban
  //          `canal === 'whatsapp'` (true en WhatsApp), lo que hacía
  //          disparar la rama "with celular" JUSTO en el canal donde el
  //          celular ya se conoce — exactamente el bug reportado con
  //          evidencia del 21-jul-2026 22:04.
  //   Bug 3: redacción exacta pedida por Oscar — corta, natural, correo
  //          como opcional.
  //   DATOS_GENERAL queda como alias de DATOS_CREDITO (mismo texto, sigue
  //          referenciado por MODALIDAD_CIUDAD legacy).
  DATOS_CREDITO: '¡Claro que sí! Te conecto con un asesor, pásame por favor nombre y cédula, y si tienes un correo también',
  DATOS_CONTADO: '¡Perfecto! Te conecto con un asesor, pásame tu nombre 😊',
  DATOS_GENERAL: '¡Claro que sí! Te conecto con un asesor, pásame por favor nombre y cédula, y si tienes un correo también',
  FALTA_NOMBRE: '¿Me regalas tu nombre completo? 😊',
  FALTA_CELULAR: '¿Y tu número de celular activo?',
  CELULAR_CONFIRMA: 'Tu número de contacto es este mismo, ¿cierto? 😊', // Fix v3 09-jul-2026: texto exacto definido por Oscar
  FALTA_CEDULA: '¿Y tu número de cédula? (para el trámite del crédito)',
  // FIX v27, 22-jul-2026 — Bug 5 del paquete FIX_Sofia_v27: cuando el cliente
  // da un número que parece celular (3XX XXX XXXX) donde se esperaba cédula.
  CEDULA_PARECE_CELULAR: 'Ese número parece un celular — ¿me confirmas tu número de cédula?',
  // FIX v27.1, 22-jul-2026 — Bug 2 del paquete FIX_Sofia_v27_1: cliente
  // mencionó dos ciudades válidas en la misma frase y el flujo se quedaba
  // en silencio (evidencia real: 22-jul 09:45, teléfono 573116568994).
  CIUDAD_AMBIGUA: (ciudades: string[]) => ciudades.length === 2
    ? `Veo que mencionaste dos — ¿cuál te queda mejor, ${ciudades[0]} o ${ciudades[1]}? 😊`
    : `Veo que mencionaste varias — ¿cuál te queda mejor: ${ciudades.slice(0, -1).join(', ')} o ${ciudades[ciudades.length - 1]}? 😊`,
  // Red de seguridad si en CIUDAD_MODAL ningún patrón conocido matchea.
  CIUDAD_REPETIR: 'Disculpa, ¿me confirmas cuál de estas te queda más cerca: Tolú, Corozal, Chinú, Ciénaga de Oro o Coveñas?',
  HANDOFF_MSG: (nombre: string, asesor: string, nombreComercial: string, tel: string) =>
    `Perfecto, ${nombre} 😊 Tu solicitud quedó registrada correctamente y fue asignada a ${nombreComercial}. ${asesor} continuará tu proceso lo antes posible; también puedes escribirle al ${tel}.`,
  HANDOFF_PENDING: (nombre: string) =>
    `Gracias, ${nombre} 😊 Recibí tus datos correctamente. Estamos asignándote un asesor y te contactaremos lo antes posible.`,
  ASESOR_NO_CONTESTA: (asesor2: string, tel2: string) =>
    `¡Qué raro! Te paso con otro asesor 😊 Escríbele a ${asesor2} al ${tel2} y dile que te mandó Sofía de Creditek.`,
  SIN_ASESOR: 'En este momento no tenemos asesor disponible en tu zona. Te contactaremos pronto 🙏',
  VOZ: 'Por favor escríbeme, no puedo escuchar mensajes de voz 😊',
  FIN: '¡Con gusto! Si necesitas algo más aquí estoy 😊',
  // FIX v24, 14-jul-2026 — ruta de motos (decisión de negocio de Oscar, no un
  // bug): Sofía no maneja motos en el flujo normal de celulares — conecta
  // directo con el contacto dedicado, sin pasar por captura de nombre/cédula/
  // celular ni asignación de tienda.
  MOTO_HANDOFF: 'Para motos manejamos un contacto especial 😊 Escríbele directo a Vanesa Montiel (Sonivox / Ofero) al 3112712447 y le cuentas qué buscas.',
};

function botonesConsentimientoUnico() {
  return [
    { id: 'consent_both', title: '✅ Acepto ambas' },
    { id: 'consent_service', title: 'Solo atención' },
    { id: 'consent_none', title: 'No autorizo' },
  ];
}

// ── Worker ────────────────────────────────────────────────────────────────────

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // SPEC v5-CRM, 13-jul-2026 — Pieza 2: el cron original (0 13 * * *, 8am
    // Colombia) ya estaba en uso para marcarLeadsPerdidos — NO se toca. Se
    // agregan 3 crons nuevos (ver wrangler.toml) para las rondas de
    // recordatorio a asesores; se distinguen por event.cron.
    if (event.cron === '0 13 * * *') { await marcarLeadsPerdidos(env); return; }
    if (event.cron === '0 18 * * *') { await recordatorioAsesores(env, 'ronda_1pm'); return; }
    if (event.cron === '0 22 * * *') { await recordatorioAsesores(env, 'ronda_5pm'); return; }
    if (event.cron === '0 14 * * 1-5') { await recordatorioAsesores(env, 'ronda_9am'); return; }
    // FIX v25, 16-jul-2026 — Hallazgo 8: seguimiento automático a leads mudos.
    if (event.cron === '*/30 * * * *') { await seguimientoLeadsMudos(env); return; }
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const sk = env.SUPABASE_SERVICE_KEY;
    const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json', 'Access-Control-Allow-Headers': 'Content-Type, X-Worker-Secret', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    // FIX v22, 13-jul-2026 — Hallazgo 1: estos 4 endpoints de lectura no
    // tenían ninguna autenticación — cualquiera con la URL pública del
    // Worker podía leer nombres, cédulas, teléfonos y conversaciones de
    // clientes. Se protegen con el mismo secreto compartido que ya usa
    // /api/enviar-mensaje (Pieza 1 del SPEC v5-CRM).
    const autorizado = !!env.WORKER_SHARED_SECRET && request.headers.get('X-Worker-Secret') === env.WORKER_SHARED_SECRET;

    if (url.pathname === '/api/stats' && request.method === 'GET') {
      if (!autorizado) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: cors });
      const pc = (r: Response) => parseInt(r.headers.get('Content-Range')?.split('/')[1] ?? '0', 10);
      const [a,b,c,d,e] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/clientes?select=id`, { headers: { apikey: sk, Authorization: `Bearer ${sk}`, Prefer: 'count=exact', 'Range-Unit': 'items', Range: '0-0' } }),
        fetch(`${SUPABASE_URL}/rest/v1/clientes?created_at=gte.${new Date().toISOString().slice(0,10)}&select=id`, { headers: { apikey: sk, Authorization: `Bearer ${sk}`, Prefer: 'count=exact', 'Range-Unit': 'items', Range: '0-0' } }),
        fetch(`${SUPABASE_URL}/rest/v1/clientes?optin_datos=eq.true&select=id`, { headers: { apikey: sk, Authorization: `Bearer ${sk}`, Prefer: 'count=exact', 'Range-Unit': 'items', Range: '0-0' } }),
        fetch(`${SUPABASE_URL}/rest/v1/clientes?estado_funnel=eq.lead_caliente&select=id`, { headers: { apikey: sk, Authorization: `Bearer ${sk}`, Prefer: 'count=exact', 'Range-Unit': 'items', Range: '0-0' } }),
        fetch(`${SUPABASE_URL}/rest/v1/clientes?estado_funnel=eq.transferido_asesor&select=id`, { headers: { apikey: sk, Authorization: `Bearer ${sk}`, Prefer: 'count=exact', 'Range-Unit': 'items', Range: '0-0' } }),
      ]);
      const leadsPendientes = pc(d);
      return new Response(JSON.stringify({
        total_clientes: pc(a),
        hoy: pc(b),
        optins: pc(c),
        leads: leadsPendientes,
        leads_pendientes: leadsPendientes,
        transferidos: pc(e),
      }), { headers: cors });
    }

    if (url.pathname === '/api/clients' && request.method === 'GET') {
      if (!autorizado) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: cors });
      const r = await fetch(`${SUPABASE_URL}/rest/v1/clientes?select=*&order=created_at.desc&limit=100`, { headers: { apikey: sk, Authorization: `Bearer ${sk}` } });
      return new Response(JSON.stringify(await r.json()), { headers: cors });
    }

    if (url.pathname === '/api/conversations' && request.method === 'GET') {
      if (!autorizado) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: cors });
      const tel = url.searchParams.get('telefono');
      const f = tel ? `telefono=eq.${encodeURIComponent(tel)}&` : '';
      const r = await fetch(`${SUPABASE_URL}/rest/v1/conversaciones?${f}select=*&order=timestamp.desc&limit=200`, { headers: { apikey: sk, Authorization: `Bearer ${sk}` } });
      return new Response(JSON.stringify(await r.json()), { headers: cors });
    }

    if (url.pathname === '/api/tiendas' && request.method === 'GET') {
      if (!autorizado) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: cors });
      const r = await fetch(`${SUPABASE_URL}/rest/v1/tiendas?select=*`, { headers: { apikey: sk, Authorization: `Bearer ${sk}` } });
      return new Response(JSON.stringify(await r.json()), { headers: cors });
    }

    // FIX v26, 13-jul-2026 — Fase 3, Mejora 5: agrega, por anuncio_id, cuántos
    // clientes llegaron a confirmacion_asesor='venta_cerrada' (el campo real
    // donde vive esa señal — no estado_funnel, que no tiene ningún valor de
    // "venta cerrada"; confirmado con consulta real a Supabase antes de
    // construir esto). Usado por Agente 3 para "costo real por venta" en el
    // ranking de campañas. anuncio_id es a nivel de ANUNCIO (ad), no de
    // campaña — el frontend hace su propio mapeo anuncio→campaña con los
    // datos de Meta que ya trae.
    if (url.pathname === '/api/ventas-por-anuncio' && request.method === 'GET') {
      if (!autorizado) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: cors });
      const [rTotal, rConAnuncio, rVentas] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/clientes?select=id`, { headers: { apikey: sk, Authorization: `Bearer ${sk}`, Prefer: 'count=exact', 'Range-Unit': 'items', Range: '0-0' } }),
        fetch(`${SUPABASE_URL}/rest/v1/clientes?anuncio_id=not.is.null&select=id`, { headers: { apikey: sk, Authorization: `Bearer ${sk}`, Prefer: 'count=exact', 'Range-Unit': 'items', Range: '0-0' } }),
        fetch(`${SUPABASE_URL}/rest/v1/clientes?anuncio_id=not.is.null&select=anuncio_id&confirmacion_asesor=eq.venta_cerrada`, { headers: { apikey: sk, Authorization: `Bearer ${sk}` } }),
      ]);
      const pc = (r: Response) => parseInt(r.headers.get('Content-Range')?.split('/')[1] ?? '0', 10);
      const ventasRows = await rVentas.json() as { anuncio_id: string }[];
      const porAnuncio: Record<string, number> = {};
      ventasRows.forEach(v => { porAnuncio[v.anuncio_id] = (porAnuncio[v.anuncio_id] || 0) + 1; });
      return new Response(JSON.stringify({
        total_clientes: pc(rTotal),
        con_anuncio_id: pc(rConAnuncio),
        ventas_por_anuncio: porAnuncio,
      }), { headers: cors });
    }

    // SPEC v5-CRM, 13-jul-2026 — Pieza 1: responder al cliente directo desde
    // el Panel de Respuestas. Manda mensajes reales de WhatsApp a nombre de
    // Creditek, protegido igual que los 4 endpoints de lectura de arriba
    // (FIX v22) con el mismo secreto compartido que ya usa gemini-proxy.
    if (url.pathname === '/api/enviar-mensaje' && request.method === 'POST') {
      if (!autorizado) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: cors });
      const { telefono, mensaje, meta_message_id: metaMessageId } = await request.json() as {
        telefono?: string;
        mensaje?: string;
        meta_message_id?: string;
      };
      if (!telefono || !mensaje?.trim()) {
        return new Response(JSON.stringify({ error: 'Falta telefono o mensaje' }), { status: 400, headers: cors });
      }
      if (metaMessageId && !(await reservarRecuperacionManual(env.CONVERSATIONS, metaMessageId))) {
        return new Response(JSON.stringify({ error: 'Recuperación ya respondida o ejecutada' }), { status: 409, headers: cors });
      }
      // Mismo mecanismo que ya usa Sofía — sin camino nuevo/paralelo.
      try {
        await enviarMensajeWA(telefono, mensaje.trim(), env.PHONE_NUMBER_ID, env.WHATSAPP_TOKEN);
        if (metaMessageId) await finalizarRecuperacionManual(env.CONVERSATIONS, metaMessageId, 'respondido');
      } catch (error) {
        if (metaMessageId) await finalizarRecuperacionManual(env.CONVERSATIONS, metaMessageId, 'error_envio');
        throw error;
      }
      // respondido_por: 'admin' — distingue en conversaciones que fue Oscar
      // desde el panel, no Sofía ('bot') ni el cliente (null).
      await guardarConv({ telefono, contenido: mensaje.trim(), respondido_por: 'admin', canal: 'whatsapp' }, sk);
      return new Response(JSON.stringify({ ok: true }), { headers: cors });
    }

    // Recuperación manual, exclusiva del panel AURA. Reutiliza la plantilla
    // oficial de handoff, exige cliente+tienda existentes y usa una llave
    // idempotente fija para que un doble clic nunca duplique el aviso.
    if (url.pathname === '/api/notificar-asesor' && request.method === 'POST') {
      if (!autorizado) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: cors });
      const { telefono } = await request.json() as { telefono?: string };
      const clienteId = String(telefono || '').replace(/\D/g, '');
      if (!clienteId) return new Response(JSON.stringify({ error: 'Falta telefono' }), { status: 400, headers: cors });

      const clienteRes = await fetch(
        `${SUPABASE_URL}/rest/v1/clientes?telefono=eq.${encodeURIComponent(clienteId)}&select=*&limit=1`,
        { headers: { apikey: sk, Authorization: `Bearer ${sk}` } },
      );
      const [cliente] = await clienteRes.json() as any[];
      if (!cliente?.tienda_id) return new Response(JSON.stringify({ error: 'Cliente sin tienda asignada' }), { status: 409, headers: cors });
      if (!cliente.optin_datos) return new Response(JSON.stringify({ error: 'Cliente sin autorización de datos' }), { status: 409, headers: cors });

      const tiendaRes = await fetch(
        `${SUPABASE_URL}/rest/v1/tiendas?id=eq.${encodeURIComponent(cliente.tienda_id)}&select=*&limit=1`,
        { headers: { apikey: sk, Authorization: `Bearer ${sk}` } },
      );
      const [tienda] = await tiendaRes.json() as any[];
      if (!tienda?.telefono || !tienda?.contacto) return new Response(JSON.stringify({ error: 'Tienda sin asesor disponible' }), { status: 409, headers: cors });

      const inicial = await buscarHandoffInicial(SUPABASE_URL, sk, clienteId);
      if (inicial?.status === 'sent' && inicial.meta_response_id) {
        return new Response(JSON.stringify({ ok: true, already_sent: true }), { headers: cors });
      }

      const conv: Conv = {
        estado: 'HANDOFF_PENDING', canal: 'whatsapp', historial: [],
        nombre: cliente.nombre, cedula: cliente.cedula,
        celular: cliente.telefono_contacto || cliente.telefono,
        correo: cliente.correo, ciudad: cliente.ciudad_normalizada || cliente.ciudad || tienda.ciudad,
        modalidad: cliente.modalidad || 'credito', producto_interes: cliente.producto_interes,
        tienda_id: tienda.id, tienda_nombre: tienda.nombre,
        tienda_nombre_comercial: tienda.nombre_comercial,
        tienda_contacto: tienda.contacto, tienda_telefono: tienda.telefono,
        tienda_tipo: tienda.tipo,
      };
      const reserva = await reservarHandoff(SUPABASE_URL, sk, {
        idempotencyKey: `advisor_handoff_manual:${clienteId}`,
        destinationId: tienda.id,
        destinationType: tienda.tipo === 'aliado' ? 'aliado' : 'tienda',
        origin: 'aura_manual_recovery',
        reassignmentOf: inicial?.id || null,
      });
      if (!reserva.permitido) {
        if (reserva.evidencia.status === 'sent') return new Response(JSON.stringify({ ok: true, already_sent: true }), { headers: cors });
        return new Response(JSON.stringify({ error: 'Notificación en revisión; no se duplicó el envío' }), { status: 409, headers: cors });
      }

      try {
        const metaId = await notificarAsesor(conv, tienda, env);
        await confirmarHandoff(SUPABASE_URL, sk, reserva.evidencia.id, metaId);
      } catch (error) {
        await marcarHandoffError(SUPABASE_URL, sk, reserva.evidencia.id, error instanceof Error ? error.message : 'manual_handoff_failed');
        return new Response(JSON.stringify({ error: 'Meta no confirmó el aviso al asesor' }), { status: 502, headers: cors });
      }

      await actualizarCliente(clienteId, {
        estado_funnel: 'transferido_asesor',
        fecha_transferido_asesor: new Date().toISOString(),
      }, sk);

      const nombreCorto = String(cliente.nombre || 'amigo').split(' ')[0];
      const avisoCliente = MSG.HANDOFF_MSG(nombreCorto, String(tienda.contacto).split(' ')[0], tienda.nombre_comercial || tienda.nombre, tienda.telefono);
      let clienteNotificado = true;
      try {
        await enviarMensajeWA(clienteId, avisoCliente, env.PHONE_NUMBER_ID, env.WHATSAPP_TOKEN);
        await guardarConv({ telefono: clienteId, contenido: avisoCliente, respondido_por: 'bot', canal: 'whatsapp' }, sk);
      } catch {
        clienteNotificado = false;
      }
      return new Response(JSON.stringify({ ok: true, cliente_notificado: clienteNotificado }), { headers: cors });
    }

    if (request.method === 'GET') {
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');
      if (mode === 'subscribe' && token === env.VERIFY_TOKEN) return new Response(challenge, { status: 200 });
      return new Response('Forbidden', { status: 403 });
    }

    if (request.method !== 'POST') return new Response('OK', { status: 200 });

    const body = await request.json() as any;
    const object = body?.object as string;

    if (object === 'whatsapp_business_account') {
      const msg = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      if (!msg) return new Response('OK', { status: 200 });
      const msgId = msg.id as string | undefined;
      let auditoriaEvento: AuditoriaEventoMeta | null = null;
      if (msgId) {
        const timestamp = Number(msg.timestamp) * 1000;
        const reserva = await reservarEventoMeta(env.CONVERSATIONS, {
          metaId: msgId,
          rutaEntrada: 'webhook_whatsapp',
          fechaOriginal: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString(),
        });
        auditoriaEvento = reserva.auditoria;
        if (!reserva.permitido) {
          console.warn('[IDEMPOTENCIA] evento bloqueado', {
            metaId: msgId,
            idInterno: reserva.auditoria.idInterno,
            rutaEntrada: 'webhook_whatsapp',
            fechaOriginal: reserva.auditoria.fechaOriginal,
            fechaReintento: reserva.auditoria.fechaReintento,
            motivo: reserva.auditoria.motivo,
            resultadoFinal: reserva.auditoria.resultadoFinal,
          });
          return new Response('OK', { status: 200 });
        }
      }
      const from = msg.from as string;

      // FIX v1, 04-jul-2026: si el que escribe es uno de nuestros propios
      // aliados (ej. su auto-respuesta de WhatsApp Business rebotó al
      // notificarle un handoff), no debe abrirse el flujo de cliente nuevo
      // con un número que ya es tienda.
      // Ajuste sobre el doc original: se excluyen los mensajes tipo 'button'
      // de este chequeo — el asesor escribe desde el mismo número que
      // tiendas.telefono, así que sin esta excepción sus botones de
      // confirmación (fix de hoy) quedarían bloqueados aquí mismo.
      // PAQUETE 3, v26 20-jul-2026: antes esto solo ignoraba el mensaje en
      // silencio. Ahora, si el número es de un admin/aliado, se le responde
      // con su link de registro de clientes en vez de dejarlo sin respuesta.
      if (msg.type !== 'button') {
        const tiendaAdmin = await buscarTiendaPorTelefono(from, sk);
        if (tiendaAdmin) {
          const primerNombre = (tiendaAdmin.contacto || '').trim().split(/\s+/)[0] || '';
          const saludo = primerNombre ? `¡Hola ${primerNombre}!` : '¡Hola!';
          // OJO: se usa tiendaAdmin.id (ej. "CK-02"), NO tiendaAdmin.ref_qr.
          // El documento asumía que ref_qr tenía el formato "CK-05", pero los
          // datos reales de Supabase muestran que ref_qr guarda otro formato
          // interno (ej. "ck02_corozal1", usado en otra parte del flujo para
          // /buscarTiendaQR). El código que de verdad coincide con
          // creditek-erp.origenes.codigo (lo que el formulario espera en
          // ?origen=) es tiendaAdmin.id.
          const linkRegistro = `https://oscarjp88-arch.github.io/consultora/creditek/erp/registro.html?origen=${encodeURIComponent(tiendaAdmin.id)}`;
          const respuestaAdmin = `${saludo} Aquí tienes tu link de registro de clientes para ${tiendaAdmin.nombre_comercial || 'tu tienda'}:\n${linkRegistro}\nGuárdalo en favoritos 😊 ¿Necesitas algo más?`;
          await enviarMensajeWA(from, respuestaAdmin, env.PHONE_NUMBER_ID, env.WHATSAPP_TOKEN);
          if (auditoriaEvento) await actualizarAuditoriaEvento(env.CONVERSATIONS, auditoriaEvento, 'respondido', 'respuesta de aliado enviada');
          console.warn('[ADMIN-ALIADO] link de registro enviado a', from);
          return new Response('OK', { status: 200 });
        }
      }

      // FIX 04-jul-2026: si es un asesor tocando un botón de confirmación
      // (no un cliente escribiendo), manejarlo aparte y salir — nunca debe
      // entrar al flujo normal de procesarMensaje().
      if (msg.type === 'button') {
        await manejarConfirmacionAsesor(msg, sk);
        if (auditoriaEvento) await actualizarAuditoriaEvento(env.CONVERSATIONS, auditoriaEvento, 'respondido', 'confirmación de asesor procesada');
        return new Response('OK', { status: 200 });
      }

      // Detectar mensaje de voz
      if (msg.type === 'audio') {
        await enviarMensajeWA(from, MSG.VOZ, env.PHONE_NUMBER_ID, env.WHATSAPP_TOKEN);
        if (auditoriaEvento) await actualizarAuditoriaEvento(env.CONVERSATIONS, auditoriaEvento, 'respondido', 'respuesta de audio enviada');
        return new Response('OK', { status: 200 });
      }
      // FIX v21, 13-jul-2026: botones de respuesta rápida (Interactive Message,
      // distinto del `type: 'button'` de plantilla que usa el asesor arriba).
      // Cuando el cliente toca uno de estos botones, Meta manda
      // `interactive.button_reply.{id,title}`. Se traduce el `id` (no el
      // `title`, que trae emoji delante y rompe los regex anclados de
      // detectaRechaza como `^no[,. ]`) a un texto plano equivalente, para que
      // detectaAcepta/detectaRechaza/detectaCredito/detectaContado lo procesen
      // sin duplicar lógica — el respaldo de texto libre (el cliente escribe
      // en vez de tocar) sigue funcionando exactamente igual que antes.
      const MAPA_BOTON_RAPIDO: Record<string, string> = {
        optin_si: 'acepto', optin_no: 'no, gracias',
        consent_both: 'autorizo datos y promociones', consent_service: 'autorizo solo atencion', consent_none: 'no autorizo',
        marketing_si: 'acepto', marketing_no: 'no, gracias',
        credito: 'crédito', contado: 'contado',
      };
      const esBotonRapido = msg.type === 'interactive' && msg.interactive?.type === 'button_reply';
      const botonId = esBotonRapido ? (msg.interactive.button_reply.id as string) : null;
      const texto = esBotonRapido
        ? (MAPA_BOTON_RAPIDO[botonId || ''] ?? (msg.interactive.button_reply.title as string || '').trim())
        : (msg.text?.body ?? '').trim();
      if (!texto) return new Response('OK', { status: 200 });
      const qrMatch = texto.match(/tienda\s+(\S+)/i);
      const refQr = qrMatch ? qrMatch[1] : null;
      const referral = msg.referral || null; // FIX 5, 03-jul-2026
      // FIX 6, 03-jul-2026: enrutar por Durable Object único por cliente —
      // garantiza que los mensajes de una misma conversación se procesen uno
      // a la vez, en orden, eliminando la condición de carrera del KV.
      const doIdWA = env.CONVERSACION_DO.idFromName(from);
      const doStubWA = env.CONVERSACION_DO.get(doIdWA);
      try {
        const respuestaDO = await doStubWA.fetch('https://do/procesar', {
          method: 'POST',
          body: JSON.stringify({ clienteId: from, texto, canal: 'whatsapp', refQr, referral, auditoriaEvento }),
        });
        if (!respuestaDO.ok) throw new Error(`ConversacionDO respondió ${respuestaDO.status}`);
      } catch (error) {
        if (auditoriaEvento) await actualizarAuditoriaEvento(env.CONVERSATIONS, auditoriaEvento, 'error_envio', 'procesamiento incompleto; requiere revisión manual');
        console.error('[WEBHOOK-WA] procesamiento incompleto; no se reejecutará lógica comercial automáticamente:', error);
        throw error;
      }
      return new Response('OK', { status: 200 });
    }

    if (object === 'page') {
      const messaging = body?.entry?.[0]?.messaging?.[0];
      if (!messaging?.message || messaging.message.is_echo) return new Response('OK', { status: 200 });
      const senderId = messaging.sender?.id as string;
      const texto = (messaging.message?.text ?? '').trim();
      if (!texto || !senderId) return new Response('OK', { status: 200 });
      const pageId = messaging.recipient?.id as string;
      const msgId = messaging.message?.mid as string | undefined;
      let auditoriaEvento: AuditoriaEventoMeta | null = null;
      if (msgId) {
        const reserva = await reservarEventoMeta(env.CONVERSATIONS, {
          metaId: msgId,
          rutaEntrada: 'webhook_messenger',
          fechaOriginal: messaging.timestamp ? new Date(Number(messaging.timestamp)).toISOString() : new Date().toISOString(),
        });
        auditoriaEvento = reserva.auditoria;
        if (!reserva.permitido) return new Response('OK', { status: 200 });
      }
      // FIX 6, 03-jul-2026: mismo enrutamiento por Durable Object que WhatsApp
      const doIdFB = env.CONVERSACION_DO.idFromName('fb_' + senderId);
      const doStubFB = env.CONVERSACION_DO.get(doIdFB);
      await doStubFB.fetch('https://do/procesar', {
        method: 'POST',
        body: JSON.stringify({ clienteId: 'fb_' + senderId, texto, canal: 'facebook_dm', refQr: null, referral: null, pageId, auditoriaEvento }),
      });
      return new Response('OK', { status: 200 });
    }

    return new Response('OK', { status: 200 });
  },
};

// ── Procesador ────────────────────────────────────────────────────────────────

async function procesarMensaje(
  clienteId: string, texto: string, canal: string, refQr: string | null, referral: any,
  // FIX v21, 13-jul-2026: sendFn acepta botones opcionales (Quick Reply) —
  // solo se usan en WhatsApp; el wrapper de Facebook en ConversacionDO los ignora.
  sendFn: (msg: string, botones?: { id: string; title: string }[]) => Promise<void>, env: Env, sk: string,
  sourceMessageId?: string | null
) {
  const raw = await env.CONVERSATIONS.get(clienteId);
  let conv: Conv = raw ? JSON.parse(raw) : null;
  const ahora = Date.now();

  const esNueva = debeIniciarConversacion(
    conv ? { estado: conv.estado, ultimoMensaje: conv.ultimo_mensaje } : null,
  );

  if (esNueva) {
    // Fix v1 09-jul-2026 — BUGS 2 y 3 (evidencia real, tabla conversaciones):
    // 573024227892 recibió el mensaje completo de handoff 2 veces (3h13min
    // aparte) y 573243402133 recibió la pregunta de OPTIN 2 veces (31 min
    // aparte, justo tras un handoff). Causa raíz: al resetear por timeout,
    // este bloque descartaba TODA la conversación y reconstruía optin_aceptado
    // solo desde una consulta fresca a Supabase — si esa lectura no reflejaba
    // a tiempo el opt-in ya aceptado en esta misma sesión, el cliente volvía a
    // ver el OPTIN completo. Ahora se confía primero en el optin_aceptado que
    // la conversación en curso YA tenía (conservado en KV, sin depender de
    // relecturas a Supabase), y en vez de forzar 'OPTIN' a ciegas, se reinicia
    // al estado 'FIN' cuando el cliente ya es conocido — ese caso YA maneja
    // bien al "cliente que vuelve" (saluda por nombre, limpia tienda vieja,
    // sin repetir OPTIN ni el mensaje de handoff completo).
    const clienteExistente = conv;
    const db = await buscarCliente(clienteId, sk);
    const optinYaAceptado = clienteExistente?.optin_aceptado ?? (db?.optin_datos ?? false);
    conv = {
      estado: optinYaAceptado ? 'FIN' : 'OPTIN', canal, historial: [], ultimo_mensaje: ahora,
      nombre: db?.nombre ?? clienteExistente?.nombre ?? undefined,
      celular: db?.celular ?? clienteExistente?.celular ?? undefined,
      optin_aceptado: optinYaAceptado,
      // FIX v20, 13-jul-2026: si el cliente ya existía (en esta conversación o
      // en Supabase), se conserva su fuente real ya registrada en vez de
      // recalcularla a ciegas con el mensaje actual — esto evitaba que un
      // cliente de Facebook, al escribir su primer mensaje por WhatsApp real
      // (nuevo Durable Object, sin historial), quedara reclasificado como
      // whatsapp_organico. determinarFuente() solo se usa para clientes
      // genuinamente nuevos, sin registro previo.
      fuente: clienteExistente?.fuente ?? db?.fuente ?? determinarFuente(referral, refQr, canal), // FIX 5, 03-jul-2026 / FIX v20, 13-jul-2026
      ...extraerDatosAnuncio(referral),
      tiendas_intentadas: [],
    };
    if (refQr) {
      const t = await buscarTiendaQR(refQr, sk);
      if (t) { conv.tienda_id=t.id; conv.tienda_nombre=t.nombre; conv.tienda_nombre_comercial=t.nombre_comercial; conv.tienda_genero=t.genero; conv.tienda_tipo=t.tipo; conv.tienda_contacto=t.contacto; conv.tienda_telefono=t.telefono; conv.ciudad=t.ciudad; }
    }
  }

  conv.ultimo_mensaje = ahora;
  conv.ultimo_paso = conv.estado;
  conv.ultima_respuesta_cliente = texto;
  const save = () => {
    conv.ultimo_paso = conv.estado;
    return env.CONVERSATIONS.put(clienteId, JSON.stringify(conv), { expirationTtl: 86400*7 });
  };
  await guardarConv({ telefono: clienteId, contenido: texto, respondido_por: null, canal }, sk);

  const push = (quien: string, msg: string) => {
    conv.historial.push(quien+': '+msg.substring(0,200));
    if (conv.historial.length > 12) conv.historial = conv.historial.slice(-12);
  };
  push('Cliente', texto);

  let respuesta = '';
  // FIX v21, 13-jul-2026: botones de respuesta rápida para el mensaje actual,
  // si aplica (OPTIN y pregunta de modalidad, solo en WhatsApp).
  let botones: { id: string; title: string }[] | undefined;

  // Un rechazo comercial explícito cierra cualquier flujo previo al handoff.
  // Al marcarlo perdido, el cron de seguimiento deja de incluirlo.
  if (conv.estado !== 'OPTIN' && conv.estado !== 'OPTIN_MARKETING' && conv.estado !== 'HANDOFF' && detectaCierreComercial(texto)) {
    conv.estado = 'FIN';
    respuesta = MSG.CIERRE_INTERES;
    await actualizarCliente(clienteId, {
      estado_funnel: 'perdido',
      razon_perdida: 'rechazo_cliente',
      recordatorio_enviado_at: new Date().toISOString(),
    }, sk);
    await sendFn(respuesta);
    await guardarConv({ telefono: clienteId, contenido: respuesta, respondido_por: 'bot', canal }, sk);
    push('Sofia', respuesta);
    await save();
    return;
  }

  const departamento = detectarDepartamento(texto);
  if (
    conv.optin_aceptado
    && departamento
    && !conv.municipio
    && (['ESCUCHAR', 'CIUDAD_MODAL', 'CIUDAD'] as Estado[]).includes(conv.estado)
  ) {
    conv.departamento = departamento;
    conv.estado = 'CIUDAD_MODAL';
    respuesta = preguntaPendiente({
      optinAceptado: true,
      departamento,
    }) || MSG.CIUDAD_PREGUNTA;
    conv.ultima_pregunta = respuesta;
    await sendFn(respuesta);
    await guardarConv({ telefono: clienteId, contenido: respuesta, respondido_por: 'bot', canal }, sk);
    push('Sofia', respuesta);
    await save();
    return;
  }

  if (
    esMensajeCortoContextual(texto)
    && (['ESCUCHAR', 'CIUDAD_MODAL', 'CIUDAD'] as Estado[]).includes(conv.estado)
    && !conv.municipio
    && !conv.tienda_id
  ) {
    respuesta = preguntaPendiente({
      optinAceptado: conv.optin_aceptado,
      departamento: conv.departamento,
    }) || MSG.CIUDAD_PREGUNTA;
    conv.ultima_pregunta = respuesta;
    await sendFn(respuesta);
    await guardarConv({ telefono: clienteId, contenido: respuesta, respondido_por: 'bot', canal }, sk);
    push('Sofia', respuesta);
    await save();
    return;
  }

  if (conv.optin_aceptado && conv.estado !== 'OPTIN' && conv.estado !== 'OPTIN_MARKETING') {
    const respuestaContinuidad = resolverPreguntaDeContinuidad(texto, {
      optinAceptado: conv.optin_aceptado,
      nombre: conv.nombre,
      cedula: conv.cedula,
      departamento: conv.departamento,
      municipio: conv.municipio || conv.ciudad,
      tiendaAsignada: !!conv.tienda_id,
      tiendaNombre: conv.tienda_nombre_comercial || conv.tienda_nombre,
      leadCreado: conv.lead_creado || conv.estado === 'HANDOFF',
      modalidad: conv.modalidad,
    });
    if (respuestaContinuidad) {
      const siguiente = (conv.lead_creado || conv.estado === 'HANDOFF')
        ? null
        : preguntaPendiente({
          optinAceptado: conv.optin_aceptado,
          nombre: conv.nombre,
          cedula: conv.cedula,
          departamento: conv.departamento,
          municipio: conv.municipio || conv.ciudad,
          tiendaAsignada: !!conv.tienda_id,
          leadCreado: conv.lead_creado,
          modalidad: conv.modalidad,
        });
      respuesta = siguiente ? `${respuestaContinuidad}\n\n${siguiente}` : respuestaContinuidad;
      conv.ultima_pregunta = siguiente || undefined;
      await sendFn(respuesta);
      await guardarConv({ telefono: clienteId, contenido: respuesta, respondido_por: 'bot', canal }, sk);
      push('Sofia', respuesta);
      await save();
      return;
    }
  }

  switch (conv.estado) {

    // ── OPTIN ────────────────────────────────────────────────────────────────
    case 'OPTIN': {
      // Cliente conocido con opt-in
      if (conv.optin_aceptado) {
        const n = (conv.nombre||'').split(' ')[0];
        respuesta = n ? MSG.BIENVENIDA_CONOCIDO(n) : MSG.BIENVENIDA;
        // FIX v27, 13-jul-2026: mismo criterio de asunción de celular que en
        // la aceptación normal del opt-in — este camino es un reingreso con
        // opt-in ya aceptado, pero sin interés aún registrado.
        if (canal !== 'facebook_dm' && !conv.producto_interes) conv.producto_interes = 'celular (asumido)';
        conv.estado = canal === 'facebook_dm' ? 'CELULAR_FB' : 'ESCUCHAR';
        break;
      }
      // Primer mensaje
      if (conv.historial.length <= 1) {
        // Si el cliente pregunta sobre el proceso antes de autorizar,
        // responder brevemente y luego pedir autorización.
        if (esConsultaDuranteCaptura(texto) || /\b(requisit|cuot|preci|cr[eé]dit|proceso|financi)/i.test(texto)) {
          const fija = respuestaConsultaFrecuenteDuranteCaptura(texto);
          const respuestaBreve = fija || 'El proceso es muy rápido: solo necesitas tu cédula y en minutos sabes si aplicas 😊';
          respuesta = `${respuestaBreve}\n\n${MSG.OPTIN}`;
        } else {
          respuesta = MSG.OPTIN;
        }
        // FIX v21, 13-jul-2026: botones de respuesta rápida en WhatsApp — en
        // Facebook/Instagram se deja el texto libre igual que antes (Meta no
        // ofrece este mismo mecanismo de botones vía la API de Messenger que
        // ya usa este Worker).
        if (canal === 'whatsapp') {
          botones = botonesConsentimientoUnico();
        }
        await upsertCliente({
          telefono: clienteId, fuente: conv.fuente, canal_origen: canalOrigenReal(conv.fuente),
          anuncio_id: conv.anuncio_id, anuncio_titulo: conv.anuncio_titulo, ctwa_clid: conv.ctwa_clid,
          meta_source_url: referral?.source_url || null, meta_ctwa_clid: referral?.ctwa_clid || null, // FIX v1, 07-jul-2026: guardar dato crudo de Meta para auditar atribución
        }, sk);
        break;
      }
      // El cliente puede insistir con una duda comercial sin haber dado una
      // señal afirmativa de autorización. Se responde, pero el estado sigue
      // en OPTIN y se vuelve a solicitar el consentimiento explícito.
      if (esConsultaDuranteCaptura(texto) || /\b(requisit|cuot|preci|cr[eé]dit|proceso|financi)/i.test(texto)) {
        const fija = respuestaConsultaFrecuenteDuranteCaptura(texto);
        const respuestaBreve = fija || 'El proceso es muy rápido: solo necesitas tu cédula y en minutos sabes si aplicas 😊';
        respuesta = `${respuestaBreve}\n\n${MSG.OPTIN}`;
        if (canal === 'whatsapp') {
          botones = botonesConsentimientoUnico();
        }
        break;
      }
      // Respuesta al opt-in (rechazo se revisa primero para no confundir "no autorizo" con aceptación)
      if (detectaRechaza(texto)) {
        await upsertCliente({
          telefono: clienteId,
          optin_datos: false,
          fuente: conv.fuente,
          canal_origen: canalOrigenReal(conv.fuente),
          estado_funnel: 'perdido',
          razon_perdida: 'rechazo_cliente',
          recordatorio_enviado_at: new Date().toISOString(),
        }, sk);
        conv.estado = 'FIN'; respuesta = MSG.OPTIN_NO;
      } else if (detectaAcepta(texto)) {
        conv.optin_aceptado = true;
        const aceptaPromociones = /datos y promociones/i.test(texto);
        const consentAt = new Date().toISOString();
        const consentVersion = 'whatsapp_marketing_v1_2026-08-27';
        await upsertCliente({
          telefono: clienteId,
          optin_datos: true,
          optin_operativo: true,
          optin_comercial: canal === 'whatsapp' ? aceptaPromociones : false,
          optin_whatsapp: canal === 'whatsapp' ? aceptaPromociones : false,
          optin_fecha: canal === 'whatsapp' ? consentAt : null,
          optin_canal: canal === 'whatsapp' ? 'whatsapp' : canal,
          optin_version: canal === 'whatsapp' ? consentVersion : null,
          optin_evidence_id: canal === 'whatsapp' ? (sourceMessageId || null) : null,
          fuente: conv.fuente,
          canal_origen: canalOrigenReal(conv.fuente),
        }, sk);
        if (canal === 'whatsapp') {
          await registrarConsentimientoWhatsapp({
            telefono: clienteId,
            decision: aceptaPromociones ? 'granted' : 'denied',
            responseText: texto,
            sourceMessageId: sourceMessageId || null,
            consentAt,
            policyVersion: consentVersion,
          }, sk);
        }
        await avanzarEstadoFunnel(clienteId, 'contactado', sk); // FIX 03-jul-2026
        if (canal === 'facebook_dm') {
          conv.estado = 'CELULAR_FB'; respuesta = MSG.CELULAR_FB;
        } else if (conv.tienda_id) {
          // FIX v27, 13-jul-2026: se asume "celular" como interés por defecto
        // (decisión de Oscar, ~90% de los clientes van por celular) — solo si
        // el cliente no dejó ya una pista real en su propio texto, para que
        // el flujo/reportes puedan distinguir "lo dijo el cliente" de "se asumió".
        if (!conv.producto_interes) conv.producto_interes = 'celular (asumido)';
        conv.estado = 'ESCUCHAR'; respuesta = MSG.BIENVENIDA;
        } else {
          // FIX v27, 13-jul-2026: se asume "celular" como interés por defecto
        // (decisión de Oscar, ~90% de los clientes van por celular) — solo si
        // el cliente no dejó ya una pista real en su propio texto, para que
        // el flujo/reportes puedan distinguir "lo dijo el cliente" de "se asumió".
        if (!conv.producto_interes) conv.producto_interes = 'celular (asumido)';
        conv.estado = 'ESCUCHAR'; respuesta = MSG.BIENVENIDA;
        }
      } else {
        // FIX v24, 14-jul-2026 — Hallazgo 4 (confirmado con código real, el
        // comentario anterior decía literal "asumir que acepta"): esto avanzaba
        // el opt-in de captura de datos personales sin ninguna señal afirmativa
        // real — un simple "Buenos días" contaba como consentimiento. Es un
        // problema de consentimiento real, no solo de UX (ver documento).
        // Ahora una respuesta ambigua (ni sí ni no reconocido) NO avanza el
        // opt-in — se vuelve a preguntar, igual que el patrón de reintento ya
        // usado en el estado MODALIDAD para no dejar al cliente en un mensaje
        // calcado indefinidamente.
        conv.intentos_optin = (conv.intentos_optin || 0) + 1;
        if (conv.intentos_optin >= 2) {
          // Dos intentos sin señal clara — no forzamos el opt-in, cerramos sin capturar nada.
          conv.estado = 'FIN';
          respuesta = MSG.OPTIN_NO;
          break;
        }
        respuesta = MSG.OPTIN;
        if (canal === 'whatsapp') {
          botones = botonesConsentimientoUnico();
        }
      }
      break;
    }

    // Consentimiento comercial independiente: rechazarlo nunca impide que
    // Sofía continúe atendiendo la solicitud iniciada por el cliente.
    case 'OPTIN_MARKETING': {
      const granted = detectaAcepta(texto);
      const denied = detectaRechaza(texto);
      if (!granted && !denied) {
        respuesta = MSG.OPTIN_MARKETING;
        botones = [
          { id: 'marketing_si', title: '✅ Sí, autorizo' },
          { id: 'marketing_no', title: '❌ No, gracias' },
        ];
        break;
      }

      const consentAt = new Date().toISOString();
      const consentVersion = 'whatsapp_marketing_v1_2026-08-27';
      await upsertCliente({
        telefono: clienteId,
        optin_comercial: granted,
        optin_whatsapp: granted,
        optin_fecha: consentAt,
        optin_canal: 'whatsapp',
        optin_version: consentVersion,
        optin_evidence_id: sourceMessageId || null,
      }, sk);
      await registrarConsentimientoWhatsapp({
        telefono: clienteId,
        decision: granted ? 'granted' : 'denied',
        responseText: texto,
        sourceMessageId: sourceMessageId || null,
        consentAt,
        policyVersion: consentVersion,
      }, sk);

      if (!conv.producto_interes) conv.producto_interes = 'celular (asumido)';
      conv.estado = 'ESCUCHAR';
      respuesta = granted ? MSG.BIENVENIDA : `${MSG.OPTIN_MARKETING_NO}\n\n${MSG.BIENVENIDA}`;
      break;
    }

    // ── CELULAR_FB ───────────────────────────────────────────────────────────
    case 'CELULAR_FB': {
      const cel = extraerCelular(texto);
      if (cel) {
        conv.celular = cel;
        // FIX v20, 13-jul-2026: se guardaba con '+' delante ('+573006034500'),
        // pero el webhook real de WhatsApp Business Cloud API entrega `from`
        // SIN '+' ('573006034500') — ese es el mismo valor que se usa como
        // clienteId cuando el cliente escribe después por WhatsApp real. Con
        // el '+' de más, buscarCliente(clienteId, sk) nunca encontraba esta
        // fila (formato distinto), forzando un reinicio completo de la
        // conversación que perdía el canal_origen/fuente de Facebook. Se
        // guarda ahora sin '+', igual que el resto del sistema (clienteId,
        // guardarConv, avanzarEstadoFunnel, etc.).
        await upsertCliente({ telefono: cel, optin_datos: true, fuente: 'facebook_dm', canal_origen: 'facebook_dm' }, sk);
        // FIX v27, 13-jul-2026: se asume "celular" como interés por defecto
        // (decisión de Oscar, ~90% de los clientes van por celular) — solo si
        // el cliente no dejó ya una pista real en su propio texto, para que
        // el flujo/reportes puedan distinguir "lo dijo el cliente" de "se asumió".
        if (!conv.producto_interes) conv.producto_interes = 'celular (asumido)';
        conv.estado = 'ESCUCHAR'; respuesta = MSG.BIENVENIDA;
      } else {
        respuesta = MSG.CELULAR_FB_INVALIDO;
      }
      break;
    }

    // ── ESCUCHAR ─────────────────────────────────────────────────────────────
    case 'ESCUCHAR': {
      // Resolver la intención de préstamo antes del detector de ciudad.
      if (detectaSolicitudDinero(texto)) {
        respuesta = MSG.SOLO_PRODUCTOS;
        break;
      }

      // FIX v24, 14-jul-2026 — ruta de motos: decisión de negocio de Oscar,
      // no forma parte del flujo normal de celulares. \bmotos?\b|\bmotocicletas?\b
      // usa límites de palabra reales (mismo criterio ya documentado en este
      // archivo para evitar falsos positivos con palabras cortas). Se excluye
      // el caso de negación ("no busco una moto", "no es moto") — el propio
      // comentario original de este bloque ya usaba ese ejemplo, así que se
      // respeta explícitamente en vez de forzar el handoff de motos por error.
      const mencionaMoto = /\bmotos?\b|\bmotocicletas?\b/i.test(texto);
      const niegaMoto = /\bno\b[^.!?]{0,25}\bmotos?\b/i.test(texto);
      if (mencionaMoto && !niegaMoto) {
        respuesta = MSG.MOTO_HANDOFF;
        conv.estado = 'FIN';
        break;
      }

      // Detectar ciudad PRIMERO — FIX v27, 13-jul-2026: con el nuevo mensaje
      // de bienvenida (que ya asume "celular" y pregunta la ciudad directo),
      // la respuesta más común aquí es solo el nombre de una ciudad, no una
      // descripción de producto. Si se guardara como producto_interes a
      // ciegas (como antes), se sobrescribiría "celular (asumido)" con texto
      // como "Corozal", perdiendo la señal real. Solo se guarda como interés
      // si el texto NO es (o no contiene) una ciudad reconocida — así una
      // corrección real como "no busco una moto" sigue funcionando igual.
      //
      // FIX v25, 16-jul-2026 — Hallazgo 1 (REGRESIÓN de v24): el filtro
      // anterior (pareceCiudad + longitud) dejaba pasar "Telefono", "acepto",
      // "crédito", "Computador", "De mesa" a la búsqueda difusa de tienda.
      // Ahora, igual que ya hace MODALIDAD_CIUDAD, primero se limpia el texto
      // de palabras de modalidad — si lo que queda es una palabra reservada
      // del flujo/producto, un fragmento que empieza con preposición ("de
      // mesa"), o ya fue reconocido como crédito/contado/sí/no, NO se intenta
      // la búsqueda de ciudad en absoluto.
      let ciudadMen = detectaCiudad(texto);
      let sinCobertura = false;
      const textoSinModalidadEscuchar = texto
        .replace(/cr[eé]d\w{0,3}to|acredit|financiad|cuota|plazo|mensual|abono|\bcontado\b|efectivo|de una|pago\s*(completo|total)/gi, '')
        .replace(/[!¡?¿.,]+/g, '')
        .trim();
      const posibleCiudadEscuchar = textoSinModalidadEscuchar;
      const pareceIntentoCiudad = !ciudadMen && !conv.tienda_id
        && posibleCiudadEscuchar.length > 2
        && posibleCiudadEscuchar.split(/\s+/).length <= 4
        && pareceCiudad(posibleCiudadEscuchar)
        && !esPalabraReservadaEscuchar(posibleCiudadEscuchar)
        && !/^(de|del|para|con|sin)\b/i.test(posibleCiudadEscuchar)
        && !detectaAcepta(posibleCiudadEscuchar) && !detectaRechaza(posibleCiudadEscuchar);
      if (pareceIntentoCiudad) {
        const intento = await buscarTiendaRandom(posibleCiudadEscuchar, [], sk);
        if (intento) {
          conv.tienda_id=intento.id; conv.tienda_nombre=intento.nombre; conv.tienda_nombre_comercial=intento.nombre_comercial;
          conv.tienda_genero=intento.genero; conv.tienda_tipo=intento.tipo; conv.tienda_contacto=intento.contacto; conv.tienda_telefono=intento.telefono; conv.ciudad=intento.ciudad;
          conv.municipio = intento.ciudad;
          await registrarTiendaAsignada(clienteId, intento, sk);
          ciudadMen = intento.ciudad;
        } else {
          sinCobertura = true;
          // FIX v24, 14-jul-2026 — Hallazgo 6 (columna ya existía en Supabase,
          // clientes.ciudad_original, sin conectar en el código): guarda la
          // ciudad real que el cliente escribió, para mapeo de futuros aliados.
          // FIX v26, 20-jul-2026 — Hallazgo 1: también en memoria (conv), para
          // que MODALIDAD sepa que ya se conoce la ciudad sin cobertura.
          conv.ciudad_original = posibleCiudadEscuchar;
          conv.municipio = posibleCiudadEscuchar;
          await actualizarCliente(clienteId, { ciudad_original: posibleCiudadEscuchar }, sk);
        }
      }
      if (texto.length > 2 && !ciudadMen && !sinCobertura) conv.producto_interes = texto;

      if (ciudadMen && !conv.tienda_id) {
        const t = await buscarTiendaRandom(ciudadMen, [], sk);
        if (t) {
          conv.tienda_id=t.id; conv.tienda_nombre=t.nombre; conv.tienda_nombre_comercial=t.nombre_comercial; conv.tienda_genero=t.genero; conv.tienda_tipo=t.tipo; conv.tienda_contacto=t.contacto; conv.tienda_telefono=t.telefono; conv.ciudad=t.ciudad;
          conv.municipio = t.ciudad;
          await registrarTiendaAsignada(clienteId, t, sk); // FIX 03-jul-2026
        }
      }

      // Detectar modalidad
      if (detectaCredito(texto)) conv.modalidad = 'credito';
      else if (detectaContado(texto)) conv.modalidad = 'contado';

      // FIX v25, 16-jul-2026 — Hallazgo 2 (mensaje "Frankenstein" de 3
      // preguntas apiladas): cuando hay ciudad sin cobertura, ese mensaje
      // REEMPLAZA cualquier otro contenido del turno — no se llama a Claude
      // (ahorra el costo de una llamada que de todos modos se iba a
      // descartar) y no se concatena la pregunta de modalidad; esa se
      // pregunta en un turno aparte (ver fix en MODALIDAD/CIUDAD_MODAL para
      // que no se repita la pregunta de ciudad cuando ya se sabe que no hay
      // cobertura — Hallazgo 3).
      if (sinCobertura) {
        conv.estado = 'CIUDAD_MODAL';
        respuesta = MSG.SIN_COBERTURA;
        break;
      }

      // Generar respuesta comercial con Claude
      const ctx = {
        estado: 'ESCUCHAR',
        historial: conv.historial,
        ciudad: conv.ciudad,
        tienda: conv.tienda_nombre,
        nombre: conv.nombre,
        modalidad: conv.modalidad,
        producto: conv.producto_interes,
        ciudadesCubiertas: await obtenerCiudadesCubiertas(sk), // FIX 04-jul-2026
      };
      const respClaude = await generarRespuesta('ESCUCHAR', texto, ctx, env.ANTHROPIC_API_KEY);

      // Si ya tenemos modalidad Y ciudad → pedir datos
      if (conv.modalidad && conv.tienda_id) {
        conv.estado = 'DATOS_MIN';
        const pedirDatos = conv.modalidad === 'contado' ? MSG.DATOS_CONTADO : MSG.DATOS_CREDITO;
        respuesta = respClaude + '\n\n' + pedirDatos;
      }
      // Si tenemos modalidad pero no ciudad → preguntar ciudad
      else if (conv.modalidad && !conv.tienda_id) {
        conv.estado = 'CIUDAD_MODAL';
        respuesta = respClaude + '\n\n¿Y en qué ciudad estás? 😊';
      }
      // FIX v27, 22-jul-2026 — Bug 4 del paquete FIX_Sofia_v27: eliminar la
      // pregunta activa de modalidad. Regla de negocio de Oscar: el 99% de
      // clientes son crédito → asumir crédito por default y NO preguntar.
      // detectaContado() sigue activo arriba (línea ~877) como detector
      // pasivo: si el cliente menciona contado/efectivo espontáneamente,
      // conv.modalidad ya quedó en 'contado' y se respeta.

      // Si ya tenemos ciudad pero no modalidad → asumir crédito, ir directo a datos
      else if (!conv.modalidad && conv.tienda_id) {
        conv.modalidad = 'credito';
        conv.estado = 'DATOS_MIN';
        respuesta = respClaude + '\n\n' + MSG.DATOS_CREDITO;
      }
      // Si no tenemos ni modalidad ni ciudad → asumir crédito, pedir ciudad
      else {
        conv.modalidad = 'credito';
        conv.estado = 'CIUDAD_MODAL';
        respuesta = respClaude + '\n\n' + MSG.CIUDAD_PREGUNTA;
      }
      break;
    }

    // ── MODALIDAD (legado — solo alcanzable por conversaciones ya en curso) ─
    // FIX v27, 22-jul-2026 — Bug 4 del paquete FIX_Sofia_v27: ya no se
    // transiciona a MODALIDAD desde ESCUCHAR ni CIUDAD_MODAL. Este case
    // se conserva SOLO para conversaciones que ya estaban aquí al momento
    // del deploy — el detector pasivo detectaCredito/detectaContado se
    // respeta, pero si no matchea se asume crédito y se avanza (nunca
    // se repregunta activamente crédito/contado).
    case 'MODALIDAD' as any: {
      if (texto.length > 2 && !conv.producto_interes) conv.producto_interes = texto;

      if (detectaCredito(texto)) conv.modalidad = 'credito';
      else if (detectaContado(texto)) conv.modalidad = 'contado';
      else conv.modalidad = 'credito'; // default asumido

      if (conv.tienda_id) {
        conv.estado = 'DATOS_MIN';
        respuesta = conv.modalidad === 'contado' ? MSG.DATOS_CONTADO : MSG.DATOS_CREDITO;
      } else {
        conv.estado = 'CIUDAD_MODAL';
        respuesta = conv.ciudad_original ? MSG.SIN_COBERTURA : MSG.CIUDAD_PREGUNTA;
      }
      break;
    }

    // ── MODALIDAD_CIUDAD (legado — solo para conversaciones ya en curso) ─────
    case 'MODALIDAD_CIUDAD' as any: {
      // Guardar cualquier interés/producto mencionado — nunca se descarta, siempre sigue hacia el asesor
      if (texto.length > 2 && !conv.producto_interes) conv.producto_interes = texto;

      if (detectaCredito(texto)) conv.modalidad = 'credito';
      else if (detectaContado(texto)) conv.modalidad = 'contado';

      // Candidato a ciudad: lo que quede del texto después de quitar palabras de modalidad y puntuación.
      // No dependemos solo de la lista fija de alias (detectaCiudad) — si el cliente menciona
      // cualquier otra ciudad, igual se intenta la búsqueda real contra Supabase.
      const textoSinModalidad = texto
        .replace(/cr[eé]dito|financiad|cuota|plazo|mensual|abono|\bcontado\b|efectivo|de una|pago\s*(completo|total)/gi, '')
        .replace(/[!¡?¿.,]+/g, '')
        .trim();
      const posibleCiudad = detectaCiudad(texto) || textoSinModalidad;
      const intentoCiudad = posibleCiudad.length > 2 && pareceCiudad(texto);

      let tiendaNoEncontrada = false;
      if (!conv.tienda_id && intentoCiudad) {
        const t = await buscarTiendaRandom(posibleCiudad, conv.tiendas_intentadas||[], sk);
        if (t) {
          conv.tienda_id=t.id; conv.tienda_nombre=t.nombre; conv.tienda_nombre_comercial=t.nombre_comercial;
          conv.tienda_genero=t.genero; conv.tienda_tipo=t.tipo; conv.tienda_contacto=t.contacto; conv.tienda_telefono=t.telefono; conv.ciudad=t.ciudad;
          await registrarTiendaAsignada(clienteId, t, sk); // FIX 03-jul-2026
        } else {
          tiendaNoEncontrada = true;
        }
      }

      // Tenemos todo → pedir datos
      if (conv.modalidad && conv.tienda_id) {
        conv.estado = 'DATOS_MIN';
        const pedirDatos = conv.modalidad === 'contado' ? MSG.DATOS_CONTADO : MSG.DATOS_CREDITO;
        respuesta = pedirDatos;
      }
      // Se intentó una ciudad y no hay cobertura → mensaje fijo, esperar nueva ciudad
      else if (tiendaNoEncontrada && conv.modalidad) {
        conv.estado = 'CIUDAD_MODAL';
        respuesta = MSG.SIN_COBERTURA;
      }
      else if (tiendaNoEncontrada && !conv.modalidad) {
        respuesta = MSG.SIN_COBERTURA + '\n\n¿Lo quieres a crédito o de contado? 😊';
        // FIX v21, 13-jul-2026: la ciudad ya se resolvió (sin cobertura) — lo
        // único que falta responder aquí es la modalidad.
        if (canal === 'whatsapp') {
          botones = [{ id: 'credito', title: '💳 Crédito' }, { id: 'contado', title: '💵 Contado' }];
        }
      }
      // Solo modalidad, ciudad aún no mencionada → pedir ciudad
      else if (conv.modalidad && !conv.tienda_id) {
        conv.estado = 'CIUDAD_MODAL';
        respuesta = '¿Y en qué ciudad estás? 😊';
      }
      // Solo ciudad → pedir modalidad
      else if (!conv.modalidad && conv.tienda_id) {
        respuesta = '¿Lo vas a pagar a crédito o de contado? 😊';
        // FIX v21, 13-jul-2026: ciudad ya conocida — solo falta modalidad.
        if (canal === 'whatsapp') {
          botones = [{ id: 'credito', title: '💳 Crédito' }, { id: 'contado', title: '💵 Contado' }];
        }
      }
      // FIX v1, 04-jul-2026: si parece pregunta (no intento de ciudad),
      // responderla de verdad con Claude antes de repetir lo que falta —
      // antes esta rama solo repetía la pregunta sin responder nada.
      else if (!intentoCiudad) {
        const ctx = {
          estado: 'MODALIDAD_CIUDAD', historial: conv.historial, ciudad: conv.ciudad,
          tienda: conv.tienda_nombre, nombre: conv.nombre, modalidad: conv.modalidad,
          producto: conv.producto_interes,
        };
        const respClaude = await generarRespuesta('MODALIDAD_CIUDAD', texto, ctx, env.ANTHROPIC_API_KEY);
        respuesta = respClaude + '\n\n¿Lo quieres a crédito o de contado? ¿Y en qué ciudad estás? 😊';
      }
      // Nada detectado → repetir
      else {
        respuesta = '¿Lo quieres a crédito o de contado? ¿Y en qué ciudad estás? 😊';
      }
      break;
    }

    // ── CIUDAD_MODAL ─────────────────────────────────────────────────────────
    case 'CIUDAD_MODAL' as any: {
      if (conv.modelo_pendiente && detectaAcepta(texto)) {
        conv.producto_interes = conv.modelo_pendiente;
        conv.modelo_pendiente = undefined;
        respuesta = MSG.CIUDAD_REPETIR;
        break;
      }
      if (conv.modelo_pendiente && detectaRechaza(texto)) {
        conv.modelo_pendiente = undefined;
        respuesta = MSG.CIUDAD_REPETIR;
        break;
      }
      if (pareceReferenciaProducto(texto)) {
        const reenganche = resolverReengancheFin(conv, texto);
        conv.estado = reenganche.estado;
        conv.producto_interes = reenganche.producto_interes;
        conv.modelo_pendiente = reenganche.modelo_pendiente;
        respuesta = reenganche.respuesta;
        break;
      }
      // Si respondió una ciudad, priorizarla sobre una aclaración de modelo.
      conv.modelo_pendiente = undefined;
      const ciudadTexto = texto.trim().replace(/[!¡?¿.,]+/g,'').trim();

      // FIX v27.1, 22-jul-2026 — Bug 2 del paquete FIX_Sofia_v27_1: si el
      // cliente mencionó DOS o más ciudades válidas en la misma frase (ej.
      // "te queda cerca cienaga de oro o chinu !!"), buscarTiendaRandom
      // aterrizaba en una sola arbitrariamente (por orden de iteración de
      // ciudadMasParecida) y en el caso reportado (573116568994, 22-jul
      // 09:45) el flujo se quedó en silencio total. Ahora se detecta la
      // ambigüedad antes de buscar tienda y se pregunta cuál explícito.
      const tNorm = norm(ciudadTexto);
      const canonicasAlias: Array<{ alias: RegExp; canonica: string }> = [
        { alias: /\btolu\b/,                              canonica: 'Tolú' },
        { alias: /\bcorozal\b/,                           canonica: 'Corozal' },
        { alias: /\bchinu\b/,                             canonica: 'Chinú' },
        { alias: /\bcienaga(?:\s+de\s+oro)?\b/,           canonica: 'Ciénaga de Oro' },
        { alias: /\bcoven(?:as)?\b/,                      canonica: 'Coveñas' },
      ];
      const ciudadesMencionadas = canonicasAlias
        .map(x => ({ canonica: x.canonica, pos: tNorm.search(x.alias) }))
        .filter(x => x.pos >= 0)
        .sort((a, b) => a.pos - b.pos)
        .map(x => x.canonica);
      if (ciudadesMencionadas.length >= 2) {
        respuesta = MSG.CIUDAD_AMBIGUA(ciudadesMencionadas);
        break;
      }

      const tienda = await buscarTiendaRandom(ciudadTexto, conv.tiendas_intentadas||[], sk);
      if (tienda) {
        conv.tienda_id=tienda.id; conv.tienda_nombre=tienda.nombre;
        conv.tienda_nombre_comercial=tienda.nombre_comercial; conv.tienda_genero=tienda.genero; conv.tienda_tipo=tienda.tipo;
        conv.tienda_contacto=tienda.contacto; conv.tienda_telefono=tienda.telefono;
        conv.ciudad=tienda.ciudad;
        conv.municipio = tienda.ciudad;
        // FIX 03-jul-2026: se agrega tienda_id para que la rotación real funcione
        await registrarTiendaAsignada(clienteId, tienda, sk); // FIX 03-jul-2026: reemplaza el actualizarCliente directo, ahora también avanza el pipeline
        // FIX v27, 22-jul-2026 — Bug 4 del paquete FIX_Sofia_v27: si no hay
        // modalidad detectada, asumir crédito por default e ir directo a
        // DATOS_MIN (nunca preguntar activamente crédito/contado). El
        // detector pasivo detectaContado() sigue activo en ESCUCHAR — si
        // el cliente lo mencionó espontáneamente conv.modalidad ya vino
        // 'contado' y se respeta.
        if (!conv.modalidad) conv.modalidad = 'credito';
        conv.estado = 'DATOS_MIN';
        respuesta = conv.modalidad === 'contado' ? MSG.DATOS_CONTADO : MSG.DATOS_CREDITO;
      } else {
        // FIX v24, 14-jul-2026 — Hallazgo 6 (columna ya existía en Supabase,
        // clientes.ciudad_original, sin conectar en el código): guarda la
        // ciudad real que el cliente escribió, para mapeo de futuros aliados.
        // FIX v26, 20-jul-2026 — Hallazgo 1: también en memoria (conv).
        // FIX v27, 22-jul-2026 — Bug 7 del paquete FIX_Sofia_v27: la flag
        // yaMandoSinCobertura ahora considera TAMBIÉN si ciudad_original ya
        // estaba seteado ANTES de este turno (marcador sticky en memoria).
        // Antes dependía solo de historial.some(), que se rompe si el
        // historial fue trimeado o si el mensaje se combinó con otro.
        // FIX v27.1, 22-jul-2026 — Bug 2 del paquete FIX_Sofia_v27_1: se
        // reordena — respuesta se setea ANTES de actualizarCliente. Si el
        // upsert a Supabase falla o timeout-ea, la respuesta al cliente
        // ya está definida y el catch superior no genera silencio.
        const yaTeniaSinCobertura = !!conv.ciudad_original;
        conv.ciudad_original = ciudadTexto;
        conv.municipio = ciudadTexto;
        const yaMandoSinCobertura = yaTeniaSinCobertura || conv.historial.some(h => h.startsWith('Sofia: ') && h.includes('no tenemos tienda en esa ciudad'));
        // FIX v25, 16-jul-2026 — Hallazgo 5 (evidencia real: yorledis, Lorica,
        // fue transferida a Corozal sin haber elegido nunca una ciudad
        // cercana — repitió "Lorica" dos veces). El fallback "cualquiera"
        // (FIX 04-jul-2026) asignaba tienda automática ante CUALQUIER
        // respuesta que no fuera un rechazo explícito, no solo ante una
        // elección real de una de las 5 sugeridas. Confirmado con Oscar:
        // ahora solo se asigna tienda con match real (arriba, vía
        // buscarTiendaRandom); si el segundo intento también falla, se
        // cierra honesto igual que un rechazo explícito — nunca se asigna
        // una tienda que el cliente no eligió.
        if (yaMandoSinCobertura) {
          conv.estado = 'FIN';
          respuesta = MSG.SIN_ALIADO_CERCA;
        } else {
          respuesta = MSG.SIN_COBERTURA;
        }
        await actualizarCliente(clienteId, { ciudad_original: ciudadTexto }, sk);
      }

      // FIX v27.1, 22-jul-2026 — Bug 2 del paquete FIX_Sofia_v27_1: red de
      // seguridad final. Si por cualquier ruta futura respuesta queda vacía
      // en este case, mandamos el reprompt genérico en vez de dejar al
      // cliente en silencio.
      if (!respuesta) respuesta = MSG.CIUDAD_REPETIR;
      break;
    }

    // ── DATOS_MIN ────────────────────────────────────────────────────────────
    case 'DATOS_MIN': {
      // La ficha en Supabase puede estar más adelantada que el estado de la
      // conversación (por ejemplo, tras una recuperación manual desde AURA).
      // Rehidratar antes de decidir qué preguntar evita volver a solicitar
      // nombre o cédula que el cliente ya entregó.
      if (!conv.nombre || (conv.modalidad === 'credito' && !conv.cedula)) {
        try {
          const existenteRes = await fetch(
            `${SUPABASE_URL}/rest/v1/clientes?telefono=eq.${encodeURIComponent(clienteId)}&select=nombre,cedula,telefono_contacto,tienda_id,ciudad,ciudad_normalizada&limit=1`,
            { headers: { apikey: sk, Authorization: `Bearer ${sk}` } },
          );
          const [existente] = await existenteRes.json() as any[];
          if (existente) {
            conv.nombre ||= existente.nombre || undefined;
            conv.cedula ||= existente.cedula || undefined;
            conv.celular ||= existente.telefono_contacto || clienteId;
            conv.tienda_id ||= existente.tienda_id || undefined;
            conv.ciudad ||= existente.ciudad_normalizada || existente.ciudad || undefined;
          }
        } catch {
          console.warn('[DATOS-MIN] no fue posible rehidratar la ficha existente');
        }
      }

      // Una intención de moto puede aparecer después de que ya preguntamos
      // los datos (caso real: el cliente aclaró "es para una moto"). Debe
      // salir al contacto especializado, no convertirse en nombre ni quedar
      // atrapada pidiendo cédula.
      if (esIntencionMoto(texto)) {
        respuesta = MSG.MOTO_HANDOFF;
        conv.estado = 'FIN';
        break;
      }

      // Si el cliente interrumpe la captura con una duda, se responde primero
      // y luego se pide solamente el dato que falta. Antes este manejo solo
      // existía cuando faltaba el nombre: al esperar cédula, cualquier pregunta
      // era ignorada y Sofía repetía FALTA_CEDULA en bucle.
      if (esConsultaDuranteCaptura(texto)) {
        const fija = respuestaConsultaFrecuenteDuranteCaptura(texto);
        const ctx = {
          estado: 'DATOS_MIN',
          historial: conv.historial,
          ciudad: conv.ciudad,
          tienda: conv.tienda_nombre,
          nombre: conv.nombre,
          modalidad: conv.modalidad,
          producto: conv.producto_interes,
          soloResponderDuda: true,
        };
        const respuestaDuda = fija || await generarRespuesta('DATOS_MIN', texto, ctx, env.ANTHROPIC_API_KEY);
        const siguienteDato = !conv.nombre
          ? MSG.FALTA_NOMBRE
          : (conv.modalidad === 'credito' && !conv.cedula ? MSG.FALTA_CEDULA : '');
        respuesta = siguienteDato ? `${respuestaDuda}\n\n${siguienteDato}` : respuestaDuda;
        break;
      }

      // FIX v27.1, 22-jul-2026 — Bug 1 del paquete FIX_Sofia_v27_1: se
      // extrae primero el correo para que su @ y su dominio no interfieran
      // con la búsqueda de nombre después (extraerNombre exige texto
      // alfabético). Correo va al asesor en el resumen del handoff, no a
      // Supabase (columna no confirmada).
      const correo = extraerCorreo(texto);
      const textoSinCorreo = correo ? texto.replace(correo, '') : texto;

      // Extraer lo que llegó
      const celular = extraerCelular(textoSinCorreo);
      const textoSinCel = celular ? textoSinCorreo.replace(celular.replace('57',''), '') : textoSinCorreo;
      const cedula = extraerCedula(textoSinCorreo, textoSinCel);
      // FIX v1, 04-jul-2026: antes se probaba extraerNombre() contra el texto
      // completo — si el cliente mandaba cédula/celular en el mismo mensaje,
      // los números que quedaban rompían el ancla de fin de línea del regex
      // de nombre, y siempre devolvía null. Ahora se limpia cédula, celular
      // y palabras conectoras primero, y se prueba ahí antes de rendirse.
      const textoSinCelNiCedula = cedula ? textoSinCel.replace(cedula, '') : textoSinCel;
      // FIX v26, 20-jul-2026 — Hallazgo 3 (evidencia real, 573185780017:
      // "Jesus Rafael Mercado Martínez, C.C 92028816, Celular 3185780017").
      // \bCC\b nunca hacía match contra "C.C" (con puntos, el formato real
      // que casi todo el mundo escribe) — el punto rompe el \b de en medio.
      // Esa "C.C" sobrante quedaba pegada al nombre, empujando el conteo de
      // palabras de extraerNombre() de 4 a 5 y tumbando el match completo
      // (su regex exige que el texto entero encaje, máximo 4 palabras) — por
      // eso nombre, cédula Y celular llegaban en el mismo mensaje pero solo
      // cédula y celular se guardaban; el nombre se perdía en silencio.
      const textoParaNombre = textoSinCelNiCedula
        .replace(/\bC\.?C\.?\b|\bc[eé]dula\b|\bcelular\b|\by\s+mi\b|\bmi\b/gi, '')
        .replace(/[,.:;]/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      const datosAgrupados = extraerDatosMinimos(texto);
      const nombre = extraerNombre(textoParaNombre) || extraerNombre(texto) || datosAgrupados.nombre;
      let cedulaFinal = datosAgrupados.cedula && (!cedula || datosAgrupados.cedula.length > cedula.length)
        ? datosAgrupados.cedula
        : cedula;
      // Fallback: texto que es solo dígitos de longitud cédula.
      const soloDigitos = texto.trim().replace(/[\s\-.]/g, '');
      if (!cedulaFinal && /^\d{8,10}$/.test(soloDigitos) && !/^3\d{9}$/.test(soloDigitos)) {
        cedulaFinal = soloDigitos;
      }
      const celularFinal = celular || datosAgrupados.celular;
      const correoFinal = correo || datosAgrupados.correo;

      if (nombre && !conv.nombre) conv.nombre = nombre;
      if (celularFinal && !conv.celular) conv.celular = celularFinal;
      if (cedulaFinal && !conv.cedula) conv.cedula = cedulaFinal;
      // FIX v27.1, 22-jul-2026 — Bug 1: correo opcional al handoff.
      if (correoFinal && !conv.correo) conv.correo = correoFinal;

      // FIX v21, 13-jul-2026: en WhatsApp el número de quien escribe ya viene
      // en cada mensaje entrante (msg.from = clienteId) — no hay necesidad de
      // preguntar ni esperar confirmación ("¿es este tu número?"), se asigna
      // directo y en silencio. Antes se esperaba que el cliente escribiera
      // "sí"/"correcto" (detectaConfirmacionCelular) para completar este dato,
      // generando una pregunta redundante que Oscar pidió eliminar.
      // Esto NO afecta a un cliente que llegó por Facebook/Instagram y ya pasó
      // por CELULAR_FB: para ese caso conv.celular ya quedó seteado ahí mismo
      // (con el número real que escribió), así que la condición `!conv.celular`
      // es falsa y este bloque no lo toca — aunque en este punto su `canal`
      // técnico también sea 'whatsapp' (ya está conversando por WhatsApp real).
      // En Facebook DM puro el clienteId es un PSID, no un teléfono real, así
      // que la condición `canal === 'whatsapp'` sigue protegiendo ese caso.
      if (!celular && !conv.celular && canal === 'whatsapp') {
        conv.celular = clienteId;
      }

      // Actualizar los datos sin inflar el indicador: una persona entra a
      // lead_caliente cuando ya entregó al menos nombre o cédula, no por
      // cualquier respuesta dentro de DATOS_MIN. El avance usa la función
      // granular para llenar también fecha_lead_caliente y no retroceder.
      const upd: Record<string,any> = {};
      if (conv.nombre) upd.nombre = conv.nombre;
      if (conv.celular) upd.telefono_contacto = conv.celular;
      if (conv.cedula) upd.cedula = conv.cedula;
      await actualizarCliente(clienteId, upd, sk);
      if (conv.nombre || conv.cedula) {
        await avanzarEstadoFunnel(clienteId, 'lead_caliente', sk);
      }

      // FIX v1, 07-jul-2026: jerarquía de datos mínimos (decisión de negocio de
      // Oscar) — el celular es el ÚNICO dato que bloquea el handoff, porque es
      // el mínimo indispensable para que el asesor pueda contactar al lead.
      // Nombre y cédula se siguen pidiendo igual que antes, pero si el cliente
      // no los da después de una vuelta, ya NO bloquean el handoff — antes
      // faltaNombre/faltaCedula podían dejar el handoff congelado para siempre
      // aunque el celular ya estuviera capturado, perdiendo leads recuperables
      // sin necesidad. Por eso el celular ahora se revisa primero.
      const faltaCelular = !conv.celular;
      if (faltaCelular) {
        // FIX v21, 13-jul-2026: con el auto-fill silencioso de arriba,
        // faltaCelular ya nunca es true en WhatsApp (siempre queda cubierto
        // por `conv.celular = clienteId`), así que en la práctica esta rama
        // solo se alcanza para clientes de Facebook DM — el clienteId ahí es
        // un PSID, no un teléfono real, así que siempre se pregunta directo
        // con FALTA_CELULAR. Se deja el condicional de MSG.CELULAR_CONFIRMA
        // como respaldo por si algún caso futuro llega aquí sin celular en
        // WhatsApp (ej. un fallo de red al guardar el auto-fill).
        respuesta = (canal === 'whatsapp' && !detectaRechaza(texto)) ? MSG.CELULAR_CONFIRMA : MSG.FALTA_CELULAR;
        break;
      }

      const faltaNombre = !conv.nombre;
      const faltaCedula = conv.modalidad === 'credito' && !conv.cedula;

      // FIX v27, 22-jul-2026 — Bug 2 del paquete FIX_Sofia_v27: red de
      // seguridad — el handoff NO se dispara si falta nombre o cédula
      // (cuando aplica). Antes, tras UN reask con historial.some(),
      // el flujo caía a hacerHandoff con conv.nombre undefined,
      // rotulando "¡Listo amigo!" y perdiendo leads como "Jhonaister"
      // (evidencia 21-jul-2026 22:34-22:37).
      //
      // Bug 9 del paquete: el mensaje de handoff usa conv.nombre fresco
      // (línea ~1367 en hacerHandoff), así que si aquí garantizamos
      // que conv.nombre esté seteado antes de llamar hacerHandoff, el
      // "¡Listo amigo!" nunca aparece — el fix es preventivo.
      //
      // Bug 5 del paquete: si estamos esperando cédula y el cliente nos
      // manda un número que parece celular colombiano (3XX XXX XXXX),
      // respondemos con un mensaje específico en vez de la repregunta
      // genérica (evidencia 21-jul, Roberto Morelo).
      if (faltaNombre) { respuesta = MSG.FALTA_NOMBRE; break; }
      if (faltaCedula) {
        respuesta = pareceCelular(texto) ? MSG.CEDULA_PARECE_CELULAR : MSG.FALTA_CEDULA;
        break;
      }

      // Tenemos datos mínimos — verificar ciudad
      if (!conv.tienda_id) {
        conv.estado = 'CIUDAD';
        respuesta = MSG.CIUDAD_PREGUNTA;
        break;
      }

      // Todo listo — handoff
      await hacerHandoff(conv, clienteId, sendFn, env, sk, canal);
      await save();
      return;
    }

    // ── CIUDAD ───────────────────────────────────────────────────────────────
    case 'CIUDAD': {
      const ciudadTexto = texto.trim().replace(/[!¡?¿.,]+/g,'').trim();
      const tienda = await buscarTiendaRandom(ciudadTexto, conv.tiendas_intentadas||[], sk);
      if (tienda) {
        conv.tienda_id=tienda.id; conv.tienda_nombre=tienda.nombre;
        conv.tienda_nombre_comercial=tienda.nombre_comercial; conv.tienda_genero=tienda.genero; conv.tienda_tipo=tienda.tipo;
        conv.tienda_contacto=tienda.contacto; conv.tienda_telefono=tienda.telefono;
        conv.ciudad=tienda.ciudad;
        conv.municipio = tienda.ciudad;
        await registrarTiendaAsignada(clienteId, tienda, sk); // FIX 03-jul-2026: reemplaza el actualizarCliente directo, ahora también avanza el pipeline
        await hacerHandoff(conv, clienteId, sendFn, env, sk, canal);
        await save();
        return;
      } else {
        // FIX v24, 14-jul-2026 — Hallazgo 6 (columna ya existía en Supabase,
        // clientes.ciudad_original, sin conectar en el código): guarda la
        // ciudad real que el cliente escribió, para mapeo de futuros aliados.
        // FIX v26, 20-jul-2026 — Hallazgo 1: también en memoria (conv).
        // FIX v27, 22-jul-2026 — Bug 7 del paquete FIX_Sofia_v27: la flag
        // yaMandoSinCobertura ahora considera TAMBIÉN si ciudad_original ya
        // estaba seteado ANTES de este turno (marcador sticky en memoria).
        // Antes dependía solo de historial.some(), que se rompe si el
        // historial fue trimeado o si el mensaje se combinó con otro.
        const yaTeniaSinCobertura = !!conv.ciudad_original;
        conv.ciudad_original = ciudadTexto;
        conv.municipio = ciudadTexto;
        await actualizarCliente(clienteId, { ciudad_original: ciudadTexto }, sk);
        const yaMandoSinCobertura = yaTeniaSinCobertura || conv.historial.some(h => h.startsWith('Sofia: ') && h.includes('no tenemos tienda en esa ciudad'));
        // FIX v25, 16-jul-2026 — Hallazgo 5, mismo criterio que en
        // CIUDAD_MODAL: se elimina el fallback "cualquiera" (FIX 04-jul-2026)
        // que asignaba tienda automática sin elección explícita. Aquí ya hay
        // datos completos (nombre/cédula/celular, estado_funnel ya quedó en
        // 'lead_caliente' desde DATOS_MIN), así que el lead no se pierde —
        // solo se evita conectarlo con un asesor que nunca eligió.
        if (yaMandoSinCobertura) {
          conv.estado = 'FIN';
          respuesta = MSG.SIN_ALIADO_CERCA;
        } else {
          respuesta = MSG.SIN_COBERTURA;
        }
      }
      break;
    }

    // ── HANDOFF ──────────────────────────────────────────────────────────────
    case 'HANDOFF_PENDING': {
      respuesta = MSG.HANDOFF_PENDING((conv.nombre || '').split(' ')[0] || 'amigo');
      break;
    }

    case 'HANDOFF': {
      // Cliente dice que el asesor no contestó
      const noContesto = /no.*contest|no.*respond|no.*llama|no.*escrib/i.test(texto);
      if (noContesto) {
        // Buscar siguiente asesor en la misma ciudad
        const siguiente = await buscarTiendaRandom(conv.ciudad||'', conv.tiendas_intentadas||[], sk);
        if (siguiente) {
          conv.tienda_id=siguiente.id; conv.tienda_nombre=siguiente.nombre;
          conv.tienda_nombre_comercial=siguiente.nombre_comercial; conv.tienda_genero=siguiente.genero; conv.tienda_tipo=siguiente.tipo;
          conv.tienda_contacto=siguiente.contacto; conv.tienda_telefono=siguiente.telefono;
          (conv.tiendas_intentadas||[]).push(siguiente.id);
          const nombreAsesor = siguiente.contacto.split(' ')[0];
          respuesta = MSG.ASESOR_NO_CONTESTA(nombreAsesor, siguiente.telefono);
          // Una reasignación se audita con una llave propia y nunca cuenta como
          // un lead nuevo. Si no existe la evidencia inicial, no se envía otro
          // aviso: queda para revisión manual en vez de inflar el KPI.
          const inicial = await buscarHandoffInicial(SUPABASE_URL, sk, clienteId);
          if (inicial?.id) {
            const reserva = await reservarHandoff(SUPABASE_URL, sk, {
              idempotencyKey: `advisor_reassignment:${clienteId}:${siguiente.id}`,
              destinationId: siguiente.id,
              destinationType: siguiente.tipo === 'aliado' ? 'aliado' : 'tienda',
              origin: 'reassignment',
              reassignmentOf: inicial.id,
            });
            // La reasignación solo se audita. El handoff inicial ya fue
            // certificado y no se envía un segundo aviso automático a Meta.
            if (reserva.permitido && reserva.evidencia.status !== 'sent') {
              console.info('[HANDOFF-REASSIGNMENT] auditoría reservada; envío automático omitido');
            }
          } else {
            console.warn('[HANDOFF-REASSIGNMENT] sin evidencia inicial; revisión manual');
          }
        } else {
          respuesta = MSG.SIN_ASESOR;
        }
      } else if (tieneIntencionReal(texto)) {
        // Sofía ya cumplió su función: no reinicia el embudo ni intenta cerrar
        // la venta. Cualquier condición comercial posterior (cuota inicial,
        // documentos, aprobación, precio) vuelve al asesor ya asignado.
        const nombreAsesor = (conv.tienda_contacto || '').split(' ')[0] || 'tu asesor';
        respuesta = mensajeConsultaAsesor(texto, nombreAsesor, conv.tienda_telefono || '');
      } else {
        respuesta = MSG.FIN;
        // Mantener HANDOFF evita que un "listo" seguido de una pregunta
        // reabra la conversación desde cero dentro de la misma ventana.
      }
      break;
    }

    // ── FIN ──────────────────────────────────────────────────────────────────
    case 'FIN': {
      if (esMensajeCortoContextual(texto) || !tieneIntencionReal(texto)) {
        respuesta = MSG.FIN;
        break;
      }
      if (pareceReferenciaProducto(texto)) {
        const reenganche = resolverReengancheFin(conv, texto);
        conv.estado = reenganche.estado;
        conv.producto_interes = reenganche.producto_interes;
        conv.modelo_pendiente = reenganche.modelo_pendiente;
        respuesta = reenganche.respuesta;
        break;
      }

      const siguiente = preguntaPendiente({
        optinAceptado: conv.optin_aceptado,
        nombre: conv.nombre,
        cedula: conv.cedula,
        departamento: conv.departamento,
        municipio: conv.municipio || conv.ciudad,
        tiendaAsignada: !!conv.tienda_id,
        leadCreado: conv.lead_creado,
        modalidad: conv.modalidad,
      });
      respuesta = siguiente || MSG.FIN;
      conv.ultima_pregunta = siguiente || undefined;
      if (siguiente) {
        conv.estado = conv.tienda_id
          ? 'DATOS_MIN'
          : (conv.departamento || conv.municipio ? 'CIUDAD_MODAL' : 'ESCUCHAR');
      }
      break;
    }
  }

  if (respuesta) {
    if (respuesta.includes('?')) conv.ultima_pregunta = respuesta;
    await sendFn(respuesta, botones);
    await guardarConv({ telefono: clienteId, contenido: respuesta, respondido_por: 'bot', canal }, sk);
    push('Sofia', respuesta);
  }
  await save();
}

// ── Handoff ───────────────────────────────────────────────────────────────────

async function hacerHandoff(conv: Conv, clienteId: string, sendFn: (m: string) => Promise<void>, env: Env, sk: string, canal: string) {
  if (!conv.tienda_telefono || !conv.tienda_contacto) {
    await sendFn(MSG.CIUDAD_PREGUNTA);
    conv.estado = 'CIUDAD';
    return;
  }
  // FIX v27, 22-jul-2026 — Bug 9 del paquete FIX_Sofia_v27: safety net.
  // Con el fix del Bug 2, DATOS_MIN nunca debería llamar hacerHandoff sin
  // conv.nombre. Si por alguna vía nueva llegamos aquí sin nombre, se
  // registra en logs para poder auditar el camino que se coló, y se sigue
  // usando "amigo" como fallback (perder el lead completo sería peor).
  if (!conv.nombre) {
    console.warn('[HANDOFF-WARN] conv.nombre vacío al hacer handoff', {
      clienteId, canal, estado: conv.estado, tienda: conv.tienda_id, cedula: !!conv.cedula
    });
  }
  const nombreCorto = (conv.nombre||'').split(' ')[0] || 'amigo';
  const nombreAsesor = conv.tienda_contacto.split(' ')[0];
  const tel = conv.tienda_telefono;
  const nombreComercial = conv.tienda_nombre_comercial || `Creditek ${conv.ciudad ?? 'tu ciudad'}`;
  const tiendaId = conv.tienda_id;
  if (!tiendaId) throw new Error('handoff sin destination_id');
  const destinoTipo = conv.tienda_tipo === 'aliado' ? 'aliado' : 'tienda';
  try {
    const reserva = await reservarHandoff(SUPABASE_URL, sk, {
      idempotencyKey: `advisor_handoff:${clienteId}`,
      destinationId: tiendaId,
      destinationType: destinoTipo,
      origin: canal,
    });
    if (!reserva.permitido) throw new Error('handoff_requires_manual_review');
    let metaResponseId: string | undefined;
    try {
      metaResponseId = reserva.evidencia.meta_response_id || await notificarAsesor(conv, { id: tiendaId, nombre: conv.tienda_nombre || '', contacto: conv.tienda_contacto, telefono: tel, ciudad: conv.ciudad || '' }, env);
      await confirmarHandoff(SUPABASE_URL, sk, reserva.evidencia.id, metaResponseId);
    } catch (error) {
      await marcarHandoffError(SUPABASE_URL, sk, reserva.evidencia.id, error instanceof Error ? error.message : 'meta_handoff_failed', fetch, metaResponseId);
      throw error;
    }
  } catch (error) {
    console.error('[HANDOFF-PENDING] notificación a asesor pendiente de recuperación');
    conv.estado = 'HANDOFF_PENDING';
    conv.lead_creado = false;
    const pendingMsg = MSG.HANDOFF_PENDING(nombreCorto);
    await sendFn(pendingMsg);
    await guardarConv({ telefono: clienteId, contenido: pendingMsg, respondido_por: 'bot', canal }, sk);
    return;
  }

  // La evidencia certificada ya existe; solo ahora se actualiza el embudo.
  await actualizarCliente(clienteId, { estado_funnel: 'transferido_asesor', tienda_id: conv.tienda_id, ciudad_normalizada: conv.ciudad, fecha_transferido_asesor: new Date().toISOString() }, sk);
  conv.lead_creado = true;
  conv.estado = 'HANDOFF';

  const msg = MSG.HANDOFF_MSG(nombreCorto, nombreAsesor, nombreComercial, tel);
  await sendFn(msg);
  await guardarConv({ telefono: clienteId, contenido: msg, respondido_por: 'bot', canal }, sk);

  if (!conv.tiendas_intentadas) conv.tiendas_intentadas = [];
  conv.tiendas_intentadas.push(conv.tienda_id||'');

}

// FIX 04-jul-2026: el asesor confirma con botones de WhatsApp (Quick Reply)
// en vez de contestar por su cuenta sin dejar rastro en el sistema.
async function manejarConfirmacionAsesor(msg: any, sk: string) {
  const telefonoAsesorRaw = msg.from as string;
  const telefonoAsesor = telefonoAsesorRaw.replace(/^57(?=\d{10}$)/, ''); // normalizar igual que en notificarAsesor()
  // FIX 04-jul-2026 (actualizado): la plantilla real en Meta no tiene un campo
  // de "payload" aparte — solo "Texto del botón". Por eso comparamos contra el
  // texto exacto que se sometió a aprobación, con fallback a msg.button.payload
  // por si Meta llega a mandar algo distinto ahí en el futuro.
  const claveBoton = (msg.button?.payload || msg.button?.text || '').trim();

  const mapaConfirmacion: Record<string, string> = {
    'Contacté al cliente': 'contactado',
    'No pude contactarlo': 'no_contactado',
    'Cerré la venta': 'venta_cerrada',
  };
  const estadoConfirmacion = mapaConfirmacion[claveBoton];
  if (!estadoConfirmacion) {
    console.warn('[ASESOR-BOTON] texto de botón no reconocido:', claveBoton);
    return;
  }

  try {
    // 1. ¿De qué tienda es este número?
    const rTienda = await fetch(
      `${SUPABASE_URL}/rest/v1/tiendas?telefono=eq.${encodeURIComponent(telefonoAsesor)}&select=id&limit=1`,
      { headers: { apikey: sk, Authorization: `Bearer ${sk}` } }
    );
    const tiendas = await rTienda.json() as any[];
    const tiendaId = tiendas[0]?.id;
    if (!tiendaId) { console.warn('[ASESOR-BOTON] no se encontró tienda para', telefonoAsesor); return; }

    // 2. Cliente más reciente de esa tienda, transferido y aún sin confirmar
    const rCliente = await fetch(
      `${SUPABASE_URL}/rest/v1/clientes?tienda_id=eq.${tiendaId}&estado_funnel=eq.transferido_asesor&confirmacion_asesor=is.null&order=fecha_estado_actualizado.desc&limit=1&select=telefono`,
      { headers: { apikey: sk, Authorization: `Bearer ${sk}` } }
    );
    const clientes = await rCliente.json() as any[];
    const clienteTelefono = clientes[0]?.telefono;
    if (!clienteTelefono) { console.warn('[ASESOR-BOTON] no hay cliente pendiente para tienda', tiendaId); return; }

    // 3. Guardar la confirmación real
    await actualizarCliente(clienteTelefono, { confirmacion_asesor: estadoConfirmacion }, sk);
    console.log('[ASESOR-BOTON] confirmado:', clienteTelefono, '->', estadoConfirmacion);
  } catch (e) {
    console.error('[ASESOR-BOTON-EXCEPTION]', e);
  }
}

async function notificarAsesor(conv: Conv, tienda: { id: string; nombre: string; contacto: string; telefono: string; ciudad: string }, env: Env): Promise<string> {
  const modalidadTexto = conv.modalidad === 'credito' ? 'a crédito' : conv.modalidad === 'contado' ? 'de contado' : 'modalidad por confirmar';
  const interes = conv.producto_interes ? `${conv.producto_interes} (${modalidadTexto})` : modalidadTexto;
  const celularLocal = conv.celular ? conv.celular.replace(/^57(?=\d{10}$)/, '') : null;
  // FIX v27.1, 22-jul-2026 — Bug 1: correo se agrega al resumen SOLO si
  // fue capturado (no ensucia el mensaje con "Correo: N/D" cuando no
  // aplica — es opcional por diseño del paquete).
  const partesResumen = [
    `Nombre: ${conv.nombre || 'Sin nombre'}`,
    `Ciudad: ${conv.ciudad || tienda.ciudad || 'N/D'}`,
    `Interés: ${interes}`,
    `Cédula: ${conv.cedula || 'N/D'}`,
    `Celular: ${celularLocal || 'N/D'}`,
  ];
  if (conv.correo) partesResumen.push(`Correo: ${conv.correo}`);
  const resumen = partesResumen.join(' | ');

  const digits = tienda.telefono.replace(/\D/g,'');
  const destino = digits.length === 10 ? '57'+digits : digits;
  const nombreAsesor = tienda.contacto.split(' ')[0];
  console.log('[HANDOFF-DEBUG] intentando enviar a:', destino, 'asesor:', tienda.contacto);
  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${env.PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: destino,
        type: 'template',
        template: {
          name: 'aviso_asesor_creditek',
          language: { code: 'es_CO' },
          components: [{
            type: 'body',
            parameters: [
              { type: 'text', text: nombreAsesor },
              { type: 'text', text: resumen },
            ],
          }],
        },
      }),
    });
    const resJson = await res.json() as { messages?: Array<{ id?: string }> };
    console.log('[HANDOFF] Meta status:', res.status, 'confirmed:', res.ok);
    if (!res.ok) throw new Error(`Meta handoff respondió ${res.status}`);
    const messageId = resJson.messages?.[0]?.id;
    if (!messageId) throw new Error('Meta handoff no devolvió messages[0].id');
    return messageId;
  } catch(e) {
    console.error('[HANDOFF] envío no confirmado');
    throw e;
  }
}

// SPEC v5-CRM, 13-jul-2026 — Pieza 2 (opción confirmada por Oscar: NO se toca
// el aviso inmediato de notificarAsesor()/manejarConfirmacionAsesor() de
// arriba, que sigue funcionando exactamente igual). Esto es un RECORDATORIO
// aparte, en 3 rondas fijas al día, SOLO para los asesores que nunca tocaron
// ninguno de los 3 botones del aviso inmediato (confirmacion_asesor sigue en
// null). Reutiliza la MISMA plantilla ya aprobada por Meta
// (aviso_asesor_creditek) — evita depender de una plantilla nueva pendiente
// de aprobación, que hubiera bloqueado esta pieza por horas o días.
async function enviarRecordatorioAsesor(tienda: { contacto: string; telefono: string }, resumen: string, env: Env): Promise<void> {
  const digits = tienda.telefono.replace(/\D/g, '');
  const destino = digits.length === 10 ? '57' + digits : digits;
  const nombreAsesor = tienda.contacto.split(' ')[0];
  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${env.PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: destino,
        type: 'template',
        template: {
          name: 'aviso_asesor_creditek',
          language: { code: 'es_CO' },
          components: [{
            type: 'body',
            parameters: [
              { type: 'text', text: nombreAsesor },
              { type: 'text', text: resumen },
            ],
          }],
        },
      }),
    });
    const resJson = await res.json();
    console.log('[RECORDATORIO-ASESOR] status:', res.status, 'para:', destino, 'respuesta:', JSON.stringify(resJson));
  } catch (e) { console.error('[RECORDATORIO-ASESOR-EXCEPTION]', e); }
}

// Regla de negocio (SPEC v5-CRM): cada handoff se recuerda una sola vez, con
// un colchón de 2h desde el handoff antes del primer recordatorio (para no
// molestar a un asesor que apenas recibió el aviso inmediato). Esta misma
// regla, aplicada igual en las 3 rondas, ya cumple sola las 3 franjas de la
// tabla del SPEC (1pm cubre handoffs de antes de 11am, 5pm cubre antes de
// 3pm, 9am del día hábil siguiente cubre lo que quedó pendiente de la tarde
// anterior) sin necesitar una franja horaria distinta hardcodeada por ronda
// — y como el cron de las 9am solo corre lunes a viernes (ver wrangler.toml),
// lo del viernes en la tarde se acumula solo hasta el lunes, tal como pide
// el documento.
async function recordatorioAsesores(env: Env, ronda: string): Promise<void> {
  const sk = env.SUPABASE_SERVICE_KEY;
  const corte = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/clientes?estado_funnel=eq.transferido_asesor&confirmacion_asesor=is.null&recordatorio_asesor_enviado_en=is.null&fecha_transferido_asesor=lte.${corte}&select=telefono,nombre,tienda_id,ciudad,producto_interes,cedula,telefono_contacto`,
      { headers: { apikey: sk, Authorization: `Bearer ${sk}` } }
    );
    if (!r.ok) { console.error('[RECORDATORIO-ASESOR] error consultando clientes:', r.status, await r.text()); return; }
    const clientes = await r.json() as any[];
    if (!clientes.length) { console.log(`[RECORDATORIO-ASESOR] ${ronda}: nada pendiente`); return; }

    const tiendaIds = [...new Set(clientes.map((c: any) => c.tienda_id).filter(Boolean))];
    if (!tiendaIds.length) { console.warn(`[RECORDATORIO-ASESOR] ${ronda}: clientes pendientes sin tienda_id`); return; }
    const rt = await fetch(
      `${SUPABASE_URL}/rest/v1/tiendas?id=in.(${tiendaIds.join(',')})&select=id,contacto,telefono`,
      { headers: { apikey: sk, Authorization: `Bearer ${sk}` } }
    );
    if (!rt.ok) { console.error('[RECORDATORIO-ASESOR] error consultando tiendas:', rt.status, await rt.text()); return; }
    const tiendas = await rt.json() as any[];
    const tiendaMap: Record<string, { contacto: string; telefono: string }> = {};
    tiendas.forEach((t: any) => { tiendaMap[t.id] = { contacto: t.contacto, telefono: t.telefono }; });

    let enviados = 0;
    for (const c of clientes) {
      const tienda = tiendaMap[c.tienda_id];
      if (!tienda?.telefono || !tienda?.contacto) { console.warn('[RECORDATORIO-ASESOR] sin tienda/telefono para', c.telefono); continue; }
      const resumen = [
        'Recordatorio — ¿cómo va este cliente?',
        `Nombre: ${c.nombre || 'Sin nombre'}`,
        `Ciudad: ${c.ciudad || 'N/D'}`,
        `Interés: ${c.producto_interes || 'N/D'}`,
        `Cédula: ${c.cedula || 'N/D'}`,
        `Celular: ${c.telefono_contacto || 'N/D'}`,
      ].join(' | ');
      await enviarRecordatorioAsesor(tienda, resumen, env);
      await actualizarCliente(c.telefono, { recordatorio_asesor_enviado_en: new Date().toISOString() }, sk);
      enviados++;
    }
    console.log(`[RECORDATORIO-ASESOR] ${ronda}: ${enviados} recordatorio(s) enviados`);
  } catch (e) {
    console.error('[RECORDATORIO-ASESOR-EXCEPTION]', e);
  }
}

// FIX v25, 16-jul-2026 — Hallazgo 8 (evidencia real: 7 de 16 leads del día,
// 44%, recibieron el opt-in y nunca respondieron — nadie los recontactó, los
// 6 mensajes de recuperación de ese día los mandó Oscar a mano desde el
// Panel). Nota honesta sobre la causa raíz original del documento: SÍ existe
// un mensaje de reenganche a leads (enviarReenganche(), dentro de
// marcarLeadsPerdidos) — pero corre a los 5 DÍAS de inactividad (limite =
// 5*24h), no a los 60-240 minutos que pide este hallazgo. No es que "no
// envía nada", es que llega demasiado tarde para leads del mismo día. No se
// toca marcarLeadsPerdidos — esta es una pieza nueva y aparte, con su propio
// campo de control (recordatorio_enviado_at) para no pisarse con ese cron.
// Variantes fijas, sin llamada a Claude — costo cero y tono controlado.
const VARIANTES_SEGUIMIENTO_LEAD = [
  '¿Sigues por ahí? 😊 Quedé pendiente de ayudarte con tu celular nuevo',
  'Hola, ¿aún te interesa? Te ayudo a encontrar tu equipo en un momentico 😊',
  '¡Hola de nuevo! Cualquier cosa que necesites para tu celular nuevo, aquí estoy 😊',
];

async function seguimientoLeadsMudos(env: Env): Promise<void> {
  const sk = env.SUPABASE_SERVICE_KEY;
  const estadosPendientes = ESTADOS_PENDIENTES.join(',');

  // Ventana Colombia 8am-8pm (mismo cálculo de offset ya usado en
  // estaEnHorario(), claude.ts, pero con el rango 8-20 que pide este
  // hallazgo específico — no reutiliza esa función porque su rango (8-19,
  // sin domingos) es distinto y no aplica igual aquí).
  const ahora = new Date();
  const colombiaOffset = -5 * 60;
  const utcMinutes = ahora.getUTCHours() * 60 + ahora.getUTCMinutes();
  const colombiaMinutes = (utcMinutes + colombiaOffset + 1440) % 1440;
  const horaColombia = Math.floor(colombiaMinutes / 60);
  if (horaColombia < 8 || horaColombia >= 20) {
    console.log('[SEGUIMIENTO-LEAD] fuera de horario Colombia (8am-8pm), no se envía nada');
    return;
  }

  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/clientes?estado_funnel=in.(${estadosPendientes})&optin_datos=eq.true&recordatorio_enviado_at=is.null&select=telefono,nombre`,
      { headers: { apikey: sk, Authorization: `Bearer ${sk}` } }
    );
    if (!r.ok) { console.error('[SEGUIMIENTO-LEAD] error consultando clientes:', r.status, await r.text()); return; }
    const candidatos = await r.json() as any[];
    if (!candidatos.length) { console.log('[SEGUIMIENTO-LEAD] sin candidatos'); return; }

    const ahoraMs = Date.now();
    let enviados = 0;
    for (const c of candidatos) {
      // Último mensaje real de la conversación — debe ser del bot (el
      // cliente no volvió a escribir después) y tener entre 60 y 240 min.
      const rc = await fetch(
        `${SUPABASE_URL}/rest/v1/conversaciones?telefono=eq.${encodeURIComponent(c.telefono)}&order=timestamp.desc&limit=1&select=respondido_por,timestamp`,
        { headers: { apikey: sk, Authorization: `Bearer ${sk}` } }
      );
      if (!rc.ok) { console.error('[SEGUIMIENTO-LEAD] error consultando conversaciones de', c.telefono, rc.status); continue; }
      const ultimos = await rc.json() as any[];
      const ultimo = ultimos[0];
      if (!ultimo || ultimo.respondido_por !== 'bot') continue;
      const antiguedadMin = (ahoraMs - new Date(ultimo.timestamp).getTime()) / 60000;
      if (antiguedadMin < 60 || antiguedadMin > 240) continue;

      const variante = VARIANTES_SEGUIMIENTO_LEAD[Math.floor(Math.random() * VARIANTES_SEGUIMIENTO_LEAD.length)];
      await enviarMensajeWA(c.telefono, variante, env.PHONE_NUMBER_ID, env.WHATSAPP_TOKEN);
      await guardarConv({ telefono: c.telefono, contenido: variante, respondido_por: 'bot', canal: 'whatsapp' }, sk);
      // Máximo 1 recordatorio automático por lead — nunca se repite.
      await actualizarCliente(c.telefono, { recordatorio_enviado_at: new Date().toISOString() }, sk);
      enviados++;
    }
    console.log(`[SEGUIMIENTO-LEAD] enviados: ${enviados} de ${candidatos.length} candidatos`);
  } catch (e) {
    console.error('[SEGUIMIENTO-LEAD-EXCEPTION]', e);
  }
}

// ── Supabase ──────────────────────────────────────────────────────────────────

async function buscarCliente(telefono: string, key: string) {
  try {
    // FIX v20, 13-jul-2026: se agrega fuente/canal_origen al select — antes
    // procesarMensaje() no tenía forma de recuperar la atribución real de un
    // cliente ya existente al resetear su conversación (por timeout o por un
    // Durable Object nuevo), así que siempre recalculaba con determinarFuente()
    // usando solo la señal del mensaje actual, perdiendo el origen histórico.
    const r = await fetch(`${SUPABASE_URL}/rest/v1/clientes?telefono=eq.${encodeURIComponent(telefono)}&select=nombre,optin_datos,celular,fuente,canal_origen&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) { console.error('[SUPABASE-ERROR] buscarCliente falló:', r.status, await r.text()); return null; }
    const d = await r.json() as any[];
    return d[0] ?? null;
  } catch (e) { console.error('[SUPABASE-EXCEPTION] buscarCliente:', e); return null; }
}

async function buscarTiendaQR(refQr: string, key: string) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/tiendas?ref_qr=eq.${encodeURIComponent(refQr)}&select=id,nombre,nombre_comercial,genero,ciudad,contacto,telefono,tipo&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) { console.error('[SUPABASE-ERROR] buscarTiendaQR falló:', r.status, await r.text()); return null; }
    const d = await r.json() as any[];
    return d[0] ?? null;
  } catch (e) { console.error('[SUPABASE-EXCEPTION] buscarTiendaQR:', e); return null; }
}

// FIX v1, 04-jul-2026: nunca tratar el telefono de una tienda propia como
// cliente nuevo — evita que una respuesta automatica de un aliado
// (WhatsApp Business auto-reply) dispare todo el flujo de ventas de Sofia.
// PAQUETE 3, v26 20-jul-2026: reemplaza a la antigua esNumeroDeTienda()
// (que solo devolvía true/false) — ahora se necesita también nombre_comercial,
// contacto e id de la tienda para armar el mensaje con el link de registro.
// Mismo patrón de cache de 10 min, ahora guardando el registro completo por
// teléfono en vez de solo el Set de teléfonos.
type TiendaPorTelefono = { id: string; nombre_comercial: string | null; contacto: string | null; ref_qr: string | null };
let _tiendaPorTelefonoCache: { valores: Map<string, TiendaPorTelefono>; expira: number } | null = null;

async function buscarTiendaPorTelefono(telefono: string, key: string): Promise<TiendaPorTelefono | null> {
  const limpio = telefono.replace(/^57/, '');
  const ahora = Date.now();
  if (!_tiendaPorTelefonoCache || _tiendaPorTelefonoCache.expira <= ahora) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/tiendas?activa=eq.true&select=id,telefono,nombre_comercial,contacto,ref_qr,tipo`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
      if (r.ok) {
        const data = await r.json() as any[];
        const valores = new Map<string, TiendaPorTelefono>();
        for (const t of data) {
          if (t.telefono) valores.set(t.telefono, { id: t.id, nombre_comercial: t.nombre_comercial, contacto: t.contacto, ref_qr: t.ref_qr });
        }
        _tiendaPorTelefonoCache = { valores, expira: ahora + 10 * 60 * 1000 };
      }
    } catch { /* si falla, se sigue con la cache anterior si existe */ }
  }
  return _tiendaPorTelefonoCache?.valores.get(limpio) ?? null;
}

// FIX 04-jul-2026: ciudades aliadas dinamicas, ya no hardcodeadas en claude.ts.
let _ciudadesCache: { valor: string; expira: number } | null = null;

function formatearListaCiudades(ciudades: string[]): string {
  if (ciudades.length <= 1) return ciudades[0] || '';
  return ciudades.slice(0, -1).join(', ') + ' y ' + ciudades[ciudades.length - 1];
}

async function obtenerCiudadesCubiertas(key: string): Promise<string> {
  const ahora = Date.now();
  if (_ciudadesCache && _ciudadesCache.expira > ahora) return _ciudadesCache.valor;
  const FALLBACK = 'Tolú, Corozal, Chinú, Ciénaga de Oro y Coveñas';
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/tiendas?activa=eq.true&select=ciudad`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) return _ciudadesCache?.valor || FALLBACK;
    const data = await r.json() as any[];
    const unicas = Array.from(new Set(data.map((t: any) => t.ciudad).filter(Boolean))) as string[];
    const texto = unicas.length ? formatearListaCiudades(unicas) : FALLBACK;
    _ciudadesCache = { valor: texto, expira: ahora + 10 * 60 * 1000 };
    return texto;
  } catch {
    return _ciudadesCache?.valor || FALLBACK;
  }
}

async function buscarTiendaRandom(ciudad: string, excluir: string[], key: string) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/tiendas?activa=eq.true&select=id,nombre,nombre_comercial,genero,ciudad,contacto,telefono,tipo`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) { console.error('[SUPABASE-ERROR] buscarTiendaRandom falló:', r.status, await r.text()); return null; }
    const data = await r.json() as any[];
    // FIX 04-jul-2026: antes de comparar directo, revisar ciudad_alias y,
    // si no hay alias registrado, intentar con tolerancia a errores de tecleo.
    // Si ciudad viene vacia (el fallback "cualquier tienda" de hoy), se deja igual.
    let cn = norm(ciudad);
    if (cn) {
      const aliasEncontrado = await buscarCiudadAlias(cn, key);
      if (aliasEncontrado) {
        cn = norm(aliasEncontrado);
      } else {
        const parecida = ciudadMasParecida(ciudad);
        if (parecida) cn = norm(parecida);
      }
    }
    const matches = data.filter((t: any) => {
      if (!t.ciudad || !t.telefono) return false;
      if (excluir.includes(t.id)) return false;
      const ciu = norm(t.ciudad);
      return ciu.includes(cn) || cn.includes(ciu.split('/')[0].trim());
    });
    if (!matches.length) return null;
    if (matches.length === 1) return matches[0];

    // FIX 03-jul-2026: antes elegía al azar entre varias tiendas de la misma ciudad
    // (Corozal, Chinú, Ciénaga de Oro tienen más de una). Ahora reparte parejo,
    // eligiendo la que tenga MENOS clientes ya asignados (clientes.tienda_id).
    const ids = matches.map((t: any) => t.id);
    const rc = await fetch(`${SUPABASE_URL}/rest/v1/clientes?tienda_id=in.(${ids.join(',')})&select=tienda_id`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    const conteos: Record<string, number> = {};
    if (rc.ok) {
      const asignados = await rc.json() as any[];
      for (const a of asignados) conteos[a.tienda_id] = (conteos[a.tienda_id] || 0) + 1;
    }
    matches.sort((a: any, b: any) => (conteos[a.id]||0) - (conteos[b.id]||0));
    return matches[0];
  } catch (e) { console.error('[SUPABASE-EXCEPTION] buscarTiendaRandom:', e); return null; }
}

async function upsertCliente(data: Record<string,any>, key: string) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/clientes?on_conflict=telefono`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(data) });
    if (!r.ok) console.error('[SUPABASE-ERROR] upsertCliente falló:', r.status, await r.text(), 'payload:', JSON.stringify(data));
  } catch (e) {
    console.error('[SUPABASE-EXCEPTION] upsertCliente:', e, 'payload:', JSON.stringify(data));
  }
}

async function registrarConsentimientoWhatsapp(data: {
  telefono: string;
  decision: 'granted' | 'denied';
  responseText: string;
  sourceMessageId: string | null;
  consentAt: string;
  policyVersion: string;
}, key: string) {
  const payload = {
    telefono: data.telefono,
    purpose: 'comercial_whatsapp',
    decision: data.decision,
    policy_version: data.policyVersion,
    prompt_text: MSG.OPTIN_MARKETING,
    response_text: data.responseText.trim().slice(0, 240),
    channel: 'whatsapp',
    source_message_id: data.sourceMessageId,
    occurred_at: data.consentAt,
    created_at: data.consentAt,
  };
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/sofia_consent_events`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(payload),
    });
    if (!r.ok && r.status !== 409) console.error('[SUPABASE-ERROR] registrarConsentimientoWhatsapp falló:', r.status, await r.text());
  } catch (e) {
    console.error('[SUPABASE-EXCEPTION] registrarConsentimientoWhatsapp:', e);
  }
}

async function actualizarCliente(telefono: string, data: Record<string,any>, key: string) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/clientes?telefono=eq.${encodeURIComponent(telefono)}`, { method: 'PATCH', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(data) });
    if (!r.ok) console.error('[SUPABASE-ERROR] actualizarCliente falló:', r.status, await r.text(), 'telefono:', telefono, 'payload:', JSON.stringify(data));
  } catch (e) {
    console.error('[SUPABASE-EXCEPTION] actualizarCliente:', e, 'telefono:', telefono);
  }
}

// ── Fase 2 CRM (Fix 4, 03-jul-2026): auto-marcar leads estancados como perdidos ──
// FIX v1, 04-jul-2026: antes de marcar "perdido", se guarda quienes son
// (telefono/nombre/producto) para poder mandarles el recordatorio de
// reenganche despues. Tambien se limpia su estado viejo en KV, para que
// si responden, arranquen limpio en vez de seguir a mitad de una
// conversacion de hace 5+ dias.
async function marcarLeadsPerdidos(env: Env) {
  const key = env.SUPABASE_SERVICE_KEY;
  const estadosPendientes = ESTADOS_PENDIENTES.join(',');
  try {
    const limite = new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString();

    const rSel = await fetch(
      `${SUPABASE_URL}/rest/v1/clientes?estado_funnel=in.(${estadosPendientes})&fecha_estado_actualizado=lt.${limite}&or=(ciudad_original.is.null,tienda_id.not.is.null)&select=telefono,nombre,producto_interes,ciudad_original,tienda_id`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    if (!rSel.ok) { console.error('[SUPABASE-ERROR] marcarLeadsPerdidos (select) falló:', rSel.status, await rSel.text()); return; }
    const perdidos = await rSel.json() as any[];

    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/clientes?estado_funnel=in.(${estadosPendientes})&fecha_estado_actualizado=lt.${limite}`,
      {
        method: 'PATCH',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ estado_funnel: 'perdido', razon_perdida: 'no_respondio' }),
      }
    );
    if (!r.ok) { console.error('[SUPABASE-ERROR] marcarLeadsPerdidos falló:', r.status, await r.text()); return; }

    for (const c of perdidos) {
      // Defensa adicional: una ciudad sin tienda asignada significa que el
      // cliente ya fue descartado por cobertura; no enviarle reenganche.
      if (c.ciudad_original && !c.tienda_id) continue;
      await enviarReenganche(c, env);
    }
    console.log('[REENGANCHE] procesados:', perdidos.length);
  } catch (e) { console.error('[SUPABASE-EXCEPTION] marcarLeadsPerdidos:', e); }
}

// FIX v1, 04-jul-2026: manda la plantilla de reenganche y limpia el KV.
async function enviarReenganche(cliente: { telefono: string; nombre?: string }, env: Env) {
  const nombreCorto = (cliente.nombre || '').split(' ')[0] || 'Hola';
  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${env.PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: cliente.telefono,
        type: 'template',
        template: {
          name: 'reenganche_creditek',
          language: { code: 'es_CO' },
          components: [{ type: 'body', parameters: [{ type: 'text', text: nombreCorto }] }],
        },
      }),
    });
    const resJson = await res.json();
    console.log('[REENGANCHE-DEBUG]', cliente.telefono, res.status, JSON.stringify(resJson));
    // Limpiar el estado viejo solo si el mensaje SÍ se entregó - si responde, arranca limpio.
    // Si Meta no ha aprobado la plantilla (u otro error), se conserva el estado
    // para no perder el historial de nadie por un envío que nunca llegó.
    if (res.ok) {
      await env.CONVERSATIONS.delete(cliente.telefono);
    } else {
      console.warn('[REENGANCHE] no se pudo enviar, se conserva el estado:', cliente.telefono);
    }
  } catch (e) { console.error('[REENGANCHE-EXCEPTION]', cliente.telefono, e); }
}

// ── Pipeline granular (Fix 2, 03-jul-2026) ─────────────────────────────────────
// Orden del embudo — se usa para nunca retroceder un estado ya alcanzado.
// 'perdido' es especial: se puede llegar desde cualquier punto (se usa en Fase 2).
const ORDEN_FUNNEL: Record<string, number> = {
  'nuevo': 0,
  'contactado': 1,
  'ciudad_identificada': 2,
  'lead_caliente': 3,
  'transferido_asesor': 4,
};

// FIX v1, 04-jul-2026: mapa de que columna de fecha llenar segun el estado
// nuevo - permite medir despues cuanto tiempo pasa un cliente en cada etapa.
const FECHA_COLUMNA: Record<string, string> = {
  contactado: 'fecha_contactado',
  ciudad_identificada: 'fecha_ciudad_identificada',
  lead_caliente: 'fecha_lead_caliente',
  transferido_asesor: 'fecha_transferido_asesor',
};

async function avanzarEstadoFunnel(telefono: string, nuevoEstado: string, key: string) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/clientes?telefono=eq.${encodeURIComponent(telefono)}&select=estado_funnel`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) return;
    const d = await r.json() as any[];
    const actual = d[0]?.estado_funnel || 'nuevo';
    const rangoActual = ORDEN_FUNNEL[actual] ?? 0;
    const rangoNuevo = ORDEN_FUNNEL[nuevoEstado] ?? 0;
    if (nuevoEstado === 'perdido' || rangoNuevo > rangoActual) {
      const payload: Record<string, any> = { estado_funnel: nuevoEstado };
      const columnaFecha = FECHA_COLUMNA[nuevoEstado];
      if (columnaFecha) payload[columnaFecha] = new Date().toISOString();
      await actualizarCliente(telefono, payload, key);
    }
  } catch (e) { console.error('[SUPABASE-EXCEPTION] avanzarEstadoFunnel:', e); }
}

// Guarda tienda_id/ciudad apenas se detectan (antes solo se guardaba en
// CIUDAD_MODAL, CIUDAD o el handoff — se perdía la señal si el cliente
// abandonaba antes de llegar ahí) y avanza el pipeline a 'ciudad_identificada'.
async function registrarTiendaAsignada(telefono: string, tienda: { id: string; ciudad: string }, key: string) {
  await actualizarCliente(telefono, { tienda_id: tienda.id, ciudad_normalizada: tienda.ciudad, ciudad: tienda.ciudad }, key);
  await avanzarEstadoFunnel(telefono, 'ciudad_identificada', key);
}

async function guardarConv(data: { telefono: string; contenido: string; respondido_por: string | null; canal: string }, key: string) {
  const direccion = data.respondido_por === null ? 'entrada' : 'salida';
  const payload = { telefono: data.telefono, tipo_mensaje: 'text', contenido: data.contenido, respondido_por: data.respondido_por, direccion, canal: data.canal, timestamp: new Date().toISOString() };
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/conversaciones`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(payload) });
    if (!r.ok) console.error('[SUPABASE-ERROR] guardarConv falló:', r.status, await r.text(), 'payload:', JSON.stringify(payload));
  } catch (e) {
    console.error('[SUPABASE-EXCEPTION] guardarConv:', e, 'payload:', JSON.stringify(payload));
  }
}

// ── Durable Object (FIX 6, 03-jul-2026) ────────────────────────────────────────
// Una instancia por cliente (idFromName usa el teléfono/PSID como clave).
// Cloudflare garantiza que cada instancia procesa un request a la vez, en
// orden — esto es lo que elimina la condición de carrera. procesarMensaje()
// no cambia en nada; esta clase solo reconstruye sendFn y la llama.
//
// FIX v27.2, 22-jul-2026 — Bug 6 (Opción A) del reporte de anoche:
//   El estado de conversación vive en KV (env.CONVERSATIONS), NO en el
//   storage del DO. KV es eventualmente consistente y sus writes no
//   disparan el input gate automático del DO. Sin protección extra, si dos
//   mensajes del mismo cliente llegan casi-simultáneos, el DO podía
//   empezar a procesar el segundo durante los awaits externos del primero
//   (KV/Supabase/WhatsApp), leer estado stale y generar respuestas
//   contradictorias (evidencia: 21-jul 22:04, caso Ever Guzman).
//
//   blockConcurrencyWhile mantiene el input gate cerrado durante TODO el
//   procesamiento — el DO no acepta un segundo fetch hasta que el actual
//   termine por completo (incluidos todos los awaits). Reduce la ventana
//   de race de "todo el procesamiento" (segundos) a "los ms de
//   propagación de KV entre put y get" — no cero, pero suficiente para
//   observar si el bug se elimina en la práctica.
//
//   Limitación conocida (documentada en outputs/REPORTE_Bug6_race_condition.md):
//   la Opción B — migrar el estado a ctx.storage del propio DO —
//   sigue pendiente si esta mitigación no elimina el problema. Se
//   observa vía auditoría Supabase de pares Sofía-Sofía en <2s con
//   contenido contradictorio.
//
//   Nota adicional: el cron de reenganche (línea ~1969) hace
//   env.CONVERSATIONS.delete(cliente.telefono) fuera del DO. Ese path
//   NO se cubre con blockConcurrencyWhile — solo lo resolvería Opción B.
export class ConversacionDO {
  private state: DurableObjectState;
  private env: Env;
  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const body = await request.json() as {
      clienteId: string; texto: string; canal: string;
      refQr: string | null; referral: any; pageId?: string;
      auditoriaEvento?: AuditoriaEventoMeta | null;
    };

    // FIX v21, 13-jul-2026: sendFn ahora acepta botones opcionales — en
    // WhatsApp, si vienen botones se manda como Interactive Message
    // (enviarBotonesWA), si no, como texto simple igual que antes. Facebook
    // Messenger no usa este mecanismo (fuera de alcance del fix), así que el
    // wrapper de Facebook simplemente ignora el parámetro.
    const sendFn = body.canal === 'whatsapp'
      ? (m: string, botones?: { id: string; title: string }[]) => botones && botones.length
          ? enviarBotonesWA(body.clienteId, m, botones, this.env.PHONE_NUMBER_ID, this.env.WHATSAPP_TOKEN)
          : enviarMensajeWA(body.clienteId, m, this.env.PHONE_NUMBER_ID, this.env.WHATSAPP_TOKEN)
      : async (m: string) => {
          const senderId = body.clienteId.replace(/^fb_/, '');
          try {
            await enviarMensajeFB(senderId, m, body.pageId!, this.env.META_PAGE_ACCESS_TOKEN || this.env.META_ACCESS_TOKEN);
          } catch (e) { /* mismo comportamiento silencioso que antes */ }
        };

    // Todo el procesamiento (leer KV → mutar estado → escribir KV → enviar WhatsApp)
    // queda dentro del bloque — mientras esté vigente, ningún otro fetch al
    // mismo DO empieza. El bloque se libera cuando procesarMensaje resuelve.
    await this.state.blockConcurrencyWhile(async () => {
      const auditoria = body.auditoriaEvento || null;
      if (auditoria) {
        const permitido = await reservarEventoEnDurable(this.state.storage, auditoria);
        if (!permitido) {
          await actualizarAuditoriaEvento(
            this.env.CONVERSATIONS,
            auditoria,
            'bloqueado_idempotencia',
            'ID de Meta ya reservado en almacenamiento durable',
          );
          return;
        }
        await actualizarAuditoriaEvento(this.env.CONVERSATIONS, auditoria, 'procesando', 'procesamiento iniciado en Durable Object');
      }

      try {
        await procesarMensaje(
          body.clienteId, body.texto, body.canal, body.refQr, body.referral,
          sendFn, this.env, this.env.SUPABASE_SERVICE_KEY, auditoria?.metaId || null
        );
        if (auditoria) {
          await finalizarEventoEnDurable(this.state.storage, auditoria, 'respondido', 'procesamiento finalizado');
          await actualizarAuditoriaEvento(this.env.CONVERSATIONS, auditoria, 'respondido', 'procesamiento finalizado');
        }
      } catch (error) {
        if (auditoria) {
          await finalizarEventoEnDurable(this.state.storage, auditoria, 'error_envio', 'fallo durante procesamiento o envío; no reprocesar automáticamente');
          await actualizarAuditoriaEvento(this.env.CONVERSATIONS, auditoria, 'error_envio', 'fallo durante procesamiento o envío; no reprocesar automáticamente');
        }
        throw error;
      }
    });
    return new Response('OK');
  }
}
