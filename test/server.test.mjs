import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/index.mjs';
import { buildIndex, search, rankSources } from '../server/retrieve.mjs';
import { answerQuestion, asciiForQuill } from '../server/answer.mjs';
import * as Fold from '../server/vendor/fold/index.js';
import { pageWorld, replayPage } from '../shared/page-world.mjs';
import http from 'node:http';
import { readFileSync } from 'node:fs';

const cfg = JSON.parse(readFileSync(new URL('../broadcasters/packy/broadcaster.json', import.meta.url)));
const index = buildIndex(cfg.sources);

test('every source has a real notboring.co URL, a date and a summary', () => {
  for (const s of cfg.sources) {
    assert.match(s.url, /^https:\/\/www\.notboring\.co\/p\/[a-z0-9-]+$/);
    assert.match(s.published, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(s.summary.length > 200 && s.summary.length < 1200, s.id);
    for (const q of s.quotes) assert.ok(q.split(' ').length <= 30, 'quotes stay short: ' + q);
  }
  for (const i of cfg.ideas) assert.ok(cfg.sources.some(s => s.id === i.source), i.source);
});

test('retrieval finds the right essay', () => {
  const top = q => rankSources(search(index, q).hits)[0]?.id;
  assert.equal(top('What are Liquid Super Teams?'), 'cooperation-economy');
  assert.equal(top('What is the Great Online Game?'), 'great-online-game');
  assert.equal(top('why would a trillion dollar company have one employee'), 'power-to-the-person');
  assert.equal(top('what kind of founders does his fund invest in'), 'introducing-not-boring-capital');
});

test('unsupported questions get an honest answer without a model call', async () => {
  let called = false;
  const a = await answerQuestion({ index, question: 'What is the best pizza in Chicago?', apiKey: 'k', model: 'm', fetchImpl: async () => { called = true; } });
  assert.equal(a.supported, false); assert.equal(called, false); assert.deepEqual(a.sources, []);
});

test('without a key the answer is extractive and cited', async () => {
  const a = await answerQuestion({ index, question: 'What are Liquid Super Teams?' });
  assert.equal(a.grounding, 'extractive'); assert.ok(a.sources.includes('cooperation-economy')); assert.ok(a.supported);
});

test('model citations are checked: invented sources are dropped, none left means unsupported', async () => {
  const fake = body => async () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(body) }], usage: { input_tokens: 10, output_tokens: 5 } }) });
  const good = await answerQuestion({ index, question: 'What are Liquid Super Teams?', apiKey: 'k', model: 'm',
    fetchImpl: fake({ answer: 'Teams that form and dissolve.', sources: ['cooperation-economy', 'made-up-essay'], related: ['x?'], supported: true }) });
  assert.deepEqual(good.sources, ['cooperation-economy']); assert.equal(good.grounding, 'model');
  const bad = await answerQuestion({ index, question: 'What are Liquid Super Teams?', apiKey: 'k', model: 'm',
    fetchImpl: fake({ answer: 'Something.', sources: ['made-up-essay'], supported: true }) });
  assert.equal(bad.supported, false);
});

