/** Keyword retrieval over a broadcaster's curated sources: each source is split into small passages (summary,
 * points, quotes, concept definitions) and scored with BM25. No embeddings, no services: the collection is
 * small and hand-curated, and every passage keeps a pointer to its source. */

const STOP = new Set('a an and are as at be but by can do does for from has have he her his how i if in into is it its me my of on or our so that the their them then there these they this to was we what when where which who why will with you your about would could should packy mccormick not boring essay essays notebook tell say said says mean means idea ideas'.split(' '));

export function tokens(s) {
  return String(s).toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').split(' ')
    .filter(w => w.length > 1 && !STOP.has(w)).map(stem);
}
function stem(w) { return w.length > 4 ? w.replace(/(ies)$/, 'y').replace(/(ing|ers|er|es|s)$/, '') : w; }

export function buildIndex(sources) {
  const passages = [];
  for (const s of sources) {
    const add = (kind, text, weight = 1) => passages.push({ source: s.id, kind, text, weight, toks: tokens(text + ' ' + (kind === 'summary' ? s.title + ' ' + (s.subtitle || '') + ' ' + s.themes.join(' ') : '')) });
    add('summary', s.summary, 1);
    for (const p of s.points || []) add('point', p, 1);
    for (const q of s.quotes || []) add('quote', q, 0.9);
    for (const [k, v] of Object.entries(s.concepts || {})) add('concept', `${k}: ${v}`, 1.3);
  }
  const df = new Map(); for (const p of passages) for (const t of new Set(p.toks)) df.set(t, (df.get(t) || 0) + 1);
  const avg = passages.reduce((a, p) => a + p.toks.length, 0) / passages.length;
  return { passages, df, avg, N: passages.length, byId: new Map(sources.map(s => [s.id, s])) };
}

export function search(index, query, k = 6) {
  const q = [...new Set(tokens(query))]; if (!q.length) return { hits: [], top: 0, terms: q };
  const k1 = 1.4, b = 0.75;
  const scored = index.passages.map(p => {
    let s = 0; const tf = new Map(); for (const t of p.toks) tf.set(t, (tf.get(t) || 0) + 1);
    for (const t of q) {
      const f = tf.get(t); if (!f) continue;
      const n = index.df.get(t) || 0, idf = Math.log(1 + (index.N - n + 0.5) / (n + 0.5));
      s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * p.toks.length / index.avg));
    }
    return { ...p, score: s * p.weight };
  }).filter(p => p.score > 0).sort((a, b) => b.score - a.score);
  const hits = scored.slice(0, k);
  return { hits, top: hits[0]?.score || 0, terms: q, coverage: q.filter(t => index.df.has(t)).length / q.length };
}

/** Rank sources by their best passages. */
export function rankSources(hits) {
  const m = new Map(); for (const h of hits) m.set(h.source, (m.get(h.source) || 0) + h.score);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([id, score]) => ({ id, score }));
}
