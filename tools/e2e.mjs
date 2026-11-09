/** End to end in a real browser: start the server on a scratch database, sign the guest book as two visitors,
 * then open the notebook on desktop and phone, ask questions, follow a source link, and read the referral
 * stats back. Screenshots go to out/e2e/.
 *
 *   node tools/e2e.mjs            (needs Playwright; uses extractive answers unless ANTHROPIC_API_KEY is set) */
import { createRequire } from 'node:module';
import http from 'node:http';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from '../server/index.mjs';

const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(join(process.env.NODE_PATH || '/usr/local/lib/node_modules_global', 'playwright')); }
const OUT = 'out/e2e'; rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });

// E2E_BASE=<url> runs against a server that's already up (e.g. `wrangler dev`); its ADMIN_TOKEN must be E2E_ADMIN (default e2e)
let srv = null, base = process.env.E2E_BASE;
if (!base) { const app = await createApp({ ...process.env, DB_FILE: ':memory:', ADMIN_TOKEN: 'e2e' }); srv = http.createServer(app.handle); await new Promise(r => srv.listen(0, r)); base = `http://127.0.0.1:${srv.address().port}`; }
const ADMIN = process.env.E2E_ADMIN || 'e2e';
const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());
const fail = []; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fail.push(msg); };

// two earlier visitors sign the guest book
for (const [s, qs] of [['visitor-a', ['What is the Great Online Game?', 'Why do people follow people?']], ['visitor-b', ['What are Liquid Super Teams?']]]) {
  const { page } = await post('/api/pages', { session: s });
  for (const q of qs) await post(`/api/pages/${page.id}/ask`, { session: s, question: q });
}

const browser = await pw.chromium.launch();
async function run(name, ctxOpts, steps) {
  const ctx = await browser.newContext(ctxOpts); const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base, { waitUntil: 'networkidle' }); await page.waitForTimeout(400);
  await steps(page);
  check(!errors.length, `${name}: no page errors ${errors.length ? JSON.stringify(errors) : ''}`);
  await ctx.close();
}
const waitWritten = async page => { await page.waitForSelector('#convo .answer'); await page.waitForFunction(() => !document.querySelector('.answer.pending') && document.querySelector('#skip').hidden && !document.querySelector('#q').disabled, null, { timeout: 30000 }); };

await run('desktop', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }, async page => {
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/1-desktop-idle.png` });
  check(await page.locator('#guest .q').count() > 0, 'desktop: the guest book shows an earlier visitor\'s page');
  await page.fill('#q', 'What are Liquid Super Teams?'); await page.keyboard.press('Enter');
  await page.waitForSelector('.answer.pending'); await page.waitForTimeout(1600);
  await page.screenshot({ path: `${OUT}/2-desktop-writing.png` });
  await waitWritten(page); await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/3-desktop-answered.png` });
  const link = page.locator('#convo .cite a').first();
  check(/\/r\/cooperation-economy/.test(await link.getAttribute('href')), 'desktop: the answer links to The Cooperation Economy through the referral redirect');
  const [pop] = await Promise.all([page.waitForEvent('popup'), link.click()]); await pop.waitForLoadState('commit').catch(() => {});
  check(/notboring\.co/.test(pop.url()), 'desktop: following the link lands on notboring.co (' + pop.url() + ')'); await pop.close();
  await page.fill('#q', 'What is the best pizza in Chicago?'); await page.keyboard.press('Enter'); await waitWritten(page); await page.waitForTimeout(300);
  check(await page.locator('#convo .unsupported').count() === 1, 'desktop: an unsupported question is answered honestly, with no source');
  await page.screenshot({ path: `${OUT}/4-desktop-two-questions.png` });
  await page.click('#older'); await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/5-desktop-older-page.png` });
});

await run('phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, async page => {
  await page.waitForTimeout(3000); await page.screenshot({ path: `${OUT}/6-phone-idle.png` });
  await page.fill('#q', 'What is the Great Online Game?'); await page.locator('.send').click(); await waitWritten(page); await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/7-phone-answered.png` });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check(overflow <= 0, 'phone: no horizontal scroll');
  await page.click('.tabs button[data-show="guest"]'); await page.waitForTimeout(500);
  check(await page.evaluate(() => [...document.querySelectorAll('#guest canvas')].every(c => c.width > 0 && c.height > 0)), 'phone: guest-book script is drawn when its tab opens'); await page.screenshot({ path: `${OUT}/8-phone-guestbook.png` });
});

await run('reduced motion', { viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' }, async page => {
  await page.fill('#q', 'What is a Solo Corporation?'); await page.keyboard.press('Enter');
  await page.waitForSelector('#convo .cite'); await page.waitForTimeout(300);
  check(await page.locator('.answer.pending').count() === 0, 'reduced motion: the answer appears at once');
});

const st = await fetch(`${base}/api/admin/stats`, { headers: { authorization: 'Bearer ' + ADMIN } }).then(r => r.json());
check(st.sourceReferrals >= 1 && st.uniqueVisitors >= 3 && st.pages >= 5, `admin stats: ${st.uniqueVisitors} visitors, ${st.questionsAsked} questions, ${st.sourceReferrals} referrals, ${st.pages} pages`);
await browser.close(); srv?.close();
console.log(fail.length ? `\n${fail.length} FAILED` : '\nall passed'); process.exit(fail.length ? 1 : 0);
