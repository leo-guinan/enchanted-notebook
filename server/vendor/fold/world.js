/** The world: a log plus the rules for reading it. A world defines ops (what each kind of event does to
 * state, and when it is refused), derives its frame tree from the log, and folds the log into the state
 * at any time t. Folding is pure: the same log and the same t always give the same state.
 *
 * Every event is re-checked during the fold, so a log that was edited (or written by hand) can't smuggle in
 * an action the world would have refused. If the replay disagrees with what the log recorded, the
 * disagreement is reported (onMismatch) instead of silently trusted. */
import { Log } from './log.js';
import { setDepths } from './frames.js';
import { clamp } from './math.js';
export class World {
    config;
    log = new Log();
    ops = new Map();
    rules;
    fcache = new Map();
    scache = new Map();
    passes = [];
    constructor(config) {
        this.config = config;
        this.rules = [...(config.rules || [])];
        for (const [op, spec] of Object.entries(config.ops || {}))
            this.define(op, spec);
    }
    get version() { return this.log.version; }
    define(op, spec) {
        this.ops.set(op, spec);
        const ps = new Set(this.passes);
        for (const h of hooksOf(spec))
            ps.add(h.pass);
        this.passes = [...ps].sort((a, b) => a - b);
        this.log.touch();
        return this;
    }
    rule(r) { this.rules.push(r); this.log.touch(); return this; }
    /** The frame tree as of time t (Infinity: every frame the log will ever make, at its final layout). */
    frames(t = Infinity) {
        const key = this.version + '|' + t;
        const hit = this.fcache.get(key);
        if (hit)
            return hit;
        const tree = { [this.config.root.id]: { ...this.config.root } };
        for (const pass of this.passes)
            for (const e of this.log.events) {
                if (e.result === 'denied')
                    continue;
                const spec = this.ops.get(e.op);
                if (!spec)
                    continue;
                for (const h of hooksOf(spec))
                    if (h.pass === pass)
                        h.apply(tree, e, t);
            }
        setDepths(tree);
        if (this.fcache.size > (this.config.cache?.frames ?? 4000))
            this.fcache.clear();
        this.fcache.set(key, tree);
        return tree;
    }
    /** The world's verdict on an event against a state: null if allowed, else the reason. */
    check(state, e, frames) {
        const ctx = { world: this, frames: frames ?? this.frames() };
        for (const r of this.rules) {
            const v = r(state, e, ctx);
            if (v !== undefined)
                return v;
        }
        const spec = this.ops.get(e.op);
        return spec?.check ? (spec.check(state, e, ctx) ?? null) : null;
    }
    /** Apply one event to a state at time t: re-check it, report refusals and disagreements, else apply its op. */
    step(state, e, t, frames, report) {
        const p = e.dur ? clamp((t - e.t) / e.dur) : 1;
        const reason = this.check(state, e, this.config.checkFrames === 'fold' ? frames : this.frames(e.t));
        const denied = e.result === 'denied' || !!reason;
        if ((e.result === 'denied') !== !!reason) {
            report?.mismatches.push({ e, logged: e.result, replayed: reason });
            this.config.onMismatch?.(state, e, reason);
        }
        if (denied) {
            report?.denied.push({ e, reason: reason || e.reason });
            this.config.onDenied?.(state, e, reason || e.reason, t);
            return;
        }
        this.ops.get(e.op)?.apply?.(state, e, p, t, { world: this, frames });
    }
    /** Fold a given list of events (in the order given) into a fresh state, at time t. Not cached. */
    foldEvents(events, t, frames = this.frames(t), report) {
        const S = this.config.initial();
        for (const e of events) {
            if (e.t > t)
                continue;
            this.step(S, e, t, frames, report);
        }
        return S;
    }
    /** Replay the whole log at time t and report every refusal and every disagreement with the log. */
    report(t = Infinity) {
        const r = { denied: [], mismatches: [] };
        const frames = this.frames(t);
        const unbind = this.config.bindFrames?.(frames);
        try {
            this.foldEvents(this.log.events, t, frames, r);
        }
        finally {
            unbind?.();
        }
        return r;
    }
    /** The state at time t. Cached until the log changes. */
    stateAt(t) {
        const key = this.version + '|' + t;
        const hit = this.scache.get(key);
        if (hit)
            return hit;
        const frames = this.frames(t);
        const unbind = this.config.bindFrames?.(frames);
        let S;
        try {
            S = this.foldEvents(this.log.events, t, frames);
        }
        finally {
            unbind?.();
        }
        if (this.scache.size > (this.config.cache?.states ?? 300))
            this.scache.clear();
        this.scache.set(key, S);
        return S;
    }
    /** Add an event, checked against the world just before it starts. A refused event is kept, marked denied. */
    emit(input, opts = {}) {
        const e = this.log.add(input);
        const frames = this.frames(opts.frameTime ?? e.t);
        const unbind = this.config.bindFrames?.(frames);
        let reason;
        try {
            reason = this.check(this.stateAt(e.t - 1e-4), e, frames);
        }
        finally {
            unbind?.();
        }
        if (reason) {
            e.result = 'denied';
            e.reason = reason;
            this.config.decorateDenied?.(e, reason);
            this.log.touch();
        }
        return e;
    }
    /** Clear the caches (they also clear themselves when the log changes version). */
    invalidate() { this.fcache.clear(); this.scache.clear(); this.log.touch(); }
}
function hooksOf(spec) {
    return spec.layout ? (Array.isArray(spec.layout) ? spec.layout : [spec.layout]) : [];
}
//# sourceMappingURL=world.js.map