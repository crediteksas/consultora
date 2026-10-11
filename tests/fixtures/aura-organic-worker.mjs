import { OrganicCalendar } from '../../creditek/workers/aura-meta-ads-api/organic-calendar.mjs';
export class TestCalendar extends OrganicCalendar {
  async tick(at) {
    const original = Date.now; Date.now = () => at;
    try { await this.alarm(); } finally { Date.now = original; }
  }
}
export default { async fetch(request, env) {
  const { method, args } = await request.json();
  if (!['save', 'approve', 'pause', 'preview', 'list', 'tick'].includes(method)) return new Response('Denied', { status: 403 });
  try { return Response.json(await env.ORGANIC_CALENDARS.getByName('page:123')[method](...args) ?? {}); }
  catch (e) { return Response.json({ error: e.message }, { status: 400 }); }
} };
