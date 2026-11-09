/** The notebook: two pages on a desk. On the right, your page: type a question in terminal lettering and the
 * quill writes the answer in script, with links to the original essays. On the left, the guest book: every
 * earlier visitor's page. Each page is a fold log (shared/page-world.mjs), so the browser replays exactly
 * what the server accepted, under the same rules. */
import { pageWorld, replayPage } from '/shared/page-world.mjs';
import { loadGlyphs, layoutScript, Writer, drawQuill } from '/script.js';

const $ = s => document.querySelector(s);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
const sstore = { get: k => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} }, del: k => { try { sessionStorage.removeItem(k); } catch {} } };
const session = store.get('en.session') || (() => { const s = (crypto.randomUUID?.() || String(Math.random()).slice(2)); store.set('en.session', s); return s; })();

const api = async (path, init) => {
  const r = await fetch(path, init ? { ...init, headers: { 'content-type': 'application/json' } } : undefined);
  const j = r.status === 204 ? null : await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j?.error || `HTTP ${r.status}`), { status: r.status });
  return j;
};
const track = (type, extra = {}) => { try { navigator.sendBeacon?.('/api/events', new Blob([JSON.stringify({ type, session, ...extra })], { type: 'application/json' })) || api('/api/events', { method: 'POST', body: JSON.stringify({ type, session, ...extra }) }).catch(() => {}); } catch {} };

let CFG, OPTS, SOURCES;
const fmtDate = ms => new Date(ms).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });

/* ---------- writing and the quill ---------- */
const quillCv = $('#quill'), book = $('#book');
const writers = new Set(); let raf = 0;
const Q = { tip: null, ang: .95, lifted: 0, glow: 0, mode: 'rest' };

function sizeCanvas(c, h) { const dpr = Math.min(2, devicePixelRatio || 1); c.style.height = h + 'px'; c.width = Math.round(c.clientWidth * dpr); c.height = Math.round(h * dpr); }
function scriptBlock(text, { animate, dur, onDone } = {}) {
  const wrap = document.createElement('div'); wrap.className = 'a';
  const c = document.createElement('canvas'); c.setAttribute('aria-hidden', 'true'); wrap.appendChild(c);
  const sr = document.createElement('p'); sr.className = 'sr-only'; sr.textContent = text; wrap.appendChild(sr);
  let lastW = 0, wr = null, wantAnim = animate;
  const layoutNow = () => {
    const w = c.clientWidth; if (!w) return;            // hidden (the other tab on a phone): lay out when it shows
    lastW = w; const size = w < 380 ? .62 : .72, lineH = w < 380 ? 26 : 30;
    const lay = layoutScript(text, { width: w, size, lineH }); sizeCanvas(c, lay.height);
    const anim = wantAnim && !reduced; wantAnim = false;
    wr = new Writer(c, lay, { dur: anim ? dur : 0.001 });
    if (!anim) { wr.draw(1e9); if (animate) onDone?.(); return; }
    wr.t0 = performance.now(); wr.onDone = onDone; wr.canvas = c; writers.add(wr); kick();
  };
  wrap._mount = layoutNow;
  // re-lay the script when the page changes width (or first becomes visible); never mid-writing
  new ResizeObserver(() => { const w = c.clientWidth; if (w && Math.abs(w - lastW) > 1 && !(wr && writers.has(wr))) layoutNow(); }).observe(c);
  return wrap;
}
function finishAll() { for (const w of writers) w.t0 = -1e9; kick(); }

