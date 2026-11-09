/** Cuts and layouts. A cut is an edit list over a scene: output time T maps to scene time t, shot by shot,
 * each shot with its own speed and its own camera per layout. Trailers, recaps and alternate edits are cuts,
 * not new scenes, so everything in them (mouths, eye-lines, sound) stays in sync with the original.
 * A layout is an output shape: which part of the stage is shown, and at what size. */
export class Cut {
    spec;
    shots;
    end;
    constructor(spec) {
        this.spec = spec;
        this.shots = spec.shots;
        this.end = spec.end ?? (this.shots.length ? this.shots[this.shots.length - 1].T1 : 0);
    }
    /** The shot showing at output time T (the last shot holds past the end). */
    shotAt(T) { for (const s of this.shots)
        if (T < s.T1)
            return s; return this.shots[this.shots.length - 1]; }
    /** Scene time at output time T. */
    map(T) {
        const shot = this.shotAt(T);
        return { t: shot.src0 + Math.max(0, T - shot.T0) * shot.rate, shot };
    }
    /** Gaps or overlaps between consecutive shots (should be empty). */
    seams(eps = 1e-6) {
        const out = [];
        for (let i = 1; i < this.shots.length; i++)
            if (Math.abs(this.shots[i].T0 - this.shots[i - 1].T1) > eps)
                out.push(i);
        return out;
    }
}
/** The whole stage, scaled to an output size. */
export const fullStage = (name, stage, output) => ({ name, crop: { x: 0, y: 0, w: stage.w, h: stage.h }, output });
/** A full-height column of the stage at a given aspect (w/h), centred: a vertical cut of a landscape stage. */
export const centreColumn = (name, stage, aspect, output) => {
    const w = stage.h * aspect;
    return { name, crop: { x: (stage.w - w) / 2, y: 0, w, h: stage.h }, output };
};
//# sourceMappingURL=cut.js.map