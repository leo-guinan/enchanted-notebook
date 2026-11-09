/** Frames: nested coordinate spaces. A frame is a rectangle (x, y, w, h) in its parent, holding a local space
 * of size lw × lh. Anything placed in a frame moves, scales and hides with it. The root has no parent.
 * Frames are derived from the log at a time t (see World.frames), never stored separately. */
const parentOf = (tree, f) => (f.parent == null ? undefined : tree[f.parent]);
export const toParent = (f, p) => [f.x + p[0] * f.w / f.lw, f.y + p[1] * f.h / f.lh];
export const fromParent = (f, p) => [(p[0] - f.x) * f.lw / f.w, (p[1] - f.y) * f.lh / f.h];
/** A point in frame `fid`'s local space, in world (root) coordinates. */
export function toWorld(tree, fid, p) {
    let f = tree[fid];
    while (f && f.parent) {
        p = toParent(f, p);
        f = tree[f.parent];
    }
    return p;
}
/** The chain of frames from the root down to `fid`. */
export function chain(tree, fid) {
    const c = [];
    let f = tree[fid];
    while (f) {
        c.unshift(f);
        f = parentOf(tree, f);
    }
    return c;
}
/** A world point, in frame `fid`'s local space. */
export function worldTo(tree, fid, p) {
    for (const f of chain(tree, fid))
        if (f.parent)
            p = fromParent(f, p);
    return p;
}
/** How much one local unit of `fid` measures in world units. */
export function frameScale(tree, fid) {
    let s = 1, f = tree[fid];
    while (f && f.parent) {
        s *= f.w / f.lw;
        f = tree[f.parent];
    }
    return s;
}
/** True if `a` is `b` or contains it. */
export function isAncestor(tree, a, b) {
    let f = tree[b];
    while (f) {
        if (f.id === a)
            return true;
        f = parentOf(tree, f);
    }
    return false;
}
export const pathOf = (tree, fid) => (tree[fid] ? chain(tree, fid).map(f => f.id).join(' › ') : fid);
/** Fill in every node's depth. */
export function setDepths(tree) {
    for (const f of Object.values(tree)) {
        let d = 0, p = f;
        while (p.parent) {
            d++;
            p = tree[p.parent];
            if (!p)
                break;
        }
        f.depth = d;
    }
}
//# sourceMappingURL=frames.js.map