function quillRest() {
  const r = book.getBoundingClientRect(), qr = quillCv.getBoundingClientRect(), mine = $('#mine').getBoundingClientRect();
  const vis = mine.width ? mine : r;
  return [vis.right - qr.left - (vis.width < 500 ? 64 : 34), vis.top - qr.top + 150];
}
function frame(now) {
  raf = 0;
  const qr = quillCv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  if (quillCv.width !== Math.round(qr.width * dpr)) { quillCv.width = Math.round(qr.width * dpr); quillCv.height = Math.round(qr.height * dpr); }
  const g = quillCv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, qr.width, qr.height);
  let active = null;
  for (const w of [...writers]) {
    const u = (now - w.t0) / 1000; const st = w.draw(u);
    if (st.done) { writers.delete(w); w.onDone?.(); continue; }
    if (!active) { const cr = w.canvas.getBoundingClientRect(); active = { tip: [cr.left - qr.left + st.tip[0], cr.top - qr.top + st.tip[1]], touching: st.touching }; }
  }
  const rest = quillRest();
  if (active) { Q.mode = 'write'; Q.tip = Q.tip ? [Q.tip[0] + (active.tip[0] - Q.tip[0]) * .6, Q.tip[1] + (active.tip[1] - Q.tip[1]) * .6] : active.tip; Q.ang += (.55 - Q.ang) * .2; Q.lifted += ((active.touching ? 0 : 6) - Q.lifted) * .3; Q.glow += (1 - Q.glow) * .1; }
  else if (Q.mode === 'think') { const t = now / 1000; const p = Q.thinkAt || rest; const goal = [p[0] + Math.sin(t * 1.3) * 6, p[1] - 30 + Math.sin(t * 1.9) * 5]; Q.tip = Q.tip ? [Q.tip[0] + (goal[0] - Q.tip[0]) * .08, Q.tip[1] + (goal[1] - Q.tip[1]) * .08] : goal; Q.ang += (.45 - Q.ang) * .08; Q.lifted = 10; Q.glow += (.8 - Q.glow) * .08; }
  else { Q.mode = 'rest'; const goal = rest; Q.tip = Q.tip ? [Q.tip[0] + (goal[0] - Q.tip[0]) * .12, Q.tip[1] + (goal[1] - Q.tip[1]) * .12] : goal; Q.ang += (.95 - Q.ang) * .12; Q.lifted += (0 - Q.lifted) * .15; Q.glow += (0 - Q.glow) * .1; }
  drawQuill(g, Q.tip, Q.ang, { lifted: Q.lifted, glow: Q.glow });
  const settling = Q.mode === 'rest' && (Math.hypot(Q.tip[0] - rest[0], Q.tip[1] - rest[1]) > .5 || Q.glow > .02);
  $('#skip').hidden = !writers.size;
  if (writers.size || Q.mode === 'think' || settling) raf = requestAnimationFrame(frame);   // idle: no frames at all
}
const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
addEventListener('resize', () => { Q.tip = null; kick(); });
$('#skip').addEventListener('click', () => { finishAll(); track('answer_skipped', { pageId: MY?.id }); });

/* ---------- rendering a page's conversation ---------- */
const srcLink = (id, ctx, pageId) => { const s = SOURCES.get(id); const a = document.createElement('a'); a.href = `/r/${id}?s=${encodeURIComponent(session)}&p=${pageId || ''}&c=${ctx}`; a.target = '_blank'; a.rel = 'noopener'; a.textContent = s.title; a.title = `${s.title} by ${s.author} (Not Boring, ${s.published.slice(0, 4)})`; return a; };

function entryNodes(e, { pageId, animate, onAsk }) {
  if (e.kind === 'ask') { const p = document.createElement('p'); p.className = 'q'; p.textContent = e.text; return [p]; }
  const frag = document.createElement('div'); frag.className = 'answer' + (animate ? ' pending' : '');
  const text = e.text + (e.explore ? '\n' + e.explore : '');
  const sb = scriptBlock(text, { animate, dur: e.dur, onDone: () => { frag.classList.remove('pending'); if (animate) { track('answer_displayed', { pageId, detail: { sources: e.sources, supported: e.supported } }); $('#live').textContent = text; afterAnswer(); } } });
  frag.appendChild(sb);
  const cite = document.createElement('p'); cite.className = 'cite';
  if (e.sources.length) { const l = document.createElement('span'); l.className = 'lead'; l.textContent = e.sources.length > 1 ? 'Read the originals:' : 'Read the original:'; cite.appendChild(l); e.sources.forEach((id, i) => { if (i) cite.append(' · '); cite.appendChild(srcLink(id, 'answer', pageId)); }); }
  else { const u = document.createElement('span'); u.className = 'unsupported'; u.textContent = 'Nothing in the notebook supports an answer to this.'; cite.appendChild(u); }
  frag.appendChild(cite);
  for (const r of e.related || []) { const b = document.createElement('button'); b.type = 'button'; b.className = 'related'; b.textContent = r; b.addEventListener('click', () => { track('related_question_selected', { pageId }); onAsk(r); }); frag.appendChild(b); }
  return [frag];
}
function renderPage(container, events, { pageId, animateIds = new Set(), onAsk }) {
  const st = replayPage(window.Fold, OPTS, events).stateAt(Infinity);
  container.replaceChildren();
  const mount = [];
  for (const e of st.entries) for (const n of entryNodes(e, { pageId, animate: animateIds.has(e.id), onAsk })) { container.appendChild(n); n.querySelectorAll?.('.a').forEach(a => mount.push(a)); if (n.classList?.contains('a')) mount.push(n); }
  requestAnimationFrame(() => { for (const a of mount) a._mount(); });
  return st;
}

