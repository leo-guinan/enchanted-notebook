/** node:sqlite backend for sql.mjs's interface (Node only; the Worker uses d1Sql). */
/** node:sqlite file (or ':memory:') -> sql; applies the migrations on open */
export async function nodeSql(file, migrations) {
  const { DatabaseSync } = await import('node:sqlite');
  if (file !== ':memory:') { const { mkdirSync } = await import('node:fs'); const { dirname } = await import('node:path'); mkdirSync(dirname(file), { recursive: true }); }
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;'); for (const m of migrations) db.exec(m);
  const prep = new Map(); const st = q => prep.get(q) || (prep.set(q, db.prepare(q)), prep.get(q));
  return {
    run: async (q, ...a) => { const r = st(q).run(...a); return { lastId: Number(r.lastInsertRowid), changes: r.changes }; },
    get: async (q, ...a) => st(q).get(...a),
    all: async (q, ...a) => st(q).all(...a),
    batch: async list => { for (const [q, ...a] of list) st(q).run(...a); },
  };
}
