/** The notebook on Cloudflare: static files from Workers Static Assets (free, never reach this code),
 * the API from the same app the Node server runs, storage in D1.
 * Bindings (wrangler.toml): ASSETS, DB. Secrets: ANTHROPIC_API_KEY, ADMIN_TOKEN, RATE_SALT (optional). */
import { createApp } from '../server/app.mjs';
import { d1Sql } from '../server/sql.mjs';
import packy from '../broadcasters/packy/broadcaster.json';

const BROADCASTERS = { packy };
let app = null, appEnv = null;

export default {
  async fetch(request, env, ctx) {
    if (!app || appEnv !== env) { app = createApp({ cfg: BROADCASTERS[env.BROADCASTER || 'packy'], sql: d1Sql(env.DB), env }); appEnv = env; }
    const res = await app.fetch(request);
    return res ?? env.ASSETS.fetch(request);
  },
};
