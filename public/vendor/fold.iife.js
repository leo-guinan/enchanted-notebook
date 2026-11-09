"use strict";
var Fold = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/index.ts
  var index_exports = {};
  __export(index_exports, {
    Cut: () => Cut,
    Envelopes: () => Envelopes,
    LiveAudio: () => LiveAudio,
    Log: () => Log,
    Player: () => Player,
    Stager: () => Stager,
    Timeline: () => Timeline,
    Track: () => Track,
    World: () => World,
    byTime: () => byTime,
    cameraMatrix: () => cameraMatrix,
    captioned: () => captioned,
    centreColumn: () => centreColumn,
    chain: () => chain,
    clamp: () => clamp,
    cleanReplay: () => cleanReplay,
    consistentReplay: () => consistentReplay,
    continuous: () => continuous,
    cutFits: () => cutFits,
    deterministic: () => deterministic,
    dist: () => dist,
    ease: () => ease,
    easeSine: () => easeSine,
    encodeWav: () => encodeWav,
    exposeHooks: () => exposeHooks,
    frameScale: () => frameScale,
    fromParent: () => fromParent,
    fullStage: () => fullStage,
    hashStr: () => hashStr,
    isAncestor: () => isAncestor,
    lerp: () => lerp,
    lerp2: () => lerp2,
    onCue: () => onCue,
    oneAtATime: () => oneAtATime,
    pathOf: () => pathOf,
    progress: () => progress,
    quantizeEnvelope: () => quantizeEnvelope,
    renderFrame: () => renderFrame,
    renderOffline: () => renderOffline,
    rng: () => rng,
    setDepths: () => setDepths,
    smooth: () => smooth,
    smoothstep: () => smoothstep,
    summarize: () => summarize,
    toBase64: () => toBase64,
    toParent: () => toParent,
    toWorld: () => toWorld,
    viewAt: () => viewAt,
    worldTo: () => worldTo
  });

  // src/math.ts
  var lerp = (a, b, t) => a + (b - a) * t;
  var clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  var ease = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  var smoothstep = (t) => {
    t = clamp(t);
    return t * t * (3 - 2 * t);
  };
  var easeSine = (t) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t));
  var smooth = (a, b, t) => smoothstep((t - a) / (b - a));
  var lerp2 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
  var dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  var progress = (t, t0, dur) => dur ? clamp((t - t0) / dur) : 1;
  var hashStr = (s) => {
    let h = 7;
    for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 1000003;
    return h;
  };
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = a + 1831565813 >>> 0;
      let t = a;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // src/log.ts
  var byTime = (a, b) => a.t - b.t || +a.id.slice(1) - +b.id.slice(1);
  var Log = class {
    /** Every event, sorted by time. The array is mutated in place, so a reference to it stays valid. */
    events = [];
    /** Every event in the order it was added. */
    inserted = [];
    next = 1;
    /** Bumped on every change. Caches of anything derived from the log key on it. */
    version = 0;
    add(ev) {
      const e = ev;
      e.id = e.id || "e" + this.next++;
      e.result = e.result || "ok";
      this.events.push(e);
      this.inserted.push(e);
      this.events.sort(byTime);
      this.version++;
      return e;
    }
    /** Mark the log changed after editing an event in place (for example, when it is denied). */
    touch() {
      this.version++;
    }
    clear() {
      this.events.length = 0;
      this.inserted.length = 0;
      this.next = 1;
      this.version++;
    }
    /** Drop everything after time t (for re-staging from a point). */
    keepUntil(t) {
      const keep = (a) => {
        const k = a.filter((e) => e.t <= t);
        a.length = 0;
        a.push(...k);
      };
      keep(this.events);
      keep(this.inserted);
      this.version++;
    }
    snapshot() {
      return { events: this.events.slice(), inserted: this.inserted.slice(), next: this.next };
    }
    restore(s) {
      this.events.length = 0;
      this.events.push(...s.events);
      this.inserted.length = 0;
      this.inserted.push(...s.inserted);
      this.next = s.next;
      this.version++;
    }
    find(id) {
      return this.events.find((e) => e.id === id);
    }
    /** A plain, rounded view of the log for diffing and inspection. */
    dump() {
      return this.events.map((e) => ({ id: e.id, t: +e.t.toFixed(2), dur: +e.dur.toFixed(2), op: e.op, actor: e.actor, target: e.target, frame: e.frame, result: e.result, reason: e.reason || null }));
    }
  };

  // src/frames.ts
  var parentOf = (tree, f) => f.parent == null ? void 0 : tree[f.parent];
  var toParent = (f, p) => [f.x + p[0] * f.w / f.lw, f.y + p[1] * f.h / f.lh];
  var fromParent = (f, p) => [(p[0] - f.x) * f.lw / f.w, (p[1] - f.y) * f.lh / f.h];
  function toWorld(tree, fid, p) {
    let f = tree[fid];
    while (f && f.parent) {
      p = toParent(f, p);
      f = tree[f.parent];
    }
    return p;
  }
  function chain(tree, fid) {
    const c = [];
    let f = tree[fid];
    while (f) {
      c.unshift(f);
      f = parentOf(tree, f);
    }
    return c;
  }
  function worldTo(tree, fid, p) {
    for (const f of chain(tree, fid)) if (f.parent) p = fromParent(f, p);
    return p;
  }
  function frameScale(tree, fid) {
    let s = 1, f = tree[fid];
    while (f && f.parent) {
      s *= f.w / f.lw;
      f = tree[f.parent];
    }
    return s;
  }
  function isAncestor(tree, a, b) {
    let f = tree[b];
    while (f) {
      if (f.id === a) return true;
      f = parentOf(tree, f);
    }
    return false;
  }
  var pathOf = (tree, fid) => tree[fid] ? chain(tree, fid).map((f) => f.id).join(" \u203A ") : fid;
  function setDepths(tree) {
    for (const f of Object.values(tree)) {
      let d = 0, p = f;
      while (p.parent) {
        d++;
        p = tree[p.parent];
        if (!p) break;
      }
      f.depth = d;
    }
  }

  // src/world.ts
  var World = class {
    constructor(config) {
      this.config = config;
      this.rules = [...config.rules || []];
      for (const [op, spec] of Object.entries(config.ops || {})) this.define(op, spec);
    }
    config;
    log = new Log();
    ops = /* @__PURE__ */ new Map();
    rules;
    fcache = /* @__PURE__ */ new Map();
    scache = /* @__PURE__ */ new Map();
    passes = [];
    get version() {
      return this.log.version;
    }
    define(op, spec) {
      this.ops.set(op, spec);
      const ps = new Set(this.passes);
      for (const h of hooksOf(spec)) ps.add(h.pass);
      this.passes = [...ps].sort((a, b) => a - b);
      this.log.touch();
      return this;
    }
    rule(r) {
      this.rules.push(r);
      this.log.touch();
      return this;
    }
    /** The frame tree as of time t (Infinity: every frame the log will ever make, at its final layout). */
    frames(t = Infinity) {
      const key = this.version + "|" + t;
      const hit = this.fcache.get(key);
      if (hit) return hit;
      const tree = { [this.config.root.id]: { ...this.config.root } };
      for (const pass of this.passes) for (const e of this.log.events) {
        if (e.result === "denied") continue;
        const spec = this.ops.get(e.op);
        if (!spec) continue;
        for (const h of hooksOf(spec)) if (h.pass === pass) h.apply(tree, e, t);
      }
      setDepths(tree);
      if (this.fcache.size > (this.config.cache?.frames ?? 4e3)) this.fcache.clear();
      this.fcache.set(key, tree);
      return tree;
    }
    /** The world's verdict on an event against a state: null if allowed, else the reason. */
    check(state, e, frames) {
      const ctx = { world: this, frames: frames ?? this.frames() };
      for (const r of this.rules) {
        const v = r(state, e, ctx);
        if (v !== void 0) return v;
      }
      const spec = this.ops.get(e.op);
      return spec?.check ? spec.check(state, e, ctx) ?? null : null;
    }
    /** Apply one event to a state at time t: re-check it, report refusals and disagreements, else apply its op. */
    step(state, e, t, frames, report) {
      const p = e.dur ? clamp((t - e.t) / e.dur) : 1;
      const reason = this.check(state, e, this.config.checkFrames === "fold" ? frames : this.frames(e.t));
      const denied = e.result === "denied" || !!reason;
      if (e.result === "denied" !== !!reason) {
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
        if (e.t > t) continue;
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
      } finally {
        unbind?.();
      }
      return r;
    }
    /** The state at time t. Cached until the log changes. */
    stateAt(t) {
      const key = this.version + "|" + t;
      const hit = this.scache.get(key);
      if (hit) return hit;
      const frames = this.frames(t);
      const unbind = this.config.bindFrames?.(frames);
      let S;
      try {
        S = this.foldEvents(this.log.events, t, frames);
      } finally {
        unbind?.();
      }
      if (this.scache.size > (this.config.cache?.states ?? 300)) this.scache.clear();
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
      } finally {
        unbind?.();
      }
      if (reason) {
        e.result = "denied";
        e.reason = reason;
        this.config.decorateDenied?.(e, reason);
        this.log.touch();
      }
      return e;
    }
    /** Clear the caches (they also clear themselves when the log changes version). */
    invalidate() {
      this.fcache.clear();
      this.scache.clear();
      this.log.touch();
    }
  };
  function hooksOf(spec) {
    return spec.layout ? Array.isArray(spec.layout) ? spec.layout : [spec.layout] : [];
  }

  // src/time.ts
  var Track = class {
    constructor(keys = [], opts = {}) {
      this.opts = opts;
      this.keys = keys;
    }
    opts;
    keys;
    add(...keys) {
      this.keys.push(...keys);
      return this;
    }
    /** Hold `values` from t0 to t1. */
    hold(t0, t1, values) {
      this.keys.push([t0, ...values], [t1, ...values]);
      return this;
    }
    sort() {
      this.keys.sort((a, b) => a[0] - b[0]);
      return this;
    }
    clear() {
      this.keys.length = 0;
      return this;
    }
    /** Values at time t: eased between surrounding keys, held before the first and after the last. */
    at(t) {
      const K = this.keys, ease2 = this.opts.ease ?? ease;
      if (!K.length) return (this.opts.fallback ?? []).slice();
      if (t <= K[0][0]) return K[0].slice(1);
      for (let i = 1; i < K.length; i++) if (t <= K[i][0]) {
        const a = K[i - 1], b = K[i], k = ease2(clamp((t - a[0]) / Math.max(1e-6, b[0] - a[0])));
        return a.slice(1).map((v, j) => lerp(v, b[j + 1], k));
      }
      return K[K.length - 1].slice(1);
    }
  };
  function cameraMatrix(cam, stage, scale = 1) {
    const [z, cx, cy] = cam;
    return [scale * z, 0, 0, scale * z, scale * (stage.w / 2 - cx * z), scale * (stage.h / 2 - cy * z)];
  }
  var Timeline = class {
    constructor(items = [], time = { t0: (x) => x.t0, t1: (x) => x.t1 }) {
      this.items = items;
      this.time = time;
    }
    items;
    time;
    /** The first item playing at t. `tail` trims each item's end (so a speaker isn't "still talking" during the last syllable's decay). */
    at(t, tail = 0) {
      return this.items.find((x) => t >= this.time.t0(x) && t < this.time.t1(x) - tail);
    }
    all(t, tail = 0) {
      return this.items.filter((x) => t >= this.time.t0(x) && t < this.time.t1(x) - tail);
    }
    get end() {
      return this.items.reduce((m, x) => Math.max(m, this.time.t1(x)), 0);
    }
  };
  var Envelopes = class {
    /** lines must be sorted by t0. */
    constructor(lines, rate = 30, steps = 9) {
      this.lines = lines;
      this.rate = rate;
      this.steps = steps;
    }
    lines;
    rate;
    steps;
    level(who, t) {
      for (const r of this.lines) {
        if (t < r.t0) break;
        if (t >= r.t1 || r.who !== who) continue;
        const env = r.env;
        if (!env) return 0;
        const x = (t - r.t0) * this.rate, i = Math.floor(x), f = x - i;
        if (typeof env === "string") {
          const a2 = +(env[i] || 0), b2 = +(env[i + 1] || 0);
          return (a2 + (b2 - a2) * f) / this.steps;
        }
        const a = env[i] ?? 0, b = env[i + 1] ?? 0;
        return a + (b - a) * f;
      }
      return 0;
    }
    /** Is `who` speaking at t (inside one of their lines)? */
    active(who, t) {
      return this.lines.some((r) => r.who === who && t >= r.t0 && t < r.t1);
    }
    speaker(t) {
      return this.lines.find((r) => t >= r.t0 && t < r.t1)?.who;
    }
  };
  function quantizeEnvelope(values, steps = 9, curve = 0.8) {
    const sorted = [...values].sort((a, b) => a - b);
    const ref = sorted[Math.floor(0.95 * (sorted.length - 1))] || 1;
    return values.map((v) => String(Math.min(steps, Math.round(steps * Math.pow(Math.min(1, v / ref), curve))))).join("");
  }
  var Stager = class {
    constructor(world, opts = {}) {
      this.world = world;
      this.opts = opts;
    }
    world;
    opts;
    last = -1;
    slips = [];
    at(cue, ev) {
      const gap = this.opts.gap ?? 0.45, tol = this.opts.tolerance ?? 1.5;
      const s = Math.max(cue, this.last + gap);
      if (s > cue + tol) this.slips.push([ev.target, +cue.toFixed(2), +s.toFixed(2)]);
      const e = this.world.emit({ ...this.opts.defaults, ...ev, t: s }, this.opts.emit);
      this.opts.after?.(e);
      this.last = e.t + e.dur;
      return e;
    }
  };

  // src/cut.ts
  var Cut = class {
    constructor(spec) {
      this.spec = spec;
      this.shots = spec.shots;
      this.end = spec.end ?? (this.shots.length ? this.shots[this.shots.length - 1].T1 : 0);
    }
    spec;
    shots;
    end;
    /** The shot showing at output time T (the last shot holds past the end). */
    shotAt(T) {
      for (const s of this.shots) if (T < s.T1) return s;
      return this.shots[this.shots.length - 1];
    }
    /** Scene time at output time T. */
    map(T) {
      const shot = this.shotAt(T);
      return { t: shot.src0 + Math.max(0, T - shot.T0) * shot.rate, shot };
    }
    /** Gaps or overlaps between consecutive shots (should be empty). */
    seams(eps = 1e-6) {
      const out = [];
      for (let i = 1; i < this.shots.length; i++) if (Math.abs(this.shots[i].T0 - this.shots[i - 1].T1) > eps) out.push(i);
      return out;
    }
  };
  var fullStage = (name, stage, output) => ({ name, crop: { x: 0, y: 0, w: stage.w, h: stage.h }, output });
  var centreColumn = (name, stage, aspect, output) => {
    const w = stage.h * aspect;
    return { name, crop: { x: (stage.w - w) / 2, y: 0, w, h: stage.h }, output };
  };

  // src/render.ts
  function viewAt(p, T, opts = {}) {
    const mapped = p.cut ? p.cut.map(T) : { t: T, shot: void 0 };
    const t = mapped.t, shot = mapped.shot;
    const frames = p.world.frames(t);
    const state = p.world.stateAt(t);
    const shotCam = shot && opts.layout ? shot.cams?.[opts.layout.name] : void 0;
    const camera = shotCam ? shotCam.slice() : typeof p.camera === "function" ? p.camera(t) : p.camera ? p.camera.at(t) : [1, p.stage.w / 2, p.stage.h / 2];
    const scale = opts.scale ?? 1;
    return { T, t, state, frames, camera, matrix: cameraMatrix(camera, p.stage, scale), layout: opts.layout, shot, stage: p.stage, scale };
  }
  function renderFrame(surface, p, style, T, opts = {}) {
    const view = viewAt(p, T, opts);
    surface.setTransform(1, 0, 0, 1, 0, 0);
    surface.clearRect(0, 0, surface.canvas.width, surface.canvas.height);
    style.draw(surface, view, p);
    return view;
  }

  // src/sound.ts
  async function renderOffline(source, duration, sampleRate = 48e3, channels = 2, cut) {
    const ctx = new OfflineAudioContext(channels, Math.ceil(sampleRate * duration), sampleRate);
    await source.load?.(ctx);
    if (!cut) {
      source.create(ctx, ctx.destination).schedule(0, duration, (x) => x, 1);
      return ctx.startRendering();
    }
    for (const sh of cut.shots) {
      const gate = shotGate(ctx, sh, (T) => T);
      gate.connect(ctx.destination);
      source.create(ctx, gate).schedule(sh.src0, sh.src0 + (sh.T1 - sh.T0) * sh.rate, (s) => sh.T0 + (s - sh.src0) / sh.rate, sh.rate);
    }
    return ctx.startRendering();
  }
  function shotGate(ctx, sh, at) {
    const g = ctx.createGain(), a = at(sh.T0), b = at(sh.T1), e = 4e-3;
    g.gain.setValueAtTime(0, 0);
    if (a > e) g.gain.setValueAtTime(0, a - e);
    g.gain.linearRampToValueAtTime(1, Math.max(a, 0) + e);
    g.gain.setValueAtTime(1, Math.max(b - e, a + e));
    g.gain.linearRampToValueAtTime(0, b + e);
    return g;
  }
  function encodeWav(buf, ceiling = 0.89) {
    const nc = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate, bpf = 2 * nc;
    const chs = Array.from({ length: nc }, (_, c) => buf.getChannelData(c));
    const ab = new ArrayBuffer(44 + n * bpf), dv = new DataView(ab);
    const ws = (o, s) => {
      for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i));
    };
    ws(0, "RIFF");
    dv.setUint32(4, 36 + n * bpf, true);
    ws(8, "WAVE");
    ws(12, "fmt ");
    dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true);
    dv.setUint16(22, nc, true);
    dv.setUint32(24, sr, true);
    dv.setUint32(28, sr * bpf, true);
    dv.setUint16(32, bpf, true);
    dv.setUint16(34, 16, true);
    ws(36, "data");
    dv.setUint32(40, n * bpf, true);
    let pk = 0;
    for (let i = 0; i < n; i++) for (const ch of chs) pk = Math.max(pk, Math.abs(ch[i]));
    const gn = ceiling != null && pk > ceiling ? ceiling / pk : 1;
    for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) dv.setInt16(44 + i * bpf + c * 2, Math.max(-1, Math.min(1, chs[c][i] * gn)) * 32767, true);
    return { wav: ab, peak: pk };
  }
  function toBase64(ab) {
    const u = new Uint8Array(ab);
    let bin = "";
    for (let i = 0; i < u.length; i += 32768) bin += String.fromCharCode.apply(null, Array.from(u.subarray(i, i + 32768)));
    return btoa(bin);
  }
  var LiveAudio = class {
    constructor(source, host, opts = {}) {
      this.source = source;
      this.host = host;
      this.opts = opts;
    }
    source;
    host;
    opts;
    ctx = null;
    sounder = null;
    enabled = true;
    acBase = 0;
    tBase = 0;
    schedTo = 0;
    timer = null;
    shots = /* @__PURE__ */ new Map();
    /** Create the context (needs a user gesture in browsers). */
    async init() {
      if (this.ctx || !this.source) return;
      try {
        const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
        this.ctx = new AC();
        await this.source.load?.(this.ctx);
        if (!this.opts.cut) this.sounder = this.source.create(this.ctx, this.ctx.destination);
      } catch {
        this.ctx = null;
        this.sounder = null;
      }
      if (!this.timer) this.timer = setInterval(() => this.pump(), this.opts.tick ?? 25);
    }
    get running() {
      return !!this.ctx && this.ctx.state === "running";
    }
    /** Scene time now: from the audio clock while playing, else the host's time. */
    now() {
      return this.host.playing() && this.running ? this.tBase + (this.ctx.currentTime - this.acBase) * this.host.speed() : this.host.time();
    }
    /** Re-anchor the clock at the host's current time (after a seek, pause or play). */
    sync() {
      if (this.ctx) {
        this.acBase = this.ctx.currentTime;
        this.tBase = this.host.time();
        this.schedTo = this.host.time();
        this.sounder?.silence?.();
        for (const { s, gate } of this.shots.values()) {
          s.silence?.();
          gate.disconnect();
        }
        this.shots.clear();
      }
      this.tBase = this.host.time();
    }
    pump() {
      if (!this.host.playing() || !this.ctx || !this.enabled || this.ctx.state !== "running") return;
      const speed = this.host.speed(), horizon = this.now() + (this.opts.lookahead ?? 0.15) * speed;
      if (horizon <= this.schedTo) return;
      const from = Math.max(this.schedTo, this.now());
      const acBase = this.acBase, tBase = this.tBase, out = (T) => acBase + (T - tBase) / speed;
      const cut = this.opts.cut;
      if (!cut) this.sounder?.schedule(from, horizon, out, speed);
      else cut.shots.forEach((sh, i) => {
        const a = Math.max(from, sh.T0), b = Math.min(horizon, sh.T1);
        if (a >= b) return;
        let entry = this.shots.get(i);
        if (!entry) {
          const gate = shotGate(this.ctx, sh, out);
          gate.connect(this.ctx.destination);
          entry = { s: this.source.create(this.ctx, gate), gate };
          this.shots.set(i, entry);
        }
        entry.s.schedule(sh.src0 + (a - sh.T0) * sh.rate, sh.src0 + (b - sh.T0) * sh.rate, (s) => out(sh.T0 + (s - sh.src0) / sh.rate), speed * sh.rate);
      });
      this.schedTo = horizon;
    }
  };

  // src/host.ts
  function exposeHooks(hooks, name = "__fold") {
    globalThis[name] = hooks;
    return hooks;
  }
  var Player = class {
    constructor(opts) {
      this.opts = opts;
      const p = opts.production;
      this.scale = opts.scale ?? (globalThis.devicePixelRatio || 1);
      opts.canvas.width = Math.round(p.stage.w * this.scale);
      opts.canvas.height = Math.round(p.stage.h * this.scale);
      this.surface = opts.canvas.getContext("2d");
      this.layout = p.layouts?.[0];
      this.audio = new LiveAudio(p.sound ?? null, { playing: () => this.playing, time: () => this.T, speed: () => this.speed }, { cut: p.cut });
    }
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
    get production() {
      return this.opts.production;
    }
    async setup() {
      await this.opts.style.setup?.(this.surface, this.production);
    }
    /** Draw output time T now. */
    draw(T = this.T) {
      const v = renderFrame(this.surface, this.production, this.opts.style, T, { layout: this.layout, scale: this.scale });
      this.opts.onFrame?.(v);
      return v;
    }
    seek(T) {
      this.T = Math.max(0, Math.min(this.production.duration(), T));
      this.audio.sync();
      this.dirty = true;
    }
    async play() {
      await this.audio.init();
      await this.audio.ctx?.resume();
      if (this.T >= this.production.duration()) this.T = 0;
      this.playing = true;
      this.audio.sync();
      this.dirty = true;
    }
    pause() {
      this.playing = false;
      this.audio.sync();
      this.dirty = true;
    }
    invalidate() {
      this.dirty = true;
    }
    /** Start the animation-frame loop. */
    start() {
      const frame = (now) => {
        const dt = Math.min(0.1, (now - this.last) / 1e3 || 0);
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
    stop() {
      cancelAnimationFrame(this.raf);
    }
    /** The export hooks for this player. */
    hooks(extra = {}) {
      const p = this.production;
      return {
        ready: true,
        duration: () => p.duration(),
        seek: (T) => {
          this.T = T;
          this.draw(T);
        },
        layouts: () => p.layouts || [],
        setLayout: (name) => {
          this.layout = p.layouts?.find((l) => l.name === name) ?? this.layout;
          this.dirty = true;
        },
        surface: () => ({ w: p.stage.w, h: p.stage.h, scale: this.scale }),
        renderAudio: p.sound ? async (sr = 48e3) => {
          const dur = p.duration() + 0.5;
          const buf = await renderOffline(p.sound, dur, sr, 2, p.cut);
          const { wav, peak } = encodeWav(buf);
          return { b64: toBase64(wav), peak, dur };
        } : void 0,
        dump: () => p.world.log.dump(),
        ...extra
      };
    }
  };

  // src/audit.ts
  function cleanReplay(world, name = "The log replays cleanly: nothing refused, no disagreements") {
    const r = world.report();
    return { name, pass: !r.denied.length && !r.mismatches.length, detail: `${world.log.events.length} events, ${r.denied.length} refused, ${r.mismatches.length} disagreements` };
  }
  function consistentReplay(world, name = "The replay agrees with every verdict in the log") {
    const r = world.report();
    return { name, pass: !r.mismatches.length, detail: `${world.log.events.length} events, ${r.mismatches.length} disagreements` + (r.mismatches[0] ? ` (first: ${r.mismatches[0].e.id})` : "") };
  }
  function deterministic(build, name = "Deterministic: building twice gives the same log") {
    const a = JSON.stringify(build().log.dump()), b = JSON.stringify(build().log.dump());
    return { name, pass: a === b, detail: a === b ? "identical" : "the logs differ" };
  }
  function oneAtATime(world, actor, name = `${actor} does one thing at a time`) {
    const L = world.log.events.filter((e) => e.actor === actor && e.result !== "denied" && e.dur > 0 && e.t >= 0).sort((a, b) => a.t - b.t);
    let worst = 0;
    for (let i = 1; i < L.length; i++) worst = Math.max(worst, L[i - 1].t + L[i - 1].dur - L[i].t);
    return { name, pass: worst <= 1e-6, detail: `${L.length} events, worst overlap ${worst.toFixed(3)} s` };
  }
  function captioned(lines, captions, name = "Every line has a caption when it plays") {
    const miss = lines.filter((l) => !captions.at(l.t0 + 0.05));
    return { name, pass: !miss.length, detail: `${lines.length} lines, ${miss.length} without a caption` };
  }
  function onCue(slips, name = "Every beat lands on its cue") {
    return { name, pass: !slips.length, detail: `${slips.length} beats late` };
  }
  function continuous(f, times, hz, max, name = "Continuous motion") {
    let worst = 0, at = 0, n = 0;
    for (const t0 of times) for (let k = -hz / 4; k < hz / 4; k++) {
      const t = t0 + k / hz, d = dist(f(t), f(t + 1 / hz));
      n++;
      if (d > worst) {
        worst = d;
        at = t;
      }
    }
    return { name, pass: worst < max, detail: `${n} samples, largest step ${worst.toFixed(2)} at ${at.toFixed(2)} s` };
  }
  function cutFits(cut, sceneEnd, name = "The cut is continuous and inside the scene") {
    const seams = cut.seams();
    const out = cut.shots.filter((s) => s.src0 < 0 || s.src0 + (s.T1 - s.T0) * s.rate > sceneEnd);
    return { name, pass: !seams.length && !out.length, detail: `${cut.shots.length} shots, ${seams.length} seams, ${out.length} outside the scene` };
  }
  function summarize(results) {
    return { pass: results.filter((r) => r.pass).length, total: results.length, failed: results.filter((r) => !r.pass) };
  }
  return __toCommonJS(index_exports);
})();
//# sourceMappingURL=fold.iife.js.map
