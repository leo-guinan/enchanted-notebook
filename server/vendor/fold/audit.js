/** Checks every production should be able to pass, whatever its style. They test the scene (the log, its
 * timing, its replay), not pixels, so they stay meaningful when the look changes. */
import { dist } from './math.js';
/** No event is refused, and the replay agrees with the log about every verdict. */
export function cleanReplay(world, name = 'The log replays cleanly: nothing refused, no disagreements') {
    const r = world.report();
    return { name, pass: !r.denied.length && !r.mismatches.length, detail: `${world.log.events.length} events, ${r.denied.length} refused, ${r.mismatches.length} disagreements` };
}
/** Replay agrees with the log (refusals allowed, as long as the log recorded them). */
export function consistentReplay(world, name = 'The replay agrees with every verdict in the log') {
    const r = world.report();
    return { name, pass: !r.mismatches.length, detail: `${world.log.events.length} events, ${r.mismatches.length} disagreements` + (r.mismatches[0] ? ` (first: ${r.mismatches[0].e.id})` : '') };
}
/** Building the scene twice gives the same log. */
export function deterministic(build, name = 'Deterministic: building twice gives the same log') {
    const a = JSON.stringify(build().log.dump()), b = JSON.stringify(build().log.dump());
    return { name, pass: a === b, detail: a === b ? 'identical' : 'the logs differ' };
}
/** An actor does one thing at a time. */
export function oneAtATime(world, actor, name = `${actor} does one thing at a time`) {
    const L = world.log.events.filter((e) => e.actor === actor && e.result !== 'denied' && e.dur > 0 && e.t >= 0).sort((a, b) => a.t - b.t);
    let worst = 0;
    for (let i = 1; i < L.length; i++)
        worst = Math.max(worst, L[i - 1].t + L[i - 1].dur - L[i].t);
    return { name, pass: worst <= 1e-6, detail: `${L.length} events, worst overlap ${worst.toFixed(3)} s` };
}
/** Every span (a line of dialogue) has a caption showing when it starts. */
export function captioned(lines, captions, name = 'Every line has a caption when it plays') {
    const miss = lines.filter(l => !captions.at(l.t0 + .05));
    return { name, pass: !miss.length, detail: `${lines.length} lines, ${miss.length} without a caption` };
}
/** Beats placed by a Stager landed on their cues. */
export function onCue(slips, name = 'Every beat lands on its cue') {
    return { name, pass: !slips.length, detail: `${slips.length} beats late` };
}
/** A point that should move smoothly never jumps more than `max` between samples. */
export function continuous(f, times, hz, max, name = 'Continuous motion') {
    let worst = 0, at = 0, n = 0;
    for (const t0 of times)
        for (let k = -hz / 4; k < hz / 4; k++) {
            const t = t0 + k / hz, d = dist(f(t), f(t + 1 / hz));
            n++;
            if (d > worst) {
                worst = d;
                at = t;
            }
        }
    return { name, pass: worst < max, detail: `${n} samples, largest step ${worst.toFixed(2)} at ${at.toFixed(2)} s` };
}
/** A cut is continuous and stays inside the scene. */
export function cutFits(cut, sceneEnd, name = 'The cut is continuous and inside the scene') {
    const seams = cut.seams();
    const out = cut.shots.filter(s => s.src0 < 0 || s.src0 + (s.T1 - s.T0) * s.rate > sceneEnd);
    return { name, pass: !seams.length && !out.length, detail: `${cut.shots.length} shots, ${seams.length} seams, ${out.length} outside the scene` };
}
export function summarize(results) {
    return { pass: results.filter(r => r.pass).length, total: results.length, failed: results.filter(r => !r.pass) };
}
//# sourceMappingURL=audit.js.map