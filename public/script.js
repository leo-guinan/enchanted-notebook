/** The quill's hand: Hershey script glyphs laid out into joined strokes, a writer that reveals them in time,
 * and the enchanted quill itself. Ported from the Future Radio studio (the same glyphs, the same joined
 * cursive and the same quill), without the studio around it. */

let GLYPHS = null;
export async function loadGlyphs(url = '/glyphs.json') { GLYPHS = await (await fetch(url)).json(); return GLYPHS; }

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const lerp = (a, b, k) => a + (b - a) * k;
const lp = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const sstep = x => { x = clamp(x); return x * x * (3 - 2 * x); };

function glyphOf(ch) {
  if (ch === '—' || ch === '–') return { w: 24, s: [[[1, 16], [12, 15.6], [23, 16]]] };
  if (ch === '’' || ch === '‘') ch = "'"; if (ch === '“' || ch === '”') ch = '"';
  return GLYPHS[ch] || GLYPHS['?'];
}
function advOf(g, ch) {
  if (ch === ' ') return 11; if (!g || !g.s.length) return g ? g.w : 11;
  let m = -1e9; for (const s of g.s) for (const p of s) m = Math.max(m, p[0]);
  return m + (/[a-z]/.test(ch) ? 0 : 2.5);
}
function catmull(pts, n = 3) {
  if (pts.length < 3) return pts.map(p => [p[0], p[1]]);
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = j => .5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
      out.push([f(0), f(1)]);
    }
  }
  out.push([pts[pts.length - 1][0], pts[pts.length - 1][1]]);
  return out;
}

/** Lay text out into strokes within a width. Layout happens before the quill starts, so it never runs off the page. */
export function layoutScript(text, { width, size = .72, lineH = 30, paraGap = 12, x0 = 4, y0 = 26 }) {
  const lines = []; let y = y0;
  const wordW = w => [...w].reduce((a, ch) => a + advOf(ch === ' ' ? null : glyphOf(ch), ch), 0) * size;
  for (const para of String(text).replace(/\r/g, '').split('\n')) {
    if (!para.trim()) continue;
    if (lines.length) y += paraGap;
    const words = para.trim().split(/\s+/); let cur = [];
    const flush = () => { if (!cur.length) return; lines.push({ text: cur.join(' '), y }); y += lineH; cur = []; };
    for (const w of words) { if (cur.length && wordW([...cur, w].join(' ')) > width - x0 * 2) flush(); cur.push(w); }
    flush();
  }
  const strokes = [];
  for (const L of lines) {
    let x = x0, newWord = false; const raw = [], pre = [];
    for (const ch of L.text) {
      if (ch === ' ') { newWord = true; x += advOf(null, ' ') * size; continue; }
      const g = glyphOf(ch);
      g.s.forEach((s, k) => {
        const pts = s.map(p => [x + p[0] * size, L.y + (p[1] - 22) * size]);
        const pause = k === 0 && newWord ? .12 : (k === 0 && /[,.;:!?]/.test(ch) ? .05 : 0);
        // joined cursive: a stroke that starts where the last one ended continues it
        const prev = raw[raw.length - 1];
        if (prev && !pause && dist(prev[prev.length - 1], pts[0]) < 1.6 * size) raw[raw.length - 1] = prev.concat(pts.slice(1));
        else { raw.push(pts); pre.push(pause); }
      });
      newWord = false; x += advOf(g, ch) * size;
    }
    raw.forEach((pts, i) => strokes.push({ pts: pts.length > 1 ? catmull(pts, 3) : [pts[0], [pts[0][0] + .5, pts[0][1] + .5]], pre: (i === 0 ? .18 : 0) + pre[i] }));
  }
  for (const s of strokes) { let L = 0; s.cum = [0]; for (let i = 1; i < s.pts.length; i++) { L += dist(s.pts[i - 1], s.pts[i]); s.cum.push(L); } s.len = L; }
  return { strokes, height: y - lineH + 16 };
}

