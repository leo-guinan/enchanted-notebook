/** The log: an append-only list of events, kept in time order. It is the single source of truth: state,
 * frames, sound and pictures are all derived from it, so the same log always plays the same way. */
/** Time order, then insertion order. Ids are 'e<n>', so the numeric part is the insertion sequence. */
export const byTime = (a, b) => a.t - b.t || (+a.id.slice(1)) - (+b.id.slice(1));
export class Log {
    /** Every event, sorted by time. The array is mutated in place, so a reference to it stays valid. */
    events = [];
    /** Every event in the order it was added. */
    inserted = [];
    next = 1;
    /** Bumped on every change. Caches of anything derived from the log key on it. */
    version = 0;
    add(ev) {
        const e = ev;
        e.id = e.id || 'e' + (this.next++);
        e.result = e.result || 'ok';
        this.events.push(e);
        this.inserted.push(e);
        this.events.sort(byTime);
        this.version++;
        return e;
    }
    /** Mark the log changed after editing an event in place (for example, when it is denied). */
    touch() { this.version++; }
    clear() { this.events.length = 0; this.inserted.length = 0; this.next = 1; this.version++; }
    /** Drop everything after time t (for re-staging from a point). */
    keepUntil(t) {
        const keep = (a) => { const k = a.filter(e => e.t <= t); a.length = 0; a.push(...k); };
        keep(this.events);
        keep(this.inserted);
        this.version++;
    }
    snapshot() { return { events: this.events.slice(), inserted: this.inserted.slice(), next: this.next }; }
    restore(s) {
        this.events.length = 0;
        this.events.push(...s.events);
        this.inserted.length = 0;
        this.inserted.push(...s.inserted);
        this.next = s.next;
        this.version++;
    }
    find(id) { return this.events.find(e => e.id === id); }
    /** A plain, rounded view of the log for diffing and inspection. */
    dump() {
        return this.events.map(e => ({ id: e.id, t: +e.t.toFixed(2), dur: +e.dur.toFixed(2), op: e.op, actor: e.actor, target: e.target, frame: e.frame, result: e.result, reason: e.reason || null }));
    }
}
//# sourceMappingURL=log.js.map