export const VIDEO_DURATION_SECONDS = 8;
export const VEO_FAST_USD_PER_SECOND = 0.08;
export const COP_REFERENCE_RATE = 3126.08;
export const MAX_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024;

export const VIDEO_MOTIONS = Object.freeze({
  rotate: 'Rotación suave del producto',
  zoom: 'Acercamiento cinematográfico',
  slide: 'Desplazamiento lateral',
  dynamic: 'Movimiento dinámico moderado',
});

const MOTION_PROMPTS = Object.freeze({
  rotate: 'Use a subtle product orbit with a stable camera and no abrupt cuts.',
  zoom: 'Use a slow cinematic push-in toward the main product with stable framing.',
  slide: 'Use a restrained lateral camera slide while keeping the complete design inside frame.',
  dynamic: 'Use smooth, modern commercial camera movement with restrained parallax and no abrupt cuts.',
});

export function estimateVideoCost({
  duration = VIDEO_DURATION_SECONDS,
  usdPerSecond = VEO_FAST_USD_PER_SECOND,
  copRate = COP_REFERENCE_RATE,
} = {}) {
  const usd = Number((duration * usdPerSecond).toFixed(2));
  const cop = Math.round((usd * copRate) / 100) * 100;
  return { usd, cop };
}

export function validateSourceImage(file) {
  if (!file) return 'Selecciona una imagen aprobada.';
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    return 'La imagen debe ser PNG, JPG o WebP.';
  }
  if (file.size <= 0 || file.size > MAX_SOURCE_IMAGE_BYTES) {
    return 'La imagen debe pesar máximo 20 MB.';
  }
  return '';
}

export function buildVideoPrompt({ product = '', city = '', motion = 'dynamic' } = {}) {
  const cleanProduct = String(product).trim() || 'the featured product';
  const cleanCity = String(city).trim();
  const movement = MOTION_PROMPTS[motion] || MOTION_PROMPTS.dynamic;
  return `Animate the supplied, already-approved advertising artwork as an 8-second vertical 9:16 social video.
Featured product: ${cleanProduct}.
${cleanCity ? `Market/location context: ${cleanCity}.` : ''}
${movement}
The supplied image is the single source of truth. Preserve the product identity, colors, composition, logo, prices, spelling, typography and every visible word exactly as supplied. Do not add, remove, rewrite, translate or hallucinate text, prices, logos, people, hands, products or financing conditions. Keep all existing text and branding legible and inside the safe area. Use only subtle depth, lighting and camera motion. End on a stable frame that closely matches the supplied artwork.`;
}

export function canApproveVideo(status) {
  return status === 'pendiente_aprobacion';
}

export function canDownloadVideo(status) {
  return status === 'aprobado';
}
