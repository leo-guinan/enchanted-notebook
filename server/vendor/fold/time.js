/** Time structures that sit beside the log: keyframe tracks (cameras, or anything numeric), timelines of
 * clips (captions, lines of dialogue, cues), loudness envelopes that drive mouths and meters, and the
 * stager that places actions against a timeline. */
import { clamp, ease as quadEase, lerp } from './math.js';
export class Track {
    opts;
    keys;
    constructor(keys = [], opts = {}) {
        this.opts = opts;
        this.keys = keys;
    }
    add(...keys) { this.keys.push(...keys); return this; }
    /** Hold `values` from t0 to t1. */
    hold(t0, t1, values) { this.keys.push([t0, ...values], [t1, ...values]); return this; }
    sort() { this.keys.sort((a, b) => a[0] - b[0]); return this; }
    clear() { this.keys.length = 0; return this; }
    /** Values at time t: eased between surrounding keys, held before the first and after the last. */
    at(t) {
        const K = this.keys, ease = this.opts.ease ?? quadEase;
        if (!K.length)
            return (this.opts.fallback ?? []).slice();
        if (t <= K[0][0])
            return K[0].slice(1);
        for (let i = 1; i < K.length; i++)
            if (t <= K[i][0]) {
                const a = K[i - 1], b = K[i], k = ease(clamp((t - a[0]) / Math.max(1e-6, b[0] - a[0])));
                return a.slice(1).map((v, j) => lerp(v, b[j + 1], k));
            }
        return K[K.length - 1].slice(1);
    }
}
/** A camera value [zoom, cx, cy] as a canvas transform: world point (cx, cy) at the centre of a stage of
 * size w × h, magnified by zoom, on a surface drawn at `scale` device pixels per stage unit. */
export function cameraMatrix(cam, stage, scale = 1) {
    const [z, cx, cy] = cam;
    return [scale * z, 0, 0, scale * z, scale * (stage.w / 2 - cx * z), scale * (stage.h / 2 - cy * z)];
}
/** A list of timed items (captions, lines, cues). Items can be any shape: give accessors for their times. */
export class Timeline {
    items;
    time;
    constructor(items = [], time = { t0: (x) => x.t0, t1: (x) => x.t1 }) {
        this.items = items;
        this.time = time;
    }
    /** The first item playing at t. `tail` trims each item's end (so a speaker isn't "still talking" during the last syllable's decay). */
    at(t, tail = 0) { return this.items.find(x => t >= this.time.t0(x) && t < this.time.t1(x) - tail); }
    all(t, tail = 0) { return this.items.filter(x => t >= this.time.t0(x) && t < this.time.t1(x) - tail); }
    get end() { return this.items.reduce((m, x) => Math.max(m, this.time.t1(x)), 0); }
}
/** Turns per-line loudness envelopes into a signal per speaker: level(who, t) in 0..1, linearly interpolated.
 * This is what drives mouths, meters and speaker glows, so they open on syllables rather than on a loop. */
export class Envelopes {
    lines;
    rate;
    steps;
    /** lines must be sorted by t0. */
    constructor(lines, rate = 30, steps = 9) {
        this.lines = lines;
        this.rate = rate;
        this.steps = steps;
    }
    level(who, t) {
        for (const r of this.lines) {
            if (t < r.t0)
                break;
            if (t >= r.t1 || r.who !== who)
                continue;
            const env = r.env;
            if (!env)
                return 0;
            const x = (t - r.t0) * this.rate, i = Math.floor(x), f = x - i;
            if (typeof env === 'string') {
                const a = +(env[i] || 0), b = +(env[i + 1] || 0);
                return (a + (b - a) * f) / this.steps;
            }
            const a = env[i] ?? 0, b = env[i + 1] ?? 0;
            return a + (b - a) * f;
        }
        return 0;
    }
    /** Is `who` speaking at t (inside one of their lines)? */
    active(who, t) { return this.lines.some(r => r.who === who && t >= r.t0 && t < r.t1); }
    speaker(t) { return this.lines.find(r => t >= r.t0 && t < r.t1)?.who; }
}
/** Quantize a loudness series (any scale) to the compact digit form, relative to its own 95th percentile. */
export function quantizeEnvelope(values, steps = 9, curve = .8) {
    const sorted = [...values].sort((a, b) => a - b);
    const ref = sorted[Math.floor(.95 * (sorted.length - 1))] || 1;
    return values.map(v => String(Math.min(steps, Math.round(steps * Math.pow(Math.min(1, v / ref), curve))))).join('');
}
/** Places one actor's actions on cue, one at a time: each starts at its cue or right after the previous one
 * ends (plus a gap), whichever is later. Beats pushed far past their cue are recorded in `slips`, so a scene
 * can fail its tests when the staging no longer fits the soundtrack. */
export class Stager {
    world;
    opts;
    last = -1;
    slips = [];
    constructor(world, opts = {}) {
        this.world = world;
        this.opts = opts;
    }
    at(cue, ev) {
        const gap = this.opts.gap ?? .45, tol = this.opts.tolerance ?? 1.5;
        const s = Math.max(cue, this.last + gap);
        if (s > cue + tol)
            this.slips.push([ev.target, +cue.toFixed(2), +s.toFixed(2)]);
        const e = this.world.emit({ ...this.opts.defaults, ...ev, t: s }, this.opts.emit);
        this.opts.after?.(e);
        this.last = e.t + e.dur;
        return e;
    }
}
//# sourceMappingURL=time.js.map