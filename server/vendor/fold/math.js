/** Small, exact math shared by the engine and by styles. These definitions are load-bearing: replays and
 * pixel-identical exports depend on every caller doing the same arithmetic in the same order. */
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
/** Quadratic ease in-out. */
export const ease = (t) => (t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const smoothstep = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const easeSine = (t) => .5 - .5 * Math.cos(Math.PI * clamp(t));
/** smoothstep of t mapped from [a, b]. */
export const smooth = (a, b, t) => smoothstep((t - a) / (b - a));
export const lerp2 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
export const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
/** Progress of an interval that starts at t0 and lasts dur, at time t. A zero-length interval is complete. */
export const progress = (t, t0, dur) => (dur ? clamp((t - t0) / dur) : 1);
/** A stable small hash of any value's string form (for seeding per-id variation). */
export const hashStr = (s) => { let h = 7; for (const ch of String(s))
    h = (h * 31 + ch.charCodeAt(0)) % 1000003; return h; };
/** A seeded random generator (mulberry32). Styles that want variation must use a seed, never Math.random. */
export function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
//# sourceMappingURL=math.js.map