test('a page is a fold log with the notebook rules', () => {
  const w = pageWorld(Fold, { sourceIds: ['a'], limits: { asksPerPage: 2, questionMaxChars: 20 } });
  const ans = (t, args) => w.emit({ t, dur: 2, actor: 'quill', op: 'ANSWER', frame: 'page', args });
  assert.equal(ans(0.5, { text: 'x', sources: ['a'], supported: true }).reason, 'nothing was asked');
  assert.equal(w.emit({ t: 1, dur: 0, actor: 'visitor', op: 'ASK', frame: 'page', args: { text: 'x'.repeat(30) } }).reason, 'questions are limited to 20 characters');
  assert.equal(w.emit({ t: 2, dur: 0, actor: 'visitor', op: 'ASK', frame: 'page', args: { text: 'hi?' } }).result, 'ok');
  assert.equal(w.emit({ t: 2.5, dur: 0, actor: 'visitor', op: 'ASK', frame: 'page', args: { text: 'again?' } }).reason, 'the quill is still writing');
  assert.equal(ans(3, { text: 'y', sources: ['nope'], supported: true }).reason, 'no such source: nope');
  assert.equal(ans(3.1, { text: 'y', sources: [], supported: true }).reason, 'a supported answer must cite a source');
  assert.equal(ans(3.2, { text: 'y', sources: ['a'], supported: true }).result, 'ok');
  w.emit({ t: 6, dur: 0, actor: 'visitor', op: 'ASK', frame: 'page', args: { text: 'two?' } }); ans(6.5, { text: 'z', sources: [], supported: false });
  assert.equal(w.emit({ t: 9, dur: 0, actor: 'visitor', op: 'ASK', frame: 'page', args: { text: 'three?' } }).reason, 'this page is full');
  const r = replayPage(Fold, { sourceIds: ['a'], limits: { asksPerPage: 2, questionMaxChars: 20 } }, w.log.events.map(e => ({ ...e })));
  assert.equal(r.report().mismatches.length, 0);
  const e = r.emit({ t: 10, dur: 0, actor: 'visitor', op: 'ASK', frame: 'page', args: { text: 'x' } });
  assert.ok(!w.log.events.some(x => x.id === e.id), 'replayed worlds continue the id sequence');
});

test('API: guest book flow, referral redirect, admin stats', async () => {
  const app = createApp({ DB_FILE: ':memory:', ADMIN_TOKEN: 'secret' });
  const srv = http.createServer(app.handle); await new Promise(r => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const j = async (path, init) => { const r = await fetch(base + path, init); return [r.status, r.status === 204 ? null : await r.json().catch(() => null), r]; };
  const post = (path, body) => j(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    await post('/api/events', { type: 'notebook_view', session: 's1' });
    const [c1, { page }] = await post('/api/pages', { session: 's1' }); assert.equal(c1, 201);
    let [, list] = await j('/api/pages'); assert.equal(list.total, 0, 'empty pages are not in the guest book');
    const [c2, out] = await post(`/api/pages/${page.id}/ask`, { session: 's1', question: 'What are Liquid Super Teams?' });
    assert.equal(c2, 200); const ev = out.page.events; assert.equal(ev.length, 2); assert.equal(ev[1].op, 'ANSWER'); assert.ok(ev[1].args.sources.length);
    const [c3, err] = await post(`/api/pages/${page.id}/ask`, { session: 'someone-else', question: 'hi' }); assert.equal(c3, 403);
    [, list] = await j('/api/pages'); assert.equal(list.total, 1); assert.equal(list.pages[0].number, 1);
    const r = await fetch(`${base}/r/cooperation-economy?s=s1&p=${page.id}&c=answer`, { redirect: 'manual' });
    assert.equal(r.status, 302); assert.equal(r.headers.get('location'), 'https://www.notboring.co/p/the-cooperation-economy-');
    assert.equal((await fetch(`${base}/r/not-a-source`, { redirect: 'manual' })).status, 404);
    const [c4] = await j('/api/admin/stats'); assert.equal(c4, 401);
    const [, st] = await j('/api/admin/stats?token=secret');
    assert.equal(st.uniqueVisitors, 1); assert.equal(st.questionsAsked, 1); assert.equal(st.sourceReferrals, 1); assert.equal(st.sourceReferralRate, 1);
    assert.equal(st.mostExplored[0].source_id, 'cooperation-economy');
    await j(`/api/admin/pages/${page.id}/hide?token=secret`, { method: 'POST' });
    [, list] = await j('/api/pages'); assert.equal(list.total, 0, 'hidden pages leave the guest book');
    const [c5] = await j('/shared/page-world.mjs'); assert.equal(c5, 200);
    const [c6] = await j('/../server/index.mjs'); assert.equal(c6, 404);
  } finally { srv.close(); }
});

test('quill text is plain ASCII', () => { assert.equal(asciiForQuill('“Don’t” — go…'), '"Don\'t" - go...'); });
