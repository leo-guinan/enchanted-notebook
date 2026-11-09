/** The Enchanted Notebook server: static notebook, guest-book pages (fold logs), grounded answers,
 * tracked outbound referrals and a small admin view. No framework, no runtime dependencies.
 *
 *   ANTHROPIC_API_KEY=… ADMIN_TOKEN=… node server/index.mjs
 *
 * Env: PORT (8787), BROADCASTER (packy), DB_FILE (data/notebook.db), MODEL (claude-haiku-5-5),
 *      ANTHROPIC_API_KEY (unset = extractive answers only), ADMIN_TOKEN (unset = admin disabled), TRUST_PROXY (1 behind a proxy).
 */
import http from 'node:http';
import { readFileSync, existsSync, statSync, createReadStream } from 'node:fs';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import * as Fold from './vendor/fold/index.js';
import { pageWorld, replayPage, writingTime } from '../shared/page-world.mjs';
import { buildIndex, search, rankSources } from './retrieve.mjs';
import { answerQuestion } from './answer.mjs';
import { openStore } from './store.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function createApp(env = process.env) {
  const bid = env.BROADCASTER || 'packy';
  const cfg = JSON.parse(readFileSync(join(ROOT, 'broadcasters', bid, 'broadcaster.json'), 'utf8'));
  const index = buildIndex(cfg.sources);
  const store = openStore(env.DB_FILE || join(ROOT, 'data', 'notebook.db'));
  const opts = { sourceIds: cfg.sources.map(s => s.id), limits: cfg.limits };
  const model = env.MODEL || 'claude-haiku-5-5';
  const hits = new Map(); // ip -> timestamps (rate limit)

  const publicConfig = {
    id: cfg.id, title: cfg.title, subject: cfg.subject, notice: cfg.notice, invitation: cfg.invitation, theme: cfg.theme,
    limits: { questionMaxChars: cfg.limits.questionMaxChars, asksPerPage: cfg.limits.asksPerPage }, broadcast: cfg.broadcast,
    sources: cfg.sources.map(({ id, title, subtitle, author, url, published }) => ({ id, title, subtitle, author, url, published })),
    ideas: cfg.ideas,
  };
  const sourceById = new Map(cfg.sources.map(s => [s.id, s]));
  const pageView = p => ({ id: p.id, number: store.pageNumber(bid, p.id), created: p.created, events: p.events });

  function rateLimited(ip) {
    const now = Date.now(), win = 10 * 60e3, max = cfg.limits.answersPerIpPer10Min;
    const arr = (hits.get(ip) || []).filter(t => now - t < win); arr.push(now); hits.set(ip, arr);
    if (hits.size > 5000) hits.clear();
    return arr.length > max;
  }

  async function ask(pageId, session, question, ip) {
    const page = store.page(pageId);
    if (!page || page.broadcaster !== bid) return [404, { error: 'no such page' }];
    if (page.session && session !== page.session) return [403, { error: 'this page belongs to another visitor' }];
    if (rateLimited(ip)) return [429, { error: 'the quill needs a rest; try again in a few minutes' }];
    const world = replayPage(Fold, opts, page.events);
    const t = (Date.now() - page.created) / 1000;
    const askEv = world.emit({ t, dur: 0, actor: 'visitor', op: 'ASK', frame: 'page', args: { text: String(question || '').trim() } });
    if (askEv.result === 'denied') return [422, { error: askEv.reason }];
    store.track(bid, 'question_asked', { session, pageId, detail: { terms: search(index, question).terms.slice(0, 8) } });

    const key = createHash('sha256').update(question.toLowerCase().replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 24);
    let a = store.cached(bid, key), cached = !!a;
    if (!a) {
      const allowModel = store.spentToday(bid) < cfg.limits.generatedAnswersPerDay;
      a = await answerQuestion({ index, question, apiKey: env.ANTHROPIC_API_KEY, model, maxTokens: cfg.limits.maxOutputTokens, allowModel, fetchImpl: env.fetchImpl || fetch });
      if (a.grounding === 'model') store.spend(bid, a.usage);
      if (a.grounding !== 'none' && !a.fallback) store.cache(bid, key, a);
    }
    const t2 = Math.max(t + 0.01, (Date.now() - page.created) / 1000);
    const ans = world.emit({ t: t2, dur: writingTime(a.text + ' ' + (a.explore || '')), actor: 'quill', op: 'ANSWER', frame: 'page',
      args: { text: a.text, explore: a.explore || '', sources: a.sources, related: a.related || [], supported: a.supported, grounding: a.grounding } });
    if (ans.result === 'denied') return [500, { error: 'the notebook refused its own answer: ' + ans.reason }];
    const events = world.log.events.map(e => ({ ...e }));
    store.savePage(pageId, events, world.stateAt(Infinity).asks);
    return [200, { page: pageView(store.page(pageId)), answer: ans.id, cached }];
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://x'); const p = url.pathname;
    const ip = (env.TRUST_PROXY === '1' && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '?';
    const json = (code, body) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
    const body = async () => { let s = ''; for await (const c of req) { s += c; if (s.length > 20000) throw new Error('too large'); } return s ? JSON.parse(s) : {}; };
    const admin = () => env.ADMIN_TOKEN && (req.headers.authorization === `Bearer ${env.ADMIN_TOKEN}` || url.searchParams.get('token') === env.ADMIN_TOKEN);
    try {
      if (p === '/api/config' && req.method === 'GET') return json(200, publicConfig);
      if (p === '/api/pages' && req.method === 'GET') {
        const before = Number(url.searchParams.get('before')) || 1e15, limit = Math.min(20, Number(url.searchParams.get('limit')) || 6);
        return json(200, { total: store.countPages(bid), pages: store.listPages(bid, { before, limit }).map(pageView) });
      }
      if (p === '/api/pages' && req.method === 'POST') {
        const { session } = await body();
        const id = store.createPage(bid, String(session || '').slice(0, 64));
        return json(201, { page: pageView(store.page(id)) });
      }
      let m;
      if ((m = p.match(/^\/api\/pages\/(\d+)$/)) && req.method === 'GET') {
        const page = store.page(Number(m[1])); if (!page || page.hidden || page.broadcaster !== bid) return json(404, { error: 'no such page' });
        return json(200, { page: pageView(page) });
      }
      if ((m = p.match(/^\/api\/pages\/(\d+)\/ask$/)) && req.method === 'POST') {
        const { question, session } = await body();
        const [code, out] = await ask(Number(m[1]), String(session || '').slice(0, 64), String(question || ''), ip);
        return json(code, out);
      }
      if (p === '/api/events' && req.method === 'POST') {
        const { type, session, pageId, sourceId, detail } = await body();
        const ok = ['notebook_view', 'broadcast_idea_view', 'answer_displayed', 'related_question_selected', 'page_turned', 'answer_skipped'];
        if (!ok.includes(type)) return json(400, { error: 'unknown event' });
        store.track(bid, type, { session: String(session || '').slice(0, 64), pageId: Number(pageId) || null, sourceId: sourceById.has(sourceId) ? sourceId : null, detail: detail && typeof detail === 'object' ? detail : null });
        return json(204, {});
      }
      // tracked outbound referral: record it, then send the visitor to the original essay
      if ((m = p.match(/^\/r\/([a-z0-9-]+)$/))) {
        const s = sourceById.get(m[1]); if (!s) return json(404, { error: 'no such source' });
        store.track(bid, 'source_link_clicked', { session: url.searchParams.get('s')?.slice(0, 64), pageId: Number(url.searchParams.get('p')) || null, sourceId: s.id, dest: s.url,
          detail: { context: (url.searchParams.get('c') || '').slice(0, 40), domain: new URL(s.url).hostname } });
        res.writeHead(302, { location: s.url, 'cache-control': 'no-store', 'referrer-policy': 'origin' }); return res.end();
      }
      if (p === '/api/admin/stats') {
        if (!admin()) return json(401, { error: 'admin token required' });
        const st = store.stats(bid); const themes = new Map();
        for (const d of st.questionTerms) for (const t of d.terms || []) themes.set(t, (themes.get(t) || 0) + 1);
        delete st.questionTerms; st.questionThemes = [...themes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
        st.mostExplored = st.mostExplored.map(r => ({ ...r, title: sourceById.get(r.source_id)?.title }));
        st.model = env.ANTHROPIC_API_KEY ? model : 'none (extractive answers)';
        return json(200, st);
      }
      if ((m = p.match(/^\/api\/admin\/pages\/(\d+)\/(hide|show)$/)) && req.method === 'POST') {
        if (!admin()) return json(401, { error: 'admin token required' });
        store.hidePage(Number(m[1]), m[2] === 'hide' ? 1 : 0); return json(200, { ok: true });
      }
      if (p === '/healthz') return json(200, { ok: true });
      return serveStatic(p, res);
    } catch (err) { return json(400, { error: String(err.message || err) }); }
  }

  return { handle, store, index, cfg };
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
function serveStatic(p, res) {
  const map = p === '/' ? 'public/index.html' : p === '/admin' ? 'public/admin.html' : p.startsWith('/shared/') ? p.slice(1) : 'public' + p;
  const f = resolve(ROOT, map);
  if (!(f.startsWith(join(ROOT, 'public')) || f.startsWith(join(ROOT, 'shared'))) || !existsSync(f) || !statSync(f).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('not found');
  }
  res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream', 'cache-control': extname(f) === '.html' ? 'no-cache' : 'public, max-age=3600',
    'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin' });
  createReadStream(f).pipe(res);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createApp();
  const port = Number(process.env.PORT) || 8787;
  http.createServer(app.handle).listen(port, () => console.log(`enchanted notebook on http://localhost:${port} (${process.env.ANTHROPIC_API_KEY ? 'model: ' + (process.env.MODEL || 'claude-haiku-5-5') : 'extractive answers; set ANTHROPIC_API_KEY for generated ones'})`));
}
