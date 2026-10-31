// Presentation boundary: leave scripts, forms, URLs and business content byte-identical.
export const LIQUID_MARKER = 'data-creditek-visual="liquid-1"';
export const STATIC_LIQUID_LINK = '<link rel="stylesheet" href="/design-system/components/creditek-liquid.css?v=1.0.0" media="screen">';
export const LIQUID_LINK = '<link rel="stylesheet" href="/creditek/agentes/creditek-liquid.css?v=1.0.0" media="screen" data-creditek-liquid-style>';
function protectedParts(html) {
  // Treat raw script/style bodies as opaque. If a start has no matching end,
  // preserve the original response rather than guessing at a markup boundary.
  const starts=/<(script|style)\b[^>]*>/gi,parts=[];let cursor=0,start;
  while((start=starts.exec(html))){
    const markup=html.slice(cursor,start.index);
    if(/<\/(?:script|style)\s*>/i.test(markup))return null;
    parts.push(markup);
    const ends=new RegExp('</'+start[1]+'\\s*>','gi');ends.lastIndex=starts.lastIndex;
    const end=ends.exec(html);if(!end)return null;
    parts.push(html.slice(start.index,ends.lastIndex));cursor=ends.lastIndex;starts.lastIndex=cursor;
  }
  const tail=html.slice(cursor);if(/<\/(?:script|style)\s*>/i.test(tail))return null;
  parts.push(tail);return parts;
}
export function applyLiquidHtml(html) {
  if (typeof html !== 'string' || html.includes(LIQUID_MARKER) || html.includes('data-creditek-liquid-style')) return null;
  // Insertion only; no parsing or replacement of application content.
  const parts = protectedParts(html);if(!parts)return null;
  const markup=parts.filter((_,index)=>index%2===0).join('');
  // Ambiguous structural text in comments/quoted values is outside the pinned
  // template contract. Do not mistake it for the document's real head/root.
  for(const comment of markup.match(/<!--[\s\S]*?-->/g)||[])if(/<html\b|<\/?head\b/i.test(comment))return null;
  if(/(["'])[^"'<>]*(?:<html\b|<\/?head\b)/i.test(markup))return null;
  if ((markup.match(/<html\b/gi) || []).length !== 1 || (markup.match(/<\/head\s*>/gi) || []).length !== 1) return null;
  const heads=[...markup.matchAll(/<head\b[^>]*>/gi)];
  if(heads.length!==1||heads[0].index<markup.search(/<html\b/i)||heads[0].index>=markup.search(/<\/head\s*>/i))return null;
  // Branding is intentionally finite: reject an unknown tag shape instead of
  // partially applying the theme while silently keeping a wrong product name.
  for(const tag of markup.match(/<[^>]*\bdata-kora-brand\b[^>]*>/gi)||[]){
    if(/\bdata-product-name\s*=\s*(["'])AURA\1/.test(tag))continue;
    if(!['<div data-kora-brand data-variant="public">','<div data-kora-brand data-variant="compact-inverse">'].includes(tag))return null;
  }
  return parts.map((part, index) => index % 2 ? part : part
    .replaceAll('<div data-kora-brand data-variant="public">', '<div data-kora-brand data-variant="public" data-product-name="AURA">')
    .replaceAll('<div data-kora-brand data-variant="compact-inverse">', '<div data-kora-brand data-variant="compact-inverse" data-product-name="AURA">')
    .replace(/<html\b/i, match => match + ' ' + LIQUID_MARKER)
    .replace(/<\/head\s*>/i, match => LIQUID_LINK + '\n' + match)).join('');
}
export function isAuraPresentationPath(path) {
  return path === '/creditek/agentes/' || /^\/creditek\/agentes\/(?:index|creditek-agente-redes|creditek-agente-respuestas|agente3-meta-ads|creditek-agente-calendario|creditek-gbp-fichas|aura-finanzas|creditek-estudio-video|nova-supervision|sofia-calidad)(?:\.html)?$/.test(path);
}
