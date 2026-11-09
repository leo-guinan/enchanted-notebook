/** A guest-book page is a fold log. The same world runs on the server (to accept or refuse each entry before
 * it is stored) and in the browser (to replay the page and time the quill). Its rules are the notebook's
 * promises: a visitor asks one thing at a time, a page holds a few questions, and an answer may only cite
 * sources the notebook actually holds; a supported answer must cite at least one.
 *
 *   import { pageWorld } from './page-world.mjs';
 *   const world = pageWorld(Fold, { sourceIds, limits });   // Fold: the fold engine (ESM namespace or IIFE global)
 *   world.emit({ t, dur: 0, actor: 'visitor', op: 'ASK', frame: 'page', args: { text } });
 */

export const PAGE_W = 600, PAGE_H = 860;

/** How long the quill takes to write an answer, from its length (seconds). */
export function writingTime(text) {
  const n = String(text || '').length;
  return Math.min(16, Math.max(2.5, n / 26));
}

export function pageWorld(Fold, { sourceIds, limits = {} }) {
  const known = new Set(sourceIds);
  const maxChars = limits.questionMaxChars ?? 240, perPage = limits.asksPerPage ?? 5;
  return new Fold.World({
    initial: () => ({ entries: [], asks: 0, pending: null, ideas: [] }),
    root: { id: 'page', parent: null, x: 0, y: 0, w: PAGE_W, h: PAGE_H, lw: PAGE_W, lh: PAGE_H },
    ops: {
      ASK: {
        check: (S, e) => {
          const text = String(e.args?.text ?? '').trim();
          if (!text) return 'nothing was asked';
          if (text.length > maxChars) return `questions are limited to ${maxChars} characters`;
          if (S.pending) return 'the quill is still writing';
          if (S.asks >= perPage) return 'this page is full';
          return null;
        },
        apply: (S, e) => { S.asks++; S.pending = e.id; S.entries.push({ kind: 'ask', id: e.id, t: e.t, text: String(e.args.text).trim() }); },
      },
      ANSWER: {
        check: (S, e) => {
          const a = e.args || {};
          if (!S.pending) return 'nothing was asked';
          if (!String(a.text ?? '').trim()) return 'an answer needs words';
          for (const s of a.sources || []) if (!known.has(s)) return `no such source: ${s}`;
          if (a.supported && !(a.sources || []).length) return 'a supported answer must cite a source';
          return null;
        },
        apply: (S, e, p) => {
          S.pending = null;
          const a = e.args;
          S.entries.push({ kind: 'answer', id: e.id, t: e.t, dur: e.dur, p, text: a.text, explore: a.explore || '', sources: a.sources || [], related: a.related || [], supported: !!a.supported, grounding: a.grounding });
        },
      },
    },
  });
}

/** Rebuild a page's world from its stored events (as the server stores them). */
export function replayPage(Fold, opts, events) {
  const w = pageWorld(Fold, opts);
  for (const e of events) w.log.add({ ...e });
  // continue the id sequence after the stored events, so new entries never reuse an id
  w.log.next = 1 + events.reduce((m, e) => Math.max(m, Number(String(e.id).slice(1)) || 0), 0);
  return w;
}
