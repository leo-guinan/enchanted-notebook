/** Productions and styles. A production gathers what a film needs over time (a world, its camera, its
 * timeline, an optional cut and a sound source). A style is everything about how it looks: given a view
 * (time, state, frames, camera, layout), it draws. The engine never draws; styles never keep time. */
import { cameraMatrix } from './time.js';
/** Work out the view at output time T without drawing. */
export function viewAt(p, T, opts = {}) {
    const mapped = p.cut ? p.cut.map(T) : { t: T, shot: undefined };
    const t = mapped.t, shot = mapped.shot;
    const frames = p.world.frames(t);
    const state = p.world.stateAt(t);
    const shotCam = shot && opts.layout ? shot.cams?.[opts.layout.name] : undefined;
    const camera = shotCam ? shotCam.slice() : typeof p.camera === 'function' ? p.camera(t) : p.camera ? p.camera.at(t) : [1, p.stage.w / 2, p.stage.h / 2];
    const scale = opts.scale ?? 1;
    return { T, t, state, frames, camera, matrix: cameraMatrix(camera, p.stage, scale), layout: opts.layout, shot, stage: p.stage, scale };
}
/** Draw output time T with a style. Clears the surface first. */
export function renderFrame(surface, p, style, T, opts = {}) {
    const view = viewAt(p, T, opts);
    surface.setTransform(1, 0, 0, 1, 0, 0);
    surface.clearRect(0, 0, surface.canvas.width, surface.canvas.height);
    style.draw(surface, view, p);
    return view;
}
//# sourceMappingURL=render.js.map