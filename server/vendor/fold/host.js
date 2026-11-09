/** The browser host: a player that keeps time, renders on demand, plays sound in sync, and exposes the hooks
 * the export tools use. A page needs a canvas, a production and a style; everything else is optional. */
import { renderFrame } from './render.js';
import { LiveAudio, encodeWav, renderOffline, toBase64 } from './sound.js';
export function exposeHooks(hooks, name = '__fold') {
    globalThis[name] = hooks;
    return hooks;
}
export class Player {
    opts;
    T = 0;
    playing = false;
    speed = 1;
    layout;
    surface;
    audio;
    dirty = true;
    last = 0;
    raf = 0;
    scale;
    constructor(opts) {
        this.opts = opts;
        const p = opts.production;
        this.scale = opts.scale ?? (globalThis.devicePixelRatio || 1);
        opts.canvas.width = Math.round(p.stage.w * this.scale);
        opts.canvas.height = Math.round(p.stage.h * this.scale);
        this.surface = opts.canvas.getContext('2d');
        this.layout = p.layouts?.[0];
        this.audio = new LiveAudio(p.sound ?? null, { playing: () => this.playing, time: () => this.T, speed: () => this.speed }, { cut: p.cut });
    }
    get production() { return this.opts.production; }
    async setup() { await this.opts.style.setup?.(this.surface, this.production); }
    /** Draw output time T now. */
    draw(T = this.T) {
        const v = renderFrame(this.surface, this.production, this.opts.style, T, { layout: this.layout, scale: this.scale });
        this.opts.onFrame?.(v);
        return v;
    }
    seek(T) { this.T = Math.max(0, Math.min(this.production.duration(), T)); this.audio.sync(); this.dirty = true; }
    async play() { await this.audio.init(); await this.audio.ctx?.resume(); if (this.T >= this.production.duration())
        this.T = 0; this.playing = true; this.audio.sync(); this.dirty = true; }
    pause() { this.playing = false; this.audio.sync(); this.dirty = true; }
    invalidate() { this.dirty = true; }
    /** Start the animation-frame loop. */
    start() {
        const frame = (now) => {
            const dt = Math.min(.1, (now - this.last) / 1000 || 0);
            this.last = now;
            if (this.playing) {
                this.T = this.audio.running ? this.audio.now() : this.T + dt * this.speed;
                if (this.T >= this.production.duration()) {
                    this.T = this.production.duration();
                    this.pause();
                }
                this.dirty = true;
            }
            if (this.dirty) {
                this.draw(this.T);
                this.dirty = false;
            }
            this.raf = requestAnimationFrame(frame);
        };
        this.raf = requestAnimationFrame(frame);
    }
    stop() { cancelAnimationFrame(this.raf); }
    /** The export hooks for this player. */
    hooks(extra = {}) {
        const p = this.production;
        return {
            ready: true,
            duration: () => p.duration(),
            seek: (T) => { this.T = T; this.draw(T); },
            layouts: () => p.layouts || [],
            setLayout: (name) => { this.layout = p.layouts?.find(l => l.name === name) ?? this.layout; this.dirty = true; },
            surface: () => ({ w: p.stage.w, h: p.stage.h, scale: this.scale }),
            renderAudio: p.sound ? async (sr = 48000) => {
                const dur = p.duration() + .5;
                const buf = await renderOffline(p.sound, dur, sr, 2, p.cut);
                const { wav, peak } = encodeWav(buf);
                return { b64: toBase64(wav), peak, dur };
            } : undefined,
            dump: () => p.world.log.dump(),
            ...extra,
        };
    }
}
//# sourceMappingURL=host.js.map