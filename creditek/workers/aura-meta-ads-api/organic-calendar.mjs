import { DurableObject } from 'cloudflare:workers';
import { OrganicError, HOUR, validateCalendar, digest, approvalPayload, hasStarted, contentWarnings, learnFromCalendars } from './organic-model.mjs';
import { graph, connection, verifyPublication, metrics } from './organic-meta.mjs';

// One coordinator per configured Page; bounded calendars, no paid-ads state.
export class OrganicCalendar extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS calendars (id TEXT PRIMARY KEY, document TEXT NOT NULL, updated_at INTEGER NOT NULL)');
      ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS organic_audit (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, calendar_id TEXT NOT NULL, revision INTEGER NOT NULL)');
    });
  }
  #get(id) {
    const row = this.ctx.storage.sql.exec('SELECT document FROM calendars WHERE id = ?', id).toArray()[0];
    return row ? JSON.parse(row.document) : null;
  }
  #put(c, actor, action) {
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec('INSERT INTO calendars (id, document, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET document=excluded.document, updated_at=excluded.updated_at', c.id, JSON.stringify(c), Date.now());
      if (action) this.ctx.storage.sql.exec('INSERT INTO organic_audit (at, actor, action, calendar_id, revision) VALUES (?, ?, ?, ?, ?)', Date.now(), actor, action, c.id, c.revision);
    });
  }
  async list() {
    const calendars = this.#all();
    return { calendars, learning: learnFromCalendars(calendars) };
  }
  #all() {
    return this.ctx.storage.sql.exec('SELECT document FROM calendars ORDER BY updated_at DESC LIMIT 200').toArray().map(r => JSON.parse(r.document));
  }
  async save(input, actor) {
    const clean = validateCalendar(input);
    const old = this.#get(clean.id);
    if ((old?.revision || 0) !== input.revision) throw new OrganicError('REVISION_CONFLICT', 409);
    if (old && hasStarted(old)) throw new OrganicError('STARTED_CALENDAR_IS_IMMUTABLE', 409);
    if (!old && this.#all().length >= 200) throw new OrganicError('CALENDAR_LIMIT_REQUIRES_ARCHIVING', 409);
    const c = { ...clean, revision: (old?.revision || 0) + 1, approval: null, state: 'draft', created_at: old?.created_at || new Date().toISOString(), updated_by: actor };
    this.#put(c, actor, 'saved_approval_invalidated');
    await this.#schedule();
    return { ...c, approval_digest: await digest(approvalPayload(c)) };
  }
  async preview(id) {
    const c = this.#get(id); if (!c) throw new OrganicError('NOT_FOUND', 404);
    return { ...c, approval_digest: await digest(approvalPayload(c)) };
  }
  async approve(input, actor) {
    if (this.env.ORGANIC_AUTOMATION_ENABLED !== 'true') throw new OrganicError('AUTOMATION_NOT_ENABLED', 503);
    const c = this.#get(input.id);
    if (!c || c.revision !== input.revision || !['draft', 'paused'].includes(c.state) || hasStarted(c)) throw new OrganicError('REVISION_CONFLICT', 409);
    const expected = await digest(approvalPayload(c));
    if (input.confirm !== 'APPROVE_CALENDAR_AND_SCHEDULE' || input.digest !== expected) throw new OrganicError('EXACT_CALENDAR_APPROVAL_REQUIRED', 409);
    validateCalendar(c); // Expired draft schedules cannot silently publish immediately.
    for (const p of c.pieces) {
      if (!p.asset || contentWarnings(p.caption).length) throw new OrganicError('CONTENT_REVIEW_REQUIRED', 409);
      if (!await this.env.ORGANIC_MEDIA.head(p.asset)) throw new OrganicError('IMAGE_MISSING', 409);
    }
    const conn = await connection(this.env);
    for (const channel of new Set(c.pieces.flatMap(p => p.channels))) if (conn.missing[channel].length) throw new OrganicError(`MISSING_${channel.toUpperCase()}_PERMISSIONS`, 409);
    // External preflight yields: re-read before installing authorization.
    const current = this.#get(input.id);
    if (current.revision !== c.revision || current.state !== c.state || current.approval) throw new OrganicError('REVISION_CONFLICT', 409);
    c.approval = { digest: expected, by: actor, at: new Date().toISOString(), page_id: conn.page_id, instagram_id: conn.instagram_id, scope: 'exact_calendar_automatic_schedule' };
    c.state = 'approved';
    for (const p of c.pieces) for (const channel of p.channels) p.results[channel] = { status: 'scheduled', due: Date.parse(p.scheduled_at) };
    this.#put(c, actor, 'calendar_approved_and_scheduled');
    await this.#schedule();
    return c;
  }
  async pause(id, actor) {
    const c = this.#get(id); if (!c) throw new OrganicError('NOT_FOUND', 404);
    for (const p of c.pieces) for (const r of Object.values(p.results)) if (['scheduled', 'preparing', 'container_ready'].includes(r.status)) r.status = 'cancelled';
    c.state = 'paused'; c.approval = null;
    this.#put(c, actor, 'paused_pending_only');
    await this.#schedule();
    return { calendar: c, note: 'No elimina publicaciones existentes ni puede retirar una petición ya enviada a Meta.' };
  }
  #update(id, pieceId, channel, mutate) {
    const c = this.#get(id), p = c?.pieces.find(p => p.id === pieceId);
    if (!p?.results[channel]) return;
    mutate(p.results[channel], c, p); this.#put(c, 'scheduler', null);
  }
  async #schedule() {
    const times = [];
    for (const c of this.#all()) for (const p of c.pieces) for (const r of Object.values(p.results)) {
      if (['scheduled', 'container_ready', 'accepted'].includes(r.status)) times.push(r.due);
      if (['preparing', 'creating', 'sending'].includes(r.status)) times.push(r.lease_until);
      if (r.status === 'published' && r.next_metrics) times.push(r.next_metrics);
    }
    const valid = times.filter(Number.isFinite);
    if (valid.length) await this.ctx.storage.setAlarm(Math.max(Date.now() + 1000, Math.min(...valid)));
    else await this.ctx.storage.deleteAlarm();
  }
  async alarm() {
    // Install a watchdog BEFORE network work. A crash can't strand the queue.
    await this.ctx.storage.setAlarm(Date.now() + 60000);
    let count = 0;
    for (const c of this.#all()) for (const p of c.pieces) for (const channel of p.channels) {
      const r = p.results[channel]; if (!r) continue;
      if (['preparing', 'creating', 'sending'].includes(r.status) && r.lease_until <= Date.now()) {
        this.#update(c.id, p.id, channel, live => { live.status = r.status === 'preparing' ? 'blocked' : 'uncertain'; live.error = 'INTERRUPTED_REVIEW_REQUIRED_NO_AUTOMATIC_RESEND'; });
      }
      if (count >= 4) continue;
      if (['scheduled', 'container_ready', 'accepted'].includes(r.status) && r.due <= Date.now()) { count++; await this.#process(c.id, p.id, channel); }
      else if (r.status === 'published' && r.next_metrics && r.next_metrics <= Date.now()) { count++; await this.#measure(c.id, p.id, channel); }
    }
    await this.#schedule();
  }
  async #process(id, pieceId, channel) {
    let c = this.#get(id), p = c.pieces.find(p => p.id === pieceId), r = p.results[channel];
    const initial = r.status;
    if (!['scheduled', 'container_ready', 'accepted'].includes(initial)) return;
    if (initial !== 'accepted') {
      if (!c.approval || c.state !== 'approved' || this.env.ORGANIC_AUTOMATION_ENABLED !== 'true') {
        this.#update(id, pieceId, channel, x => { x.status = 'blocked'; x.error = 'APPROVAL_OR_AUTOMATION_DISABLED'; }); return;
      }
      if (Date.now() - Date.parse(p.scheduled_at) > HOUR) {
        this.#update(id, pieceId, channel, x => { x.status = 'blocked'; x.error = 'MISSED_SLOT_REVIEW_REQUIRED'; }); return;
      }
      r.status = 'preparing'; r.lease_until = Date.now() + 120000; this.#put(c, 'scheduler', 'preflight_started');
    }
    try {
      const conn = await connection(this.env);
      // Bind every send to the exact destinations authorized with the calendar.
      c = this.#get(id); p = c.pieces.find(p => p.id === pieceId); r = p.results[channel];
      if (initial !== 'accepted' && (r.status !== 'preparing' || !c.approval)) return;
      if (initial !== 'accepted' && (String(conn.page_id) !== String(c.approval.page_id) || String(conn.instagram_id) !== String(c.approval.instagram_id))) throw new OrganicError('DESTINATION_CHANGED');
      if (initial === 'accepted') { await this.#verify(id, pieceId, channel, conn); return; }
      if (conn.missing[channel].length) throw new OrganicError('META_PERMISSION_MISSING');
      if (!await this.env.ORGANIC_MEDIA.head(p.asset)) throw new OrganicError('IMAGE_MISSING');
      // Pause may run while checking media. Reserve synchronously after the last await.
      c = this.#get(id); p = c.pieces.find(p => p.id === pieceId); r = p.results[channel];
      if (!c.approval || r.status !== 'preparing') return;
      const imageUrl = `${this.env.ORGANIC_PUBLIC_BASE}/v1/organic/media/${p.asset}`;
      if (channel === 'instagram' && !r.container_id) {
        r.status = 'creating'; this.#put(c, 'scheduler', 'instagram_container_requested');
        const body = await graph(this.env, conn.token, `${conn.instagram_id}/media`, { image_url: imageUrl, caption: p.caption }, 'POST');
        if (!/^\d+$/.test(String(body.id))) throw new OrganicError('META_CONTAINER_ID_MISSING');
        this.#update(id, pieceId, channel, (x, live) => { x.container_id = String(body.id); x.status = live.approval ? 'container_ready' : 'cancelled'; x.due = Date.now() + 60000; });
        return;
      }
      if (channel === 'instagram') {
        const container = await graph(this.env, conn.token, r.container_id, { fields: 'status_code' });
        c = this.#get(id); p = c.pieces.find(p => p.id === pieceId); r = p.results[channel];
        if (!c.approval || r.status !== 'preparing') return;
        if (container.status_code !== 'FINISHED') {
          if (container.status_code === 'IN_PROGRESS' && (r.polls || 0) < 10) { r.polls = (r.polls || 0) + 1; r.status = 'container_ready'; r.due = Date.now() + 60000; this.#put(c); return; }
          throw new OrganicError('INSTAGRAM_CONTAINER_NOT_READY');
        }
      }
      r.status = 'sending'; r.lease_until = Date.now() + 120000;
      this.#put(c, 'scheduler', `${channel}_publish_requested`);
      // Exactly one POST attempt. Never retry an ambiguous result automatically.
      const sent = channel === 'facebook'
        ? await graph(this.env, conn.token, `${conn.page_id}/photos`, { url: imageUrl, caption: p.caption, published: 'true' }, 'POST')
        : await graph(this.env, conn.token, `${conn.instagram_id}/media_publish`, { creation_id: r.container_id }, 'POST');
      const publishedId = String(channel === 'facebook' ? sent.post_id || '' : sent.id || '');
      if (!/^[\d_]+$/.test(publishedId)) throw new OrganicError('META_POST_ID_MISSING');
      this.#update(id, pieceId, channel, x => { x.id = publishedId; x.status = 'accepted'; x.accepted_at = new Date().toISOString(); x.due = Date.now() + 60000; });
      await this.#verify(id, pieceId, channel, conn);
    } catch (error) {
      this.#update(id, pieceId, channel, x => {
        if (x.status === 'cancelled') return;
        if (x.status === 'accepted') { x.verify_attempts = (x.verify_attempts || 0) + 1; x.due = Date.now() + 5 * 60000; if (x.verify_attempts >= 6) x.status = 'needs_verification'; }
        else x.status = ['sending', 'creating'].includes(x.status) ? (error.ambiguous !== false ? 'uncertain' : 'failed') : 'blocked';
        x.error = /^(META_|[A-Z_]+$)/.test(error.message) ? error.message.slice(0, 120) : 'UNEXPECTED_FAILURE_REVIEW_REQUIRED';
      });
    }
  }
  async #verify(id, pieceId, channel, conn) {
    const r = this.#get(id).pieces.find(p => p.id === pieceId).results[channel];
    const permalink = await verifyPublication(this.env, conn, channel, r.id);
    this.#update(id, pieceId, channel, x => {
      x.status = 'published'; x.permalink = permalink; x.published_at = x.accepted_at; x.error = null;
      x.next_metrics = Date.parse(x.published_at) + 24 * HOUR; x.snapshots = [];
    });
  }
  async #measure(id, pieceId, channel) {
    const r = this.#get(id).pieces.find(p => p.id === pieceId).results[channel];
    // Reserve next slot before network calls; measurement cannot trigger publication.
    this.#update(id, pieceId, channel, x => { x.next_metrics = Date.now() + 6 * HOUR; });
    try {
      const conn = await connection(this.env);
      const snapshot = await metrics(this.env, conn, channel, r.id, r.published_at);
      this.#update(id, pieceId, channel, x => {
        x.snapshots = [...(x.snapshots || []), snapshot].slice(-40);
        x.metrics_error = null;
        x.next_metrics = snapshot.age_hours < 30 ? Date.parse(x.published_at) + 72 * HOUR : snapshot.age_hours < 72 ? Date.parse(x.published_at) + 72 * HOUR : snapshot.age_hours < 168 ? Date.parse(x.published_at) + 168 * HOUR : null;
      });
    } catch { this.#update(id, pieceId, channel, x => { x.metrics_error = 'META_METRICS_UNAVAILABLE'; x.metrics_attempts = (x.metrics_attempts || 0) + 1; if (x.metrics_attempts >= 4) x.next_metrics = null; }); }
  }
}
