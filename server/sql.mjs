/** One small async SQL interface over two backends, so the same store runs on Node (node:sqlite) and on
 * Cloudflare (D1). Both are SQLite; only the calling conventions differ. */

/** D1 binding -> sql */
export function d1Sql(db) {
  const st = (q, a) => db.prepare(q).bind(...a);
  return {
    run: async (q, ...a) => { const r = await st(q, a).run(); return { lastId: r.meta?.last_row_id, changes: r.meta?.changes }; },
    get: async (q, ...a) => (await st(q, a).first()) ?? undefined,
    all: async (q, ...a) => (await st(q, a).all()).results,
    batch: async list => db.batch(list.map(([q, ...a]) => st(q, a))),
  };
}
