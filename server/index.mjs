/** Run the notebook on Node (local development, tests, or any VPS): the API from app.mjs plus static files.
 *
 *   ANTHROPIC_API_KEY=… ADMIN_TOKEN=… node server/index.mjs
 *
 * Env: PORT (8787), BROADCASTER (packy), DB_FILE (data/notebook.db), MODEL (claude-haiku-5-5),
 *      ANTHROPIC_API_KEY (unset = extractive answers only), ANTHROPIC_BASE_URL (e.g. an AI Gateway),
 *      ADMIN_TOKEN (unset = admin disabled). On Cloudflare the same app runs from worker/index.mjs. */
import http from 'node:http';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp as createCoreApp } from './app.mjs';
import { nodeSql } from './sql-node.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

export async function createApp(env = process.env) {
  const cfg = JSON.parse(readFileSync(join(ROOT, 'broadcasters', env.BROADCASTER || 'packy', 'broadcaster.json'), 'utf8'));
  const migrations = readdirSync(join(ROOT, 'migrations')).filter(f => f.endsWith('.sql')).sort().map(f => readFileSync(join(ROOT, 'migrations', f), 'utf8'));
  const sql = await nodeSql(env.DB_FILE || join(ROOT, 'data', 'notebook.db'), migrations);
  const core = createCoreApp({ cfg, sql, env });
  async function handle(req, res) {
    const url = `http://${req.headers.host || 'localhost'}${req.url}`;
    const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    if (!headers.get('x-forwarded-for') || env.TRUST_PROXY !== '1') headers.set('x-forwarded-for', req.socket.remoteAddress || '?');
    let body; if (req.method !== 'GET' && req.method !== 'HEAD') { const chunks = []; for await (const c of req) chunks.push(c); body = Buffer.concat(chunks); }
    const r = await core.fetch(new Request(url, { method: req.method, headers, body }));
    if (r) { res.writeHead(r.status, Object.fromEntries(r.headers)); return res.end(Buffer.from(await r.arrayBuffer())); }
    return serveStatic(new URL(url).pathname, res);
  }
  return { ...core, handle };
}

async function serveStatic(p, res) {
  const map = p === '/' ? '/index.html' : p === '/admin' ? '/admin.html' : p;
  const f = resolve(ROOT, 'public' + map);
  if (!f.startsWith(join(ROOT, 'public')) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('not found'); }
  res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream', 'cache-control': extname(f) === '.html' ? 'no-cache' : 'public, max-age=3600', 'x-content-type-options': 'nosniff' });
  res.end(await readFile(f));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = await createApp();
  const port = Number(process.env.PORT) || 8787;
  http.createServer(app.handle).listen(port, () => console.log(`enchanted notebook on http://localhost:${port} (${process.env.ANTHROPIC_API_KEY ? 'model: ' + (process.env.MODEL || 'claude-haiku-5-5') : 'extractive answers; set ANTHROPIC_API_KEY for generated ones'})`));
}