/* ---------- the guest book (left) ---------- */
const GB = { pages: [], i: 0, total: 0, done: false };
async function loadGuest(more = false) {
  const before = more && GB.pages.length ? GB.pages[GB.pages.length - 1].id : '';
  const r = await api(`/api/pages?limit=8${before ? '&before=' + before : ''}`);
  GB.total = r.total; const add = r.pages.filter(p => p.id !== MY?.id && !GB.pages.some(q => q.id === p.id));
  GB.pages.push(...add); if (r.pages.length < 8) GB.done = true;
}
function showGuest() {
  const body = $('#guest-body'), p = GB.pages[GB.i];
  $('#older').disabled = GB.i >= GB.pages.length - 1 && GB.done; $('#newer').disabled = GB.i <= 0;
  $('#guest-count').textContent = GB.total ? `${GB.total} page${GB.total === 1 ? '' : 's'} signed` : '';
  if (!p) { $('#guest-folio').textContent = 'The guest book'; $('#guest-when').textContent = ''; body.innerHTML = '<p class="empty">No one has signed the notebook yet. Yours will be the first page.</p>'; return; }
  $('#guest-folio').textContent = `Page ${p.number}`; $('#guest-when').textContent = `a visitor, ${fmtDate(p.created)}`;
  renderPage(body, p.events, { pageId: p.id, onAsk: q => { setTab('mine'); ask(q); } });
  body.scrollTop = 0;
}
$('#older').addEventListener('click', async () => { if (GB.i >= GB.pages.length - 1 && !GB.done) await loadGuest(true); if (GB.i < GB.pages.length - 1) { GB.i++; showGuest(); track('page_turned', { pageId: GB.pages[GB.i].id }); } });
$('#newer').addEventListener('click', () => { if (GB.i > 0) { GB.i--; showGuest(); track('page_turned', { pageId: GB.pages[GB.i].id }); } });

/* ---------- your page (right) ---------- */
let MY = null, ASKING = false;
const convo = $('#convo'), input = $('#q'), form = $('#ask');
function myHeader() { $('#mine-folio').textContent = MY ? `Page ${MY.number || GB.total + 1}` : `Page ${GB.total + 1}`; $('#mine-when').textContent = `you, ${fmtDate(Date.now())}`; }
function asksLeft() { if (!MY) return CFG.limits.asksPerPage; const st = replayPage(window.Fold, OPTS, MY.events).stateAt(Infinity); return CFG.limits.asksPerPage - st.asks; }
function afterAnswer() {
  Q.mode = writers.size ? Q.mode : 'rest'; kick();
  const left = asksLeft();
  if (left <= 0) {
    form.classList.add('full'); form.innerHTML = '';
    const p = document.createElement('span'); p.textContent = 'This page is full. Thank you for signing the notebook. '; form.appendChild(p);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'turn'; b.textContent = 'start a new page'; b.addEventListener('click', () => { sstore.del('en.page'); location.reload(); }); form.appendChild(b);
  } else { input.disabled = false; form.querySelector('.send').disabled = false; input.placeholder = left === 1 ? 'one more question for this page' : 'ask another question'; if (matchMedia('(pointer:fine)').matches) input.focus(); }
}
function showError(msg) { const p = document.createElement('p'); p.className = 'err'; p.textContent = '! ' + msg; convo.appendChild(p); $('#mine-body').scrollTop = 1e9; }

