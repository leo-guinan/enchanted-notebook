/** The notebook's API as a web-standard handler: Request in, Response out. The same code runs inside a
 * Cloudflare Worker (worker/index.mjs) and behind Node's http server (server/index.mjs).
 *
 *   const app = createApp({ cfg, sql, env });   // sql: see sql.mjs
 *   const res = await app.fetch(request);       // null when the path isn't an API route (serve a static file)
 */
import * as Fold from './vendor/fold/index.js';
import { replayPage, writingTime } from '../public/shared/page-world.mjs';
import { buildIndex, search } from './retrieve.mjs';
import { answerQuestion } from './answer.mjs';
import { makeStore } from './store.mjs';

const enc = new TextEncoder();
async function sha256(s) { const d = await crypto.subtle.digest('SHA-256', enc.encode(s)); return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join(''); }
const json = (code, body, headers = {}) => new Response(code === 204 ? null : JSON.stringify(body), { status: code, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

export function createApp({ cfg, sql, env = {} }) {
  const bid = cfg.id;
  const index = buildIndex(cfg.sources);
  const store = makeStore(sql);
  const opts = { sourceIds: cfg.sources.map(s => s.id), limits: cfg.limits };
  const model = env.MODEL || 'claude-haiku-5-5';
  const sourceById = new Map(cfg.sources.map(s => [s.id, s]));
  const publicConfig = {
    id: cfg.id, title: cfg.title, subject: cfg.subject, notice: cfg.notice, invitation: cfg.invitation, theme: cfg.theme,
    limits: { questionMaxChars: cfg.limits.questionMaxChars, asksPerPage: cfg.limits.asksPerPage }, broadcast: cfg.broadcast,
    sources: cfg.sources.map(({ id, title, subtitle, author, url, published }) => ({ id, title, subtitle, author, url, published })),
    ideas: cfg.ideas,
  };
  const pageView = async p => ({ id: p.id, number: await store.pageNumber(bid, p.id), created: p.created, events: p.events });

  async function ask(pageId, session, question, ip) {
    const page = await store.page(pageId);
    if (!page || page.broadcaster !== bid) return json(404, { error: 'no such page' });
    if (page.session && session !== page.session) return json(403, { error: 'this page belongs to another visitor' });
    // per-visitor limit, keyed by a hash of the address salted with the day (the address itself is never stored)
    const who = await sha256(`${new Date().toISOString().slice(0, 10)}|${env.RATE_SALT || bid}|${ip}`);
    if (await store.hit('ask:' + who.slice(0, 24), 10 * 60e3) > cfg.limits.answersPerIpPer10Min) return json(429, { error: 'the quill needs a rest; try again in a few minutes' });

    const world = replayPage(Fold, opts, page.events);
    const t = (Date.now() - page.created) / 1000;
    const askEv = world.emit({ t, dur: 0, actor: 'visitor', op: 'ASK', frame: 'page', args: { text: String(question || '').trim() } });
    if (askEv.result === 'denied') return json(422, { error: askEv.reason });
    await store.track(bid, 'question_asked', { session, pageId, detail: { terms: search(index, question).terms.slice(0, 8) } });

    const key = (await sha256(question.toLowerCase().replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim())).slice(0, 24);
    let a = await store.cached(bid, key); const cached = !!a;
    if (!a) {
      const allowModel = (await store.spentToday(bid)) < cfg.limits.generatedAnswersPerDay;
      a = await answerQuestion({ index, question, apiKey: env.ANTHROPIC_API_KEY, model, baseUrl: env.ANTHROPIC_BASE_URL, maxTokens: cfg.limits.maxOutputTokens, allowModel, fetchImpl: env.fetchImpl });
      if (a.grounding === 'model') await store.spend(bid, a.usage);
      if (a.grounding !== 'none' && !a.fallback) await store.cache(bid, key, a);
    }
    const t2 = Math.max(t + 0.01, (Date.now() - page.created) / 1000);
    const ans = world.emit({ t: t2, dur: writingTime(a.text + ' ' + (a.explore || '')), actor: 'quill', op: 'ANSWER', frame: 'page',
      args: { text: a.text, explore: a.explore || '', sources: a.sources, related: a.related || [], supported: a.supported, grounding: a.grounding } });
    if (ans.result === 'denied') return json(500, { error: 'the notebook refused its own answer: ' + ans.reason });
    await store.savePage(pageId, world.log.events.map(e => ({ ...e })), world.stateAt(Infinity).asks);
    return json(200, { page: await pageView(await store.page(pageId)), answer: ans.id, cached });
  }

  async function fetch(req) {
    const url = new URL(req.url); const p = url.pathname, method = req.method;
    if (!(p.startsWith('/api/') || p.startsWith('/r/') || p === '/healthz')) return null;
    const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || '?';
    const body = async () => { const s = await req.text(); if (s.length > 20000) throw new Error('too large'); return s ? JSON.parse(s) : {}; };
    const admin = () => env.ADMIN_TOKEN && (req.headers.get('authorization') === `Bearer ${env.ADMIN_TOKEN}` || url.searchParams.get('token') === env.ADMIN_TOKEN);
    try {
      if (p === '/api/config' && method === 'GET') return json(200, publicConfig, { 'cache-control': 'public, max-age=300' });
      if (p === '/api/pages' && method === 'GET') {
        const before = Number(url.searchParams.get('before')) || 1e15, limit = Math.min(20, Number(url.searchParams.get('limit')) || 6);
        const pages = await store.listPages(bid, { before, limit });
        return json(200, { total: await store.countPages(bid), pages: await Promise.all(pages.map(pageView)) });
      }
      if (p === '/api/pages' && method === 'POST') {
        const { session } = await body();
        const id = await store.createPage(bid, String(session || '').slice(0, 64));
        return json(201, { page: await pageView(await store.page(id)) });
      }
      let m;
      if ((m = p.match(/^\/api\/pages\/(\d+)$/)) && method === 'GET') {
        const page = await store.page(Number(m[1])); if (!page || page.hidden || page.broadcaster !== bid) return json(404, { error: 'no such page' });
        return json(200, { page: await pageView(page) });
      }
      if ((m = p.match(/^\/api\/pages\/(\d+)\/ask$/)) && method === 'POST') {
        const { question, session } = await body();
        return await ask(Number(m[1]), String(session || '').slice(0, 64), String(question || ''), ip);
      }
      if (p === '/api/events' && method === 'POST') {
        const { type, session, pageId, sourceId, detail } = await body();
        const ok = ['notebook_view', 'broadcast_idea_view', 'answer_displayed', 'related_question_selected', 'page_turned', 'answer_skipped'];
        if (!ok.includes(type)) return json(400, { error: 'unknown event' });
        await store.track(bid, type, { session: String(session || '').slice(0, 64), pageId: Number(pageId) || null, sourceId: sourceById.has(sourceId) ? sourceId : null, detail: detail && typeof detail === 'object' ? detail : null });
        return json(204);
      }
      // tracked outbound referral: record it, then send the visitor to the original essay
      if ((m = p.match(/^\/r\/([a-z0-9-]+)$/))) {
        const s = sourceById.get(m[1]); if (!s) return json(404, { error: 'no such source' });
        await store.track(bid, 'source_link_clicked', { session: url.searchParams.get('s')?.slice(0, 64), pageId: Number(url.searchParams.get('p')) || null, sourceId: s.id, dest: s.url,
          detail: { context: (url.searchParams.get('c') || '').slice(0, 40), domain: new URL(s.url).hostname } });
        return new Response(null, { status: 302, headers: { location: s.url, 'cache-control': 'no-store', 'referrer-policy': 'origin' } });
      }
      if (p === '/api/admin/stats') {
        if (!admin()) return json(401, { error: 'admin token required' });
        const st = await store.stats(bid); const themes = new Map();
        for (const d of st.questionTerms) for (const t of d.terms || []) themes.set(t, (themes.get(t) || 0) + 1);
        delete st.questionTerms; st.questionThemes = [...themes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
        st.mostExplored = st.mostExplored.map(r => ({ ...r, title: sourceById.get(r.source_id)?.title }));
        st.model = env.ANTHROPIC_API_KEY ? model : 'none (extractive answers)';
        return json(200, st);
      }
      if ((m = p.match(/^\/api\/admin\/pages\/(\d+)\/(hide|show)$/)) && method === 'POST') {
        if (!admin()) return json(401, { error: 'admin token required' });
        await store.hidePage(Number(m[1]), m[2] === 'hide' ? 1 : 0); return json(200, { ok: true });
      }
      if (p === '/healthz') return json(200, { ok: true });
      return json(404, { error: 'not found' });
    } catch (err) { return json(400, { error: String(err.message || err) }); }
  }
  return { fetch, store, index, cfg };
}
