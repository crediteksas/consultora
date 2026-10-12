// <stdin>
import html from "./527fe3905d59ddbb466515b01e9c9bead58488da-current-index.html";

// aura-shell-pwa.mjs
async function serveAuraShell(request, html2, { fetcher = fetch } = {}) {
  const url = new URL(request.url);
  if (!["/creditek/agentes/", "/creditek/agentes/index.html"].includes(url.pathname)) {
    if (url.hostname !== "aura.crediteksas.com") return new Response("Not found", { status: 404 });
    try {
      return await fetcher(request);
    } catch {
      return new Response("Origin unavailable", { status: 502, headers: { "cache-control": "no-store" } });
    }
  }
  if (!["GET", "HEAD"].includes(request.method)) return new Response("Method not allowed", { status: 405, headers: { allow: "GET, HEAD" } });
  return new Response(request.method === "HEAD" ? null : html2, { headers: {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-aura-tools-release": "20260915-nova-pwa"
  } });
}

// <stdin>
var stdin_default = { fetch: (request) => serveAuraShell(request, html) };
export {
  stdin_default as default
};