/** Reveal strokes over `dur` seconds: pauses where the pen lifts, constant speed while it writes. */
export class Writer {
  constructor(canvas, layout, { dur = 6, ink = '#2a1f16', width = 1.5 } = {}) {
    Object.assign(this, { canvas, layout, dur, ink, width });
    const lift = .06, P = layout.strokes.reduce((a, s) => a + s.pre + lift, 0), L = layout.strokes.reduce((a, s) => a + s.len, 0) || 1;
    const ps = Math.min(1, dur * .35 / Math.max(1e-6, P)), k = Math.max(.1, dur - P * ps) / L;
    let t = 0; this.segs = layout.strokes.map(s => { const lift0 = t, a = t + (s.pre + lift) * ps, b = a + s.len * k; t = b; return { s, a, b, lift0 }; });
    this.total = t || .01; this.scale = 1;
  }
  /** Draw everything written by time u (seconds since the writing began). Returns the pen tip and whether it touches. */
  draw(u) {
    const c = this.canvas, g = c.getContext('2d'), dpr = c.width / c.clientWidth || 1;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, c.clientWidth, c.clientHeight);
    g.lineCap = 'round'; g.lineJoin = 'round';
    const T = u / this.scale; let tip = null, touching = false, prevEnd = null;
    g.beginPath();
    for (const sg of this.segs) {
      const { s, a, b } = sg;
      if (T < a) { if (!tip) { const p0 = s.pts[0]; const f = prevEnd ? sstep((T - sg.lift0) / Math.max(1e-6, a - sg.lift0)) : 1; tip = prevEnd ? lp(prevEnd, p0, f) : p0; tip = [tip[0], tip[1] - 7 * Math.sin(Math.PI * f)]; } break; }
      const f = clamp((T - a) / Math.max(1e-6, b - a)), want = f * s.len;
      g.moveTo(s.pts[0][0], s.pts[0][1]);
      let i = 1; for (; i < s.pts.length && s.cum[i] <= want; i++) g.lineTo(s.pts[i][0], s.pts[i][1]);
      if (f < 1 && i < s.pts.length) { const r = (want - s.cum[i - 1]) / Math.max(1e-6, s.cum[i] - s.cum[i - 1]); const p = lp(s.pts[i - 1], s.pts[i], r); g.lineTo(p[0], p[1]); tip = p; touching = true; break; }
      prevEnd = s.pts[s.pts.length - 1];
    }
    // a soft halo of paper under the ink, then the ink
    g.strokeStyle = 'rgba(243,234,214,.8)'; g.lineWidth = this.width + 1.6; g.stroke();
    g.strokeStyle = this.ink; g.lineWidth = this.width; g.stroke();
    return { tip: tip || prevEnd, touching, done: T >= this.total };
  }
}

/** The enchanted quill (from the Future Radio studio), drawn at a pen tip. */
const QS = .72;
const Lp = (x1, y1, x2, y2, n = 6) => Array.from({ length: n + 1 }, (_, i) => [lerp(x1, x2, i / n), lerp(y1, y2, i / n)]);
const Qb = (a, b, c, n = 12) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n; return [(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * b[0] + t * t * c[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * b[1] + t * t * c[1]]; });
const Poly = (pts, n = 5) => { const p = []; for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < n; k++) p.push(lp(pts[i], pts[i + 1], k / n)); p.push(pts[pts.length - 1]); return p; };
const QAX = (() => {
  const S = pl => pl.map(p => [p[0] * QS, p[1] * QS]);
  const st = [Poly([[-3.2, -15], [0, 0], [3.2, -15], [-3.2, -15]], 4), Lp(0, -3, 0, -11, 3), Qb([0, -15], [3, -80], [9, -150], 18), Qb([1, -38], [-17, -92], [8, -148], 16), Qb([2, -42], [15, -102], [9, -150], 16),
    ...[50, 64, 78, 92, 106, 120].map((d, i) => Lp(1.2 + d * .04, -d, -9 + i * .9, -d - 10, 2)), ...[56, 72, 88, 104].map(d => Lp(1.4 + d * .045, -d, 11, -d - 8, 2))].map(S);
  const fill = S([...Qb([1, -38], [-17, -92], [8, -148], 16), ...Qb([9, -150], [15, -102], [2, -42], 16)]);
  return { strokes: st, fills: [[fill, '#f1ebdc'], [S([[-3.2, -15], [0, 0], [3.2, -15]]), '#9aa0a3']] };
})();
const rot = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];

export function drawQuill(g, tip, ang, { lifted = 0, glow = 0, scale = 1 } = {}) {
  const M = p => { const q = rot([p[0] * scale, p[1] * scale], ang); return [tip[0] + q[0], tip[1] + q[1] - lifted]; };
  if (glow > 0) { const r = g.createRadialGradient(tip[0], tip[1] - 40, 2, tip[0], tip[1] - 40, 90); r.addColorStop(0, `rgba(255,222,150,${.35 * glow})`); r.addColorStop(1, 'rgba(255,222,150,0)'); g.fillStyle = r; g.fillRect(tip[0] - 100, tip[1] - 140, 200, 200); }
  g.save(); g.filter = 'blur(3px)'; g.globalAlpha = .16; g.fillStyle = '#1a140f';
  const sh = [10 + lifted * .4, 12 + lifted * .6]; g.beginPath(); QAX.fills[0][0].forEach((p, i) => { const q = M(p); i ? g.lineTo(q[0] + sh[0], q[1] + sh[1] + lifted) : g.moveTo(q[0] + sh[0], q[1] + sh[1] + lifted); }); g.closePath(); g.fill(); g.restore();
  for (const [pts, col] of QAX.fills) { g.globalAlpha = .96; g.fillStyle = col; g.beginPath(); pts.forEach((p, i) => { const q = M(p); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.closePath(); g.fill(); }
  g.globalAlpha = 1; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath();
  for (const s of QAX.strokes) s.forEach((p, i) => { const q = M(p); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); });
  g.strokeStyle = 'rgba(243,234,214,.85)'; g.lineWidth = 2.6; g.stroke(); g.strokeStyle = 'rgba(46,42,38,.9)'; g.lineWidth = 1.2; g.stroke();
}