async function ask(text) {
  text = String(text || '').trim(); if (!text || ASKING) return;
  ASKING = true; input.value = ''; input.disabled = true; form.querySelector('.send').disabled = true;
  hideIdea();
  const q = document.createElement('p'); q.className = 'q'; q.textContent = text; convo.appendChild(q);
  $('#mine-body').scrollTop = 1e9;
  const qr = quillCv.getBoundingClientRect(), r = q.getBoundingClientRect(); Q.mode = 'think'; Q.thinkAt = [r.left - qr.left + 60, r.bottom - qr.top + 40]; kick();
  try {
    if (!MY) { MY = (await api('/api/pages', { method: 'POST', body: JSON.stringify({ session }) })).page; sstore.set('en.page', String(MY.id)); }
    const before = new Set(MY.events.map(e => e.id));
    const out = await api(`/api/pages/${MY.id}/ask`, { method: 'POST', body: JSON.stringify({ session, question: text }) });
    MY = out.page; myHeader();
    const fresh = new Set(MY.events.filter(e => !before.has(e.id)).map(e => e.id));
    Q.mode = 'write';
    renderPage(convo, MY.events, { pageId: MY.id, animateIds: fresh, onAsk: ask });
    $('#mine-body').scrollTop = 1e9;
  } catch (err) {
    Q.mode = 'rest'; kick(); showError(err.message || 'the notebook could not answer'); input.disabled = false; form.querySelector('.send').disabled = false;
  } finally { ASKING = false; }
}
form.addEventListener('submit', e => { e.preventDefault(); ask(input.value); });

/* ---------- the ambient broadcast: one idea at a time, written once, no motion when idle ---------- */
let ideaI = 0, ideaTimer = 0;
function showIdea(i, animate = true) {
  if (convo.childElementCount) return;
  const box = $('#idea'); box.classList.remove('faded'); box.replaceChildren();
  const idea = CFG.ideas[i % CFG.ideas.length], s = SOURCES.get(idea.source);
  const label = document.createElement('p'); label.className = 'label'; label.textContent = 'From the notebook'; box.appendChild(label);
  const sb = scriptBlock(idea.text, { animate: animate && !reduced, dur: Math.min(7, idea.text.length / 22) }); box.appendChild(sb);
  const from = document.createElement('p'); from.className = 'from'; from.append('from '); from.appendChild(srcLink(idea.source, 'idea')); from.append(`, Not Boring, ${s.published.slice(0, 4)}`); box.appendChild(from);
  requestAnimationFrame(() => sb._mount());
  track('broadcast_idea_view', { sourceId: idea.source });
  clearTimeout(ideaTimer);
  if (!reduced && CFG.broadcast.rotateSeconds) ideaTimer = setTimeout(function next() {
    if (document.hidden || document.activeElement === input || convo.childElementCount) { ideaTimer = setTimeout(next, 15000); return; }
    showIdea(++ideaI);
  }, CFG.broadcast.rotateSeconds * 1000);
}
function hideIdea() { clearTimeout(ideaTimer); $('#idea').classList.add('faded'); $('#next-idea').hidden = true; }
$('#next-idea').addEventListener('click', () => showIdea(++ideaI));

/* ---------- tabs (one page at a time on phones) ---------- */
function setTab(which) { book.dataset.show = which; document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.show === which))); Q.tip = null; kick(); }
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.show)));

/* ---------- start ---------- */
(async function start() {
  [CFG] = await Promise.all([api('/api/config'), loadGlyphs(), document.fonts?.ready]);
  SOURCES = new Map(CFG.sources.map(s => [s.id, s]));
  OPTS = { sourceIds: CFG.sources.map(s => s.id), limits: CFG.limits };
  $('#invitation').textContent = CFG.invitation; $('#notice').textContent = CFG.notice;
  const sl = $('#sources-line'); sl.append('In the notebook: ');
  CFG.sources.forEach((s, i) => { if (i) sl.append(' · '); sl.appendChild(srcLink(s.id, 'colophon')); });
  input.maxLength = CFG.limits.questionMaxChars;
  track('notebook_view');
  const saved = Number(sstore.get('en.page'));
  if (saved) { try { MY = (await api(`/api/pages/${saved}`)).page; } catch { sstore.del('en.page'); } }
  await loadGuest().catch(() => {}); showGuest(); myHeader();
  if (MY && MY.events.length) { hideIdea(); renderPage(convo, MY.events, { pageId: MY.id, onAsk: ask }); afterAnswer(); }
  else { ideaI = Math.floor(Math.random() * CFG.ideas.length); showIdea(ideaI); }
  kick();
})();
