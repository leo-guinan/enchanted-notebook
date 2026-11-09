/** Storage, on any SQLite (see sql.mjs). Pages hold their fold event log as JSON; events are anonymous
 * analytics; the cache keeps answers to repeated questions; spend counts generated answers per day;
 * rate holds short-lived per-visitor counters (keyed by a daily-salted hash, never the address itself). */
const today = () => new Date().toISOString().slice(0, 10);

export function makeStore(sql) {
  return {
    async createPage(b, session) { return (await sql.run('INSERT INTO pages (broadcaster, created, session) VALUES (?, ?, ?)', b, Date.now(), session || null)).lastId; },
    async page(id) { const r = await sql.get('SELECT * FROM pages WHERE id = ?', id); return r ? { ...r, events: JSON.parse(r.events) } : null; },
    async savePage(id, events, asks) { await sql.run('UPDATE pages SET events = ?, asks = ? WHERE id = ?', JSON.stringify(events), asks, id); },
    async listPages(b, { before = 1e15, limit = 10 } = {}) {
      return (await sql.all('SELECT id, created, asks, events FROM pages WHERE broadcaster = ? AND hidden = 0 AND asks > 0 AND id < ? ORDER BY id DESC LIMIT ?', b, before, limit))
        .map(r => ({ ...r, events: JSON.parse(r.events) }));
    },
    async countPages(b) { return (await sql.get('SELECT COUNT(*) n FROM pages WHERE broadcaster = ? AND hidden = 0 AND asks > 0', b)).n; },
    async pageNumber(b, id) { return (await sql.get('SELECT COUNT(*) n FROM pages WHERE broadcaster = ? AND hidden = 0 AND asks > 0 AND id <= ?', b, id)).n; },
    async hidePage(id, hidden = 1) { await sql.run('UPDATE pages SET hidden = ? WHERE id = ?', hidden, id); },
    async track(b, type, { session, pageId, sourceId, dest, detail } = {}) {
      await sql.run('INSERT INTO events (ts, broadcaster, type, session, page_id, source_id, dest, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        Date.now(), b, type, session || null, pageId ?? null, sourceId || null, dest || null, detail ? JSON.stringify(detail) : null);
    },
    async cached(b, key) { const r = await sql.get('SELECT answer FROM answer_cache WHERE broadcaster = ? AND qkey = ?', b, key); return r ? JSON.parse(r.answer) : null; },
    async cache(b, key, answer) { await sql.run('INSERT OR REPLACE INTO answer_cache VALUES (?, ?, ?, ?)', b, key, JSON.stringify(answer), Date.now()); },
    async spentToday(b) { return (await sql.get('SELECT generated FROM spend WHERE day = ? AND broadcaster = ?', today(), b))?.generated || 0; },
    async spend(b, usage) {
      await sql.run(`INSERT INTO spend VALUES (?, ?, 1, ?, ?) ON CONFLICT(day, broadcaster) DO UPDATE SET generated = generated + 1,
        in_tokens = in_tokens + excluded.in_tokens, out_tokens = out_tokens + excluded.out_tokens`, today(), b, usage?.input_tokens || 0, usage?.output_tokens || 0);
    },
    /** count one hit in a window; returns the count so far */
    async hit(bucket, windowMs) {
      const now = Date.now();
      await sql.run(`INSERT INTO rate VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET n = CASE WHEN expires < ? THEN 1 ELSE n + 1 END,
        expires = CASE WHEN expires < ? THEN excluded.expires ELSE expires END`, bucket, now + windowMs, now, now);
      if (Math.random() < .02) await sql.run('DELETE FROM rate WHERE expires < ?', now);
      return (await sql.get('SELECT n FROM rate WHERE bucket = ?', bucket)).n;
    },
    async stats(b) {
      const n = async (q, ...a) => (await sql.get(q, b, ...a)).n;
      const visitors = await n(`SELECT COUNT(DISTINCT session) n FROM events WHERE broadcaster = ? AND type = 'notebook_view'`);
      const referrers = await n(`SELECT COUNT(DISTINCT session) n FROM events WHERE broadcaster = ? AND type = 'source_link_clicked'`);
      return {
        uniqueVisitors: visitors,
        questionsAsked: await n(`SELECT COUNT(*) n FROM events WHERE broadcaster = ? AND type = 'question_asked'`),
        answersDisplayed: await n(`SELECT COUNT(*) n FROM events WHERE broadcaster = ? AND type = 'answer_displayed'`),
        sourceReferrals: await n(`SELECT COUNT(*) n FROM events WHERE broadcaster = ? AND type = 'source_link_clicked'`),
        uniqueReferringVisitors: referrers,
        sourceReferralRate: visitors ? referrers / visitors : 0,
        pages: await n(`SELECT COUNT(*) n FROM pages WHERE broadcaster = ? AND asks > 0`),
        hiddenPages: await n(`SELECT COUNT(*) n FROM pages WHERE broadcaster = ? AND hidden = 1`),
        mostExplored: await sql.all(`SELECT source_id, COUNT(*) clicks FROM events WHERE broadcaster = ? AND type = 'source_link_clicked' GROUP BY source_id ORDER BY clicks DESC`, b),
        broadcastIdeaViews: await n(`SELECT COUNT(*) n FROM events WHERE broadcaster = ? AND type = 'broadcast_idea_view'`),
        relatedSelected: await n(`SELECT COUNT(*) n FROM events WHERE broadcaster = ? AND type = 'related_question_selected'`),
        spend: await sql.all('SELECT day, generated, in_tokens, out_tokens FROM spend WHERE broadcaster = ? ORDER BY day DESC LIMIT 14', b),
        questionTerms: (await sql.all(`SELECT detail FROM events WHERE broadcaster = ? AND type = 'question_asked' ORDER BY id DESC LIMIT 500`, b)).map(r => JSON.parse(r.detail || '{}')),
      };
    },
  };
}
