/** Storage: one SQLite file (node:sqlite, built into Node 22). Pages hold their fold event log as JSON;
 * events are anonymous analytics; the cache keeps answers to repeated questions. */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openStore(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT, broadcaster TEXT NOT NULL, created INTEGER NOT NULL,
      session TEXT, events TEXT NOT NULL DEFAULT '[]', asks INTEGER NOT NULL DEFAULT 0, hidden INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, broadcaster TEXT NOT NULL, type TEXT NOT NULL,
      session TEXT, page_id INTEGER, source_id TEXT, dest TEXT, detail TEXT);
    CREATE INDEX IF NOT EXISTS events_type ON events(broadcaster, type);
    CREATE TABLE IF NOT EXISTS answer_cache (broadcaster TEXT, qkey TEXT, answer TEXT, created INTEGER, PRIMARY KEY (broadcaster, qkey));
    CREATE TABLE IF NOT EXISTS spend (day TEXT, broadcaster TEXT, generated INTEGER, in_tokens INTEGER, out_tokens INTEGER, PRIMARY KEY (day, broadcaster));
  `);
  const q = sql => db.prepare(sql);
  return {
    db,
    createPage(b, session) { const r = q('INSERT INTO pages (broadcaster, created, session) VALUES (?, ?, ?)').run(b, Date.now(), session || null); return Number(r.lastInsertRowid); },
    page(id) { const r = q('SELECT * FROM pages WHERE id = ?').get(id); return r ? { ...r, events: JSON.parse(r.events) } : null; },
    savePage(id, events, asks) { q('UPDATE pages SET events = ?, asks = ? WHERE id = ?').run(JSON.stringify(events), asks, id); },
    listPages(b, { before = 1e15, limit = 10 } = {}) {
      return q('SELECT id, created, asks, events FROM pages WHERE broadcaster = ? AND hidden = 0 AND asks > 0 AND id < ? ORDER BY id DESC LIMIT ?').all(b, before, limit)
        .map(r => ({ ...r, events: JSON.parse(r.events) }));
    },
    countPages(b) { return q('SELECT COUNT(*) n FROM pages WHERE broadcaster = ? AND hidden = 0 AND asks > 0').get(b).n; },
    pageNumber(b, id) { return q('SELECT COUNT(*) n FROM pages WHERE broadcaster = ? AND hidden = 0 AND asks > 0 AND id <= ?').get(b, id).n; },
    hidePage(id, hidden = 1) { q('UPDATE pages SET hidden = ? WHERE id = ?').run(hidden, id); },
    track(b, type, { session, pageId, sourceId, dest, detail } = {}) {
      q('INSERT INTO events (ts, broadcaster, type, session, page_id, source_id, dest, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(Date.now(), b, type, session || null, pageId ?? null, sourceId || null, dest || null, detail ? JSON.stringify(detail) : null);
    },
    cached(b, key) { const r = q('SELECT answer FROM answer_cache WHERE broadcaster = ? AND qkey = ?').get(b, key); return r ? JSON.parse(r.answer) : null; },
    cache(b, key, answer) { q('INSERT OR REPLACE INTO answer_cache VALUES (?, ?, ?, ?)').run(b, key, JSON.stringify(answer), Date.now()); },
    spentToday(b) { return q('SELECT generated FROM spend WHERE day = ? AND broadcaster = ?').get(today(), b)?.generated || 0; },
    spend(b, usage) {
      q(`INSERT INTO spend VALUES (?, ?, 1, ?, ?) ON CONFLICT(day, broadcaster) DO UPDATE SET generated = generated + 1,
         in_tokens = in_tokens + excluded.in_tokens, out_tokens = out_tokens + excluded.out_tokens`).run(today(), b, usage?.input_tokens || 0, usage?.output_tokens || 0);
    },
    stats(b) {
      const one = (sql, ...a) => q(sql).get(b, ...a);
      const visitors = one(`SELECT COUNT(DISTINCT session) n FROM events WHERE broadcaster = ? AND type = 'notebook_view'`).n;
      const referrers = one(`SELECT COUNT(DISTINCT session) n FROM events WHERE broadcaster = ? AND type = 'source_link_clicked'`).n;
      return {
        uniqueVisitors: visitors,
        questionsAsked: one(`SELECT COUNT(*) n FROM events WHERE broadcaster = ? AND type = 'question_asked'`).n,
        answersDisplayed: one(`SELECT COUNT(*) n FROM events WHERE broadcaster = ? AND type = 'answer_displayed'`).n,
        sourceReferrals: one(`SELECT COUNT(*) n FROM events WHERE broadcaster = ? AND type = 'source_link_clicked'`).n,
        uniqueReferringVisitors: referrers,
        sourceReferralRate: visitors ? referrers / visitors : 0,
        pages: one(`SELECT COUNT(*) n FROM pages WHERE broadcaster = ? AND asks > 0`).n,
        hiddenPages: one(`SELECT COUNT(*) n FROM pages WHERE broadcaster = ? AND hidden = 1`).n,
        mostExplored: q(`SELECT source_id, COUNT(*) clicks FROM events WHERE broadcaster = ? AND type = 'source_link_clicked' GROUP BY source_id ORDER BY clicks DESC`).all(b),
        broadcastIdeaViews: one(`SELECT COUNT(*) n FROM events WHERE broadcaster = ? AND type = 'broadcast_idea_view'`).n,
        relatedSelected: one(`SELECT COUNT(*) n FROM events WHERE broadcaster = ? AND type = 'related_question_selected'`).n,
        spend: q('SELECT day, generated, in_tokens, out_tokens FROM spend WHERE broadcaster = ? ORDER BY day DESC LIMIT 14').all(b),
        questionTerms: q(`SELECT detail FROM events WHERE broadcaster = ? AND type = 'question_asked' ORDER BY id DESC LIMIT 500`).all(b).map(r => JSON.parse(r.detail || '{}')),
      };
    },
  };
}
const today = () => new Date().toISOString().slice(0, 10);
