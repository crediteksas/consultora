// campaign-view.js
import html from "./d5eac22d2e690ddd73cb2a154e52cd1d9981bc94-f16d4577704ffc1765f2b8ddce7a80a5aa088c79-agente3-meta-ads.html";
import thumbnails from "./5f53f1b4b4cbaf2cd68ec34382764f0a783ffe64-5f53f1b4b4cbaf2cd68ec34382764f0a783ffe64-campaign-thumbnails.js";
var campaign_view_default = { fetch(request) {
  const path = new URL(request.url).pathname;
  if (path === "/creditek/agentes/campaign-thumbnails.js" && ["GET", "HEAD"].includes(request.method)) return new Response(request.method === "HEAD" ? null : thumbnails, { headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  if (!/^\/creditek\/agentes\/agente3-meta-ads(?:\.html|\/)?$/.test(path)) return new Response("Not found", { status: 404 });
  if (!["GET", "HEAD"].includes(request.method)) return new Response("Method not allowed", { status: 405 });
  return new Response(request.method === "HEAD" ? null : html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "x-aura-campaign-identification": "20260910" } });
} };
export {
  campaign_view_default as default
};
//# sourceMappingURL=campaign-view.js.map
