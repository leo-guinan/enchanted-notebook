/** Grounded answers. Retrieval decides what the notebook may talk about; the model only phrases it.
 * Three paths, cheapest first:
 *   1. not enough evidence  -> an honest "the notebook doesn't hold that" (no model call)
 *   2. no API key / over the daily cap -> an extractive answer stitched from the curated summary
 *   3. otherwise -> Claude writes a short answer from the retrieved passages, as JSON, and every cited
 *      source is checked against the passages it was given (unknown ids are dropped; none left -> unsupported).
 */
import { search, rankSources } from './retrieve.mjs';

const MIN_SCORE = 2.2;

export function asciiForQuill(s) {
  return String(s).replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[—–]/g, ' - ').replace(/…/g, '...')
    .normalize('NFKD').replace(/[^\x20-\x7E\n]/g, '').replace(/[ \t]+/g, ' ').trim();
}

function unsupported(index, question) {
  const titles = [...index.byId.values()].map(s => s.title);
  return {
    text: "The notebook doesn't hold an answer to that. It only knows a handful of Packy's essays, and none of them speaks to this question.",
    explore: `Try asking about ${titles.slice(0, 3).join(', ')}, or browse Not Boring directly.`,
    sources: [], related: ['What is the Great Online Game?', 'What is a Liquid Super Team?'], supported: false, grounding: 'none',
  };
}

function extractive(index, ranked, hits) {
  const top = index.byId.get(ranked[0].id);
  const best = hits.find(h => h.source === top.id && h.kind !== 'summary');
  const first = top.summary.split(/(?<=\.)\s+/).slice(0, 2).join(' ');
  return {
    text: `From "${top.title}": ${first}`,
    explore: best ? (best.kind === 'quote' ? `In his words: "${best.text}"` : best.text) : '',
    sources: ranked.slice(0, 2).map(r => r.id), related: relatedFor(index, ranked[0].id), supported: true, grounding: 'extractive',
  };
}

function relatedFor(index, id) {
  const s = index.byId.get(id); const c = Object.keys(s.concepts || {});
  return c.slice(0, 2).map(k => `What does "${k}" mean?`);
}

const SYSTEM = `You are the Enchanted Notebook: an independent, unofficial tribute that helps visitors discover Packy McCormick's published essays at Not Boring. You are not Packy and never speak as him or claim his current opinions.
Answer ONLY from the passages provided. Each passage is labeled with a source id. Paraphrase; quote at most one short phrase, exactly as given. If the passages do not answer the question, say so plainly and set "supported": false.
Reply with JSON only, no prose around it:
{"answer": "2-4 plain sentences that directly answer", "explore": "optional: one or two sentences connecting the idea to another passage; label your own interpretation with 'One reading:'", "sources": ["ids of the passages you actually used, most relevant first, at most 3"], "related": ["one or two short follow-up questions the notebook could answer"], "supported": true}
Write in plain ASCII (straight quotes, no em dashes), warm and clear, no markdown.`;

export async function answerQuestion({ index, question, apiKey, model: modelId, baseUrl, maxTokens = 500, allowModel = true, fetchImpl }) {
  fetchImpl = fetchImpl || ((...a) => fetch(...a));
  const { hits, top, coverage = 0 } = search(index, question, 8);
  // most of the question's words must be ones the collection actually uses; the model gets a looser bar
  // because it can still say "not supported", the extractive path cannot
  const model = !!apiKey && allowModel;
  if (top < MIN_SCORE || !hits.length || coverage < (model ? 0.5 : 0.75)) return { ...unsupported(index, question), retrieval: { top, coverage, used: [] } };
  const ranked = rankSources(hits);
  const usable = new Set(ranked.slice(0, 3).map(r => r.id));
  const passages = hits.filter(h => usable.has(h.source));
  if (!apiKey || !allowModel) return { ...extractive(index, ranked, hits), retrieval: { top, used: [...usable] } };

  const context = passages.map(p => {
    const s = index.byId.get(p.source);
    return `[${p.source}] "${s.title}" (${s.published}) - ${p.kind}: ${p.text}`;
  }).join('\n');
  const body = { model: modelId, max_tokens: maxTokens, system: SYSTEM, messages: [{ role: 'user', content: `Passages:\n${context}\n\nVisitor's question: ${question}` }] };
  let out;
  try {
    const r = await fetchImpl(`${(baseUrl || 'https://api.anthropic.com').replace(/\/$/, '')}/v1/messages`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`model ${r.status}`);
    const j = await r.json();
    const text = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
    out = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    out.usage = j.usage;
  } catch (err) {
    return { ...extractive(index, ranked, hits), retrieval: { top, used: [...usable] }, fallback: String(err.message || err) };
  }
  // never trust the model's citations: keep only ids it was actually given
  const sources = (Array.isArray(out.sources) ? out.sources : []).filter(id => usable.has(id)).slice(0, 3);
  const supported = !!out.supported && sources.length > 0;
  if (!supported) return { ...unsupported(index, question), retrieval: { top, used: [...usable] }, usage: out.usage };
  return {
    text: asciiForQuill(out.answer || ''), explore: asciiForQuill(out.explore || ''), sources,
    related: (Array.isArray(out.related) ? out.related : []).slice(0, 2).map(asciiForQuill), supported: true, grounding: 'model',
    retrieval: { top, used: [...usable] }, usage: out.usage,
  };
}
