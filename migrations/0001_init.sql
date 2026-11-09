-- The notebook's tables. Applied by `wrangler d1 migrations apply` on Cloudflare and at startup by the Node server.
CREATE TABLE IF NOT EXISTS pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, broadcaster TEXT NOT NULL, created INTEGER NOT NULL,
  session TEXT, events TEXT NOT NULL DEFAULT '[]', asks INTEGER NOT NULL DEFAULT 0, hidden INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS pages_list ON pages(broadcaster, hidden, asks, id);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, broadcaster TEXT NOT NULL, type TEXT NOT NULL,
  session TEXT, page_id INTEGER, source_id TEXT, dest TEXT, detail TEXT);
CREATE INDEX IF NOT EXISTS events_type ON events(broadcaster, type);
CREATE TABLE IF NOT EXISTS answer_cache (broadcaster TEXT, qkey TEXT, answer TEXT, created INTEGER, PRIMARY KEY (broadcaster, qkey));
CREATE TABLE IF NOT EXISTS spend (day TEXT, broadcaster TEXT, generated INTEGER, in_tokens INTEGER, out_tokens INTEGER, PRIMARY KEY (day, broadcaster));
CREATE TABLE IF NOT EXISTS rate (bucket TEXT PRIMARY KEY, n INTEGER NOT NULL, expires INTEGER NOT NULL